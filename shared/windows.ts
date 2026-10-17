import type { ForecastHour } from "./types";
export interface WorkWindow {
  start: string;
  end: string;
  restricted: boolean;
  reason: string;
}
export function workWindows(
  hours: ForecastHour[],
  timezone: string,
  soilThreshold: number,
  task: "installation" | "mobilization",
): WorkWindow[] {
  const daytime = hours.filter((h) => {
    const hour = Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        hour: "2-digit",
        hourCycle: "h23",
      }).format(new Date(h.time)),
    );
    return hour >= 6 && hour < 18;
  });
  const windows: WorkWindow[] = [];
  for (const h of daytime) {
    const restricted =
      task === "installation" ? h.heat[2] >= 103 : h.soil[2] >= soilThreshold;
    const previous = windows.at(-1);
    if (
      previous &&
      previous.restricted === restricted &&
      Date.parse(previous.end) === Date.parse(h.time)
    )
      previous.end = new Date(Date.parse(h.time) + 3600000).toISOString();
    else
      windows.push({
        start: h.time,
        end: new Date(Date.parse(h.time) + 3600000).toISOString(),
        restricted,
        reason: restricted
          ? task === "installation"
            ? "Heat controls required"
            : "Inspect ground before access"
          : "Below model screening threshold",
      });
  }
  return windows;
}
