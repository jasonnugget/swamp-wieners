import type { Alert, Forecast, ModelBundle, Site } from "../../shared/types";
import { features, heatIndex, predict } from "../../shared/model";
import { localParts, nextDate } from "../../shared/clock";

export async function fetchWeather(
  site: Site,
  models: ModelBundle,
  now: number,
): Promise<Forecast> {
  const date = nextDate(localParts(now, site.timezone).date);
  const params = new URLSearchParams({
    latitude: String(site.latitude),
    longitude: String(site.longitude),
    hourly:
      "temperature_2m_previous_day2,relative_humidity_2m_previous_day2,precipitation_previous_day2,wind_speed_10m_previous_day2",
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
  const data = (await r.json()) as {
    hourly: Record<string, (number | null)[]> & { time: unknown };
  };
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
  return {
    siteId: site.id,
    mode: "live",
    fetchedAt: new Date(now).toISOString(),
    modelVersion: models.version,
    antecedentRain24,
    hours,
  };
}
export async function fetchAlerts(site: Site): Promise<Alert[]> {
  const r = await fetch(
    `https://api.weather.gov/alerts/active?point=${site.latitude},${site.longitude}`,
    {
      headers: {
        "User-Agent": "PlanIT-Control-Hackathon (local prototype)",
        Accept: "application/geo+json",
      },
      signal: AbortSignal.timeout(20000),
    },
  );
  if (!r.ok) throw new Error(`NWS HTTP ${r.status}`);
  const data = (await r.json()) as {
    features: {
      id: string;
      properties: {
        event: string;
        headline: string;
        severity: string;
        expires: string;
      };
    }[];
  };
  return data.features.map((f) => {
    const p = f.properties,
      event = p.event.toLowerCase();
    const category: Alert["category"] = /flood/.test(event)
      ? "flood"
      : /fire|red flag/.test(event)
        ? "wildfire"
        : /heat/.test(event)
          ? "heat"
          : "weather";
    return {
      id: `${site.id}:${f.id}`,
      siteId: site.id,
      category,
      title: p.headline || p.event,
      severity: p.severity === "Extreme" ? 10 : p.severity === "Severe" ? 7 : 3,
      expiresAt: p.expires,
      mode: "live",
    };
  });
}
