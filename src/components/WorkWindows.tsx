import { useState } from "react";
import type { ForecastHour } from "../../shared/types";
import { workWindows } from "../../shared/windows";
export default function WorkWindows({
  hours,
  timezone,
  soilThreshold,
}: {
  hours: ForecastHour[];
  timezone: string;
  soilThreshold: number;
}) {
  const [task, setTask] = useState<"installation" | "mobilization">(
    "installation",
  );
  const windows = workWindows(hours, timezone, soilThreshold, task);
  const format = (t: string) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(t));
  return (
    <div className="work-windows">
      <div className="windows-heading">
        <strong>Forecast work windows</strong>
        <select
          aria-label="Forecast work task"
          value={task}
          onChange={(e) => setTask(e.target.value as typeof task)}
        >
          <option value="installation">Outdoor installation</option>
          <option value="mobilization">Equipment access</option>
        </select>
      </div>
      <div className="windows-track">
        {windows.map((w) => (
          <div
            key={w.start}
            className={w.restricted ? "restricted" : "lower"}
            style={{
              flex: (Date.parse(w.end) - Date.parse(w.start)) / 3600000,
            }}
            title={`${format(w.start)}–${format(w.end)}: ${w.reason}`}
          />
        ))}
      </div>
      <div className="windows-list">
        {windows.map((w) => (
          <span key={w.start}>
            <i className={w.restricted ? "restricted" : "lower"} />
            <strong>
              {format(w.start)}–{format(w.end)}
            </strong>
            {w.reason}
          </span>
        ))}
      </div>
      <p>
        Model screening only. Active holds and unknown hazard coverage still
        apply.
      </p>
    </div>
  );
}
