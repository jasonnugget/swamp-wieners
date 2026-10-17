import type {
  Alert,
  Category,
  Decision,
  Forecast,
  HazardChannel,
  HazardReport,
  Site,
  Strike,
  Task,
  TaskState,
  WeatherScreening,
} from "./types";
export const POLICY_VERSION = "demo-policy-2";
export const TASKS: Task[] = ["mobilization", "installation", "preparation"];
export const CATEGORIES: Category[] = [
  "weather",
  "heat",
  "lightning",
  "flood",
  "wildfire",
  "soil",
  "wildlife",
];
export const TASK_LABELS: Record<Task, string> = {
  mobilization: "Equipment mobilization",
  installation: "Outdoor installation",
  preparation: "Sheltered preparation",
};
export const CATEGORY_LABELS: Record<Category, string> = {
  weather: "Weather",
  heat: "Extreme heat",
  lightning: "Lightning",
  flood: "Flooding",
  wildfire: "Fire weather",
  soil: "Ground wetness",
  wildlife: "Wildlife",
};
export function distanceMiles(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  const rad = Math.PI / 180,
    dl = (b.latitude - a.latitude) * rad,
    dn = (b.longitude - a.longitude) * rad;
  const h =
    Math.sin(dl / 2) ** 2 +
    Math.cos(a.latitude * rad) *
      Math.cos(b.latitude * rad) *
      Math.sin(dn / 2) ** 2;
  return (
    3958.7613 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)))
  );
}
export function lightningUntil(
  site: Site,
  strikes: Strike[],
  now: number,
): string | null {
  const times = strikes
    .filter((s) => Date.parse(s.time) <= now && distanceMiles(site, s) <= 10)
    .map((s) => Date.parse(s.time) + 30 * 60000)
    .filter((t) => t > now);
  return times.length ? new Date(Math.max(...times)).toISOString() : null;
}
export function interpolate(value: number, points: number[], scores: number[]) {
  if (value <= points[0]) return scores[0];
  for (let i = 1; i < points.length; i++)
    if (value <= points[i])
      return (
        scores[i - 1] +
        ((scores[i] - scores[i - 1]) * (value - points[i - 1])) /
          (points[i] - points[i - 1])
      );
  return scores[scores.length - 1];
}
const rank: Record<TaskState, number> = {
  AVAILABLE: 0,
  UNKNOWN: 1,
  RESTRICTED: 2,
  HOLD: 3,
};
export function decide(
  site: Site,
  forecast: Forecast | undefined,
  reports: HazardReport[],
  strikes: Strike[],
  alerts: Alert[],
  now: number,
  soilThresholds: number[] = [0.2, 0.3, 0.4],
  screening?: WeatherScreening,
  screeningNow = now,
  screeningHorizonHours = 24,
): Decision {
  const active = reports.filter(
    (r) => r.siteId === site.id && r.status === "open",
  );
  const until = lightningUntil(site, strikes, now);
  const known =
    !!forecast?.hours.length &&
    forecast.hours.every(
      (h) =>
        h.heat.length === 3 &&
        h.soil.length === 3 &&
        [...h.heat, ...h.soil, h.wind, h.precipitation].every(Number.isFinite),
    ) &&
    (forecast.mode === "live"
      ? now >= Date.parse(forecast.fetchedAt) &&
        now - Date.parse(forecast.fetchedAt) < 3 * 3600000
      : forecast.hours.some(
          (h) =>
            Date.parse(h.time) >= now - 86400000 &&
            Date.parse(h.time) <= now + 48 * 3600000,
        ));
  const heat = known
    ? Math.max(...forecast!.hours.map((h) => h.heat[2]))
    : null;
  const soil = known
    ? Math.max(...forecast!.hours.map((h) => h.soil[2]))
    : null;
  const heatScore =
    heat === null ? null : interpolate(heat, [80, 90, 103, 125], [0, 3, 7, 10]);
  const soilScore =
    soil === null ? null : interpolate(soil, soilThresholds, [0, 7, 10]);
  const taskChannels: HazardChannel[] = [];
  const freshScreening = screening?.siteId === site.id &&
    screeningNow >= Date.parse(screening.fetchedAt) &&
    screeningNow - Date.parse(screening.fetchedAt) < 3 * 3600000 &&
    screeningNow >= Date.parse(screening.issuedAt) &&
    screeningNow - Date.parse(screening.issuedAt) < 24 * 3600000;
  const screenHours = freshScreening ? screening!.hours.filter(h =>
    Date.parse(h.time) >= screeningNow - 3600000 && Date.parse(h.time) < screeningNow + screeningHorizonHours * 3600000) : [];
  const peakValue = (key: "heatIndex" | "windKmh") => {
    const values = screenHours.map(h => h[key]).filter((n): n is number => typeof n === "number" && Number.isFinite(n));
    return values.length ? Math.max(...values) : null;
  };
  const officialHeat = peakValue("heatIndex"), officialWind = peakValue("windKmh");
  const channels: HazardChannel[] = CATEGORIES.map((category) => {
    const matching = alerts.filter(
      (a) =>
        a.siteId === site.id &&
        a.category === category &&
        Date.parse(a.expiresAt) > now,
    );
    const report = active.find((r) => r.category === category);
    const base: HazardChannel = {
      category,
      severity: null,
      status: "UNKNOWN",
      title: "Coverage unavailable",
      detail: "No verified feed. Check conditions on site.",
      mode: "live",
      source: "No connected source",
    };
    if (category === "heat" && heat !== null)
      Object.assign(base, {
        severity: heatScore,
        status: heatScore! >= 7 ? "RESTRICTED" : "AVAILABLE",
        title: `${Math.round(heat)}°F upper estimate`,
        detail:
          "Peak forecast heat index. Prototype heat policy; review site controls.",
        mode: forecast!.mode,
        source: "HeatCast · modeled heat index",
      });
    if (category === "soil" && soil !== null)
      Object.assign(base, {
        severity: soilScore,
        status: soil >= soilThresholds[1] ? "RESTRICTED" : "AVAILABLE",
        title: `${soil.toFixed(3)} m³/m³`,
        detail:
          "Upper soil-moisture estimate. High wetness requires ground inspection.",
        mode: forecast!.mode,
        source: "GroundCast · reanalysis-trained proxy",
      });
    if (category === "weather" && known) {
      const wind = Math.max(...forecast!.hours.map((h) => h.wind));
      Object.assign(base, {
        severity: wind >= 50 ? 7 : wind >= 30 ? 3 : 0,
        status: wind >= 50 ? "RESTRICTED" : "AVAILABLE",
        title: `${Math.round(wind)} km/h peak wind`,
        detail: "Wind screening; rainfall and temperature shown in forecast.",
        mode: forecast!.mode,
        source: "Open-Meteo weather forecast",
      });
    }
    if (base.severity === null && (category === "heat" || category === "weather")) {
      const value = category === "heat" ? officialHeat : officialWind;
      if (value !== null) {
        const severity = category === "heat"
          ? interpolate(value, [80, 90, 103, 125], [0, 3, 7, 10])
          : value >= 50 ? 7 : value >= 30 ? 3 : 0;
        Object.assign(base, {
          severity, status: severity >= 7 ? "RESTRICTED" : "AVAILABLE",
          title: category === "heat" ? `${Math.round(value)}°F forecast heat index` : `${Math.round(value)} km/h peak wind`,
          detail: `${screeningHorizonHours === 24 ? "Next 24 hours" : "Selected briefing period"} from NOAA/NWS. ${category === "heat" ? "Heat index derived from forecast temperature and humidity." : "Wind screening from hourly forecasts."} Other hazards require separate verification. Issued ${screening!.issuedAt}.`,
          mode: "live", source: "NOAA/NWS · forecast screening (not custom ML)",
        });
      }
    }
    if (category === "lightning")
      Object.assign(
        base,
        until
          ? {
              severity: 10,
              status: "HOLD",
              title: "Stop outdoor work",
              detail:
                "Strike within 10 miles. Wait 30 minutes from the latest strike.",
              mode: "simulated",
              source: "Demonstration strike replay",
            }
          : {
              detail: "Replay ready. No live strike detector connected.",
              mode: "simulated",
              source: "Demonstration strike replay",
            },
      );
    if (category === "flood" && site.riverScreening && known) {
      const rain = forecast!.hours.reduce((sum, h) => sum + h.precipitation, 0);
      const antecedent = forecast!.antecedentRain24 ?? 0;
      if (rain >= 25 || antecedent >= 25)
        Object.assign(base, {
          severity: 7,
          status: "RESTRICTED",
          title: "River-site rainfall screen",
          detail: `${antecedent.toFixed(1)} mm estimated prior-day rain; ${rain.toFixed(1)} mm next-day forecast. Inspect access; this is not a river-stage forecast.`,
          mode: forecast!.mode,
          source: "Rainfall + curated river-site flag",
        });
    }
    if (matching.length) {
      const worst = matching.sort((a, b) => b.severity - a.severity)[0];
      Object.assign(base, {
        severity: Math.max(base.severity ?? 0, worst.severity),
        status: worst.severity >= 10 ? "HOLD" : "RESTRICTED",
        title: worst.title,
        detail: "Official alert. Review the source and local response plan.",
        mode: worst.mode,
        source: "National Weather Service",
      });
    }
    taskChannels.push({ ...base });
    if (report)
      Object.assign(base, {
        severity: Math.max(base.severity ?? 0, 10),
        status: "HOLD",
        title: "Unresolved crew report",
        detail: report.description,
        mode: "crew",
        source: `Crew · ${report.author}`,
      });
    return base;
  });
  const tasks = TASKS.map((task) => {
    let state: TaskState = "AVAILABLE";
    const reasons: string[] = [];
    const apply = (s: TaskState, reason: string) => {
      if (rank[s] > rank[state]) state = s;
      if (s !== "AVAILABLE") reasons.push(reason);
    };
    if (task !== "preparation") {
      for (const c of taskChannels) {
        if (c.category === "soil" && task !== "mobilization") continue;
        if (c.category === "heat" && task !== "installation") continue;
        apply(c.status, `${CATEGORY_LABELS[c.category]}: ${c.title}`);
      }
    }
    for (const report of active)
      if (report.tasks.includes(task))
        apply(
          "HOLD",
          `Crew report ${report.id.slice(0, 8)}: ${report.description}`,
        );
    return { task, state, reasons };
  });
  const scores = channels
    .map((c) => c.severity)
    .filter((n): n is number => n !== null);
  return {
    siteId: site.id,
    index: scores.length ? Math.round(Math.max(...scores) * 10) / 10 : null,
    policyVersion: POLICY_VERSION,
    tasks,
    channels,
    lightningUntil: until,
    unknownCount: channels.filter((c) => c.severity === null).length,
  };
}
