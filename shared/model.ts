import type { ModelBundle, Network, Sample, ForecastHour, Site } from "./types";

export function heatIndex(celsius: number, humidity: number): number {
  const t = (celsius * 9) / 5 + 32;
  const simple = 0.5 * (t + 61 + (t - 68) * 1.2 + humidity * 0.094);
  if ((simple + t) / 2 < 80) return simple;
  let hi =
    -42.379 +
    2.04901523 * t +
    10.14333127 * humidity -
    0.22475541 * t * humidity -
    0.00683783 * t * t -
    0.05481717 * humidity * humidity +
    0.00122874 * t * t * humidity +
    0.00085282 * t * humidity * humidity -
    0.00000199 * t * t * humidity * humidity;
  if (humidity < 13 && t >= 80 && t <= 112)
    hi -= ((13 - humidity) / 4) * Math.sqrt((17 - Math.abs(t - 95)) / 17);
  if (humidity > 85 && t >= 80 && t <= 87)
    hi += (((humidity - 85) / 10) * (87 - t)) / 5;
  return hi;
}
export function predict(network: Network, x: number[], baseline = 0): number[] {
  let values = x.map((v, i) => (v - network.mean[i]) / network.std[i]);
  for (const [index, layer] of network.layers.entries()) {
    values = layer.bias.map((b, j) => {
      const v =
        b + values.reduce((sum, a, i) => sum + a * layer.weights[i][j], 0);
      return index < network.layers.length - 1 ? Math.max(0, v) : v;
    });
  }
  const out = values
    .map(
      (v) =>
        v * network.targetScale +
        network.targetOffset +
        (network.residual ? baseline : 0),
    )
    .sort((a, b) => a - b);
  out[0] -= network.intervalAdjustment;
  out[2] += network.intervalAdjustment;
  return out;
}
export function forecastSample(
  bundle: ModelBundle,
  sample: Sample,
): ForecastHour {
  return {
    time: sample.time,
    issuedAt: sample.issuedAt,
    heat: predict(bundle.heat, sample.x, sample.baselineHeat),
    soil: predict(bundle.soil, sample.x).map((v) =>
      Math.max(0, Math.min(1, v)),
    ),
    baselineHeat: sample.baselineHeat,
    precipitation: sample.x[2],
    temperature: sample.x[0],
    humidity: sample.x[1],
    wind: sample.x[3],
    x: sample.x,
  };
}
export function features(
  time: string,
  site: Site,
  temperature: number,
  humidity: number,
  rain: number,
  wind: number,
  rain7: number,
): number[] {
  const d = new Date(time),
    hour = d.getUTCHours(),
    day = (d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000;
  return [
    temperature,
    humidity,
    rain,
    wind,
    rain7,
    Math.sin((2 * Math.PI * hour) / 24),
    Math.cos((2 * Math.PI * hour) / 24),
    Math.sin((2 * Math.PI * day) / 365.25),
    Math.cos((2 * Math.PI * day) / 365.25),
    site.latitude,
    site.longitude,
  ];
}
