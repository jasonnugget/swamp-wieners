import type { ForecastHour } from "../../shared/types";
export default function ForecastChart({
  hours,
  reveal = false,
  ground = false,
  timezone = "America/New_York",
}: {
  hours: (ForecastHour & { actualHeat?: number; actualSoil?: number })[];
  reveal?: boolean;
  ground?: boolean;
  timezone?: string;
}) {
  if (!hours.length) return <p className="empty">No forecast available.</p>;
  const values = hours.flatMap((h) => (ground ? h.soil : h.heat));
  const min = ground
    ? Math.max(0, Math.min(...values) - 0.02)
    : Math.floor((Math.min(...values) - 5) / 10) * 10;
  const max = ground
    ? Math.max(...values) + 0.02
    : Math.ceil((Math.max(...values) + 5) / 10) * 10;
  const x = (i: number) => 48 + (i * 664) / Math.max(1, hours.length - 1),
    y = (v: number) => 175 - ((v - min) / (max - min)) * 140;
  const quant = (h: ForecastHour) => (ground ? h.soil : h.heat);
  const line = (f: (h: (typeof hours)[number]) => number) =>
    hours
      .map((h, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(f(h)).toFixed(1)}`)
      .join(" ");
  const band =
    hours.map((h, i) => `${i ? "L" : "M"}${x(i)},${y(quant(h)[2])}`).join(" ") +
    " " +
    [...hours]
      .reverse()
      .map((h, i) => `L${x(hours.length - 1 - i)},${y(quant(h)[0])}`)
      .join(" ") +
    " Z";
  return (
    <div className="chart">
      <svg
        role="img"
        aria-label={`${ground ? "Soil moisture" : "Heat index"} forecast with uncertainty interval`}
        viewBox="0 0 750 215"
      >
        {[0, 1, 2, 3].map((i) => {
          const v = min + ((max - min) * i) / 3;
          return (
            <g key={i}>
              <line
                x1="48"
                x2="712"
                y1={y(v)}
                y2={y(v)}
                stroke="#e4e8df"
                strokeDasharray="3 4"
              />
              <text
                x="35"
                y={y(v) + 4}
                textAnchor="end"
                fill="#869180"
                fontSize="10"
              >
                {ground ? v.toFixed(2) : Math.round(v) + "°"}
              </text>
            </g>
          );
        })}
        {!ground && 103 >= min && 103 <= max && (
          <g>
            <line
              x1="48"
              x2="712"
              y1={y(103)}
              y2={y(103)}
              stroke="#dca16d"
              strokeDasharray="4 5"
            />
            <text
              x="710"
              y={y(103) - 5}
              textAnchor="end"
              fill="#b97840"
              fontSize="9"
            >
              103°F · demo restriction threshold
            </text>
          </g>
        )}
        <path d={band} fill={ground ? "#89b5a5" : "#b9db8f"} opacity=".24" />
        {!ground && (
          <path
            d={line((h) => h.baselineHeat)}
            stroke="#a6afa1"
            strokeWidth="1.5"
            strokeDasharray="5 5"
            fill="none"
          />
        )}
        <path
          d={line((h) => quant(h)[1])}
          stroke={ground ? "#397363" : "#4b7637"}
          strokeWidth="2.5"
          fill="none"
        />
        {reveal &&
          hours.every(
            (h) => typeof (ground ? h.actualSoil : h.actualHeat) === "number",
          ) && (
            <path
              d={line((h) => (ground ? h.actualSoil : h.actualHeat)!)}
              stroke="#bd7e48"
              strokeWidth="2"
              fill="none"
            />
          )}
        {hours
          .filter((_, i) => i % 4 === 0)
          .map((h) => (
            <text
              key={h.time}
              x={x(hours.indexOf(h))}
              y="202"
              textAnchor="middle"
              fill="#869180"
              fontSize="10"
            >
              {new Intl.DateTimeFormat("en-US", {
                timeZone: timezone,
                hour: "numeric",
              }).format(new Date(h.time))}
            </text>
          ))}
      </svg>
      <div className="legend">
        <span>
          <i className={ground ? "teal" : "green"} />
          Model median
        </span>
        <span>
          <i className="band" />
          10–90% interval
        </span>
        {!ground && (
          <span>
            <i className="gray" />
            Public forecast
          </span>
        )}
        {reveal && (
          <span>
            <i className="orange" />
            Reanalysis outcome
          </span>
        )}
      </div>
    </div>
  );
}
