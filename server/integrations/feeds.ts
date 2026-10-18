import type { Forecast, HazardForecast, HazardHour, HazardModelBundle, ModelBundle, Site } from "../../shared/types";
import { features, heatIndex, predict } from "../../shared/model";
import { localParts, nextDate } from "../../shared/clock";
import { dailyHazardFeatures, hazardForecast } from "../../shared/hazard-model";

type Hourly = Record<string, (number | null)[]> & { time: unknown };
const HAZARD_VARIABLES = ["temperature_2m", "relative_humidity_2m", "precipitation", "wind_speed_10m", "wind_gusts_10m", "cape", "dew_point_2m"];

export async function fetchWeather(
  site: Site,
  models: ModelBundle,
  now: number,
  hazardModel?: HazardModelBundle,
): Promise<{ forecast: Forecast; hazard: HazardForecast | null }> {
  const date = nextDate(localParts(now, site.timezone).date);
  const params = new URLSearchParams({
    latitude: String(site.latitude),
    longitude: String(site.longitude),
    hourly: HAZARD_VARIABLES.map(v => `${v}_previous_day2`).join(","),
    models: "gfs_seamless",
    timezone: "UTC",
    past_days: "7",
    forecast_days: "3",
  });
  const r = await fetch(
    `https://previous-runs-api.open-meteo.com/v1/forecast?${params}`,
    { signal: AbortSignal.timeout(25000) },
  );
  if (!r.ok) throw new Error(`Weather HTTP ${r.status}`);
  const data = (await r.json()) as { hourly: Hourly };
  const h = data.hourly;
  const times = h.time as unknown as string[];
  const hours = [];
  for (let i = 168; i < times.length; i++) {
    const time = times[i] + "Z";
    if (localParts(Date.parse(time), site.timezone).date !== date) continue;
    const values = [
      "temperature_2m",
      "relative_humidity_2m",
      "precipitation",
      "wind_speed_10m",
    ].map((k) => h[`${k}_previous_day2`][i]);
    const history = h.precipitation_previous_day2.slice(i - 168, i);
    if (
      values.some((v) => typeof v !== "number" || !Number.isFinite(v)) ||
      history.some((v) => typeof v !== "number")
    )
      continue;
    const [temperature, humidity, precipitation, wind] = values as number[];
    const x = features(
      time,
      site,
      temperature,
      humidity,
      precipitation,
      wind,
      (history as number[]).reduce((s, v) => s + v, 0),
    );
    const baselineHeat = heatIndex(temperature, humidity);
    hours.push({
      time,
      issuedAt: new Date(Date.parse(time) - 48 * 3600000).toISOString(),
      x,
      temperature,
      humidity,
      precipitation,
      wind,
      baselineHeat,
      heat: predict(models.heat, x, baselineHeat),
      soil: predict(models.soil, x).map((v) => Math.max(0, Math.min(1, v))),
    });
  }
  if (!hours.length) throw new Error("No valid next-day forecast returned");
  const firstIndex = times.indexOf(hours[0].time.replace(/Z$/, ""));
  const antecedentRain24 =
    firstIndex >= 24
      ? h.precipitation_previous_day2
          .slice(firstIndex - 24, firstIndex)
          .reduce<number>((sum, value) => sum + (value ?? 0), 0)
      : undefined;
  const fetchedAt = new Date(now).toISOString();
  return {
    forecast: { siteId: site.id, mode: "live", fetchedAt, modelVersion: models.version, antecedentRain24, hours },
    hazard: hazardModel ? liveHazardForecast(site, models, hazardModel, h, times, now) : null,
  };
}

// Today's and tomorrow's site-local HazardCast days from the same 48h-lead hourly fields.
// Sites outside the trained FL/LA/MS set have no traits and stay unknown.
export function liveHazardForecast(site: Site, models: ModelBundle, bundle: HazardModelBundle, h: Hourly, times: string[], now: number): HazardForecast | null {
  const traits = bundle.siteTraits[site.id], soilP90 = models.soilThresholds[site.id]?.[1];
  if (!traits || soilP90 === undefined) return null;
  const value = (k: string, i: number) => { const v = h[`${k}_previous_day2`]?.[i]; return typeof v === "number" && Number.isFinite(v) ? v : NaN; };
  const today = localParts(now, site.timezone).date, dates = [today, nextDate(today)];
  const days = dates.map(date => {
    const index = times.flatMap((t, i) => localParts(Date.parse(t + "Z"), site.timezone).date === date ? [i] : []);
    if (!index.length || index[0] < 168) return { date, x: null };
    const hours: HazardHour[] = index.map(i => {
      const [temperature, humidity, precipitation, wind, gust, cape, dewPoint] = HAZARD_VARIABLES.map(k => value(k, i));
      const history = h.precipitation_previous_day2.slice(i - 168, i);
      const ok = [temperature, humidity, precipitation, wind].every(Number.isFinite) && history.every(v => typeof v === "number");
      const x = ok ? features(times[i] + "Z", site, temperature, humidity, precipitation, wind, (history as number[]).reduce((sum, v) => sum + v, 0)) : null;
      return { time: times[i] + "Z", temperature, humidity, precipitation, wind, gust, cape, dewPoint,
        heatcastP90: x ? predict(models.heat, x, heatIndex(temperature, humidity))[2] : NaN,
        groundcastP90: x ? Math.max(0, Math.min(1, predict(models.soil, x)[2])) : NaN };
    });
    const prior = h.precipitation_previous_day2.slice(index[0] - 168, index[0]);
    return { date, x: dailyHazardFeatures(date, site, hours, prior, soilP90, traits) };
  });
  return hazardForecast(bundle, site.id, "live", new Date(now).toISOString(), new Date(now - 48 * 3600000).toISOString(), days);
}
export { fetchAlerts } from "./nws";
