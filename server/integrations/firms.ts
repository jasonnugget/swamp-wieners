import type { Site } from "../../shared/types";
import type { ProviderEvidence } from "../../shared/providers";
import { distanceMiles } from "../../shared/policy";
import { HOUR, MINUTE, ProviderCache, ProviderHttp, evidence, safely, tile, unavailable } from "./provider";
export interface FireObservation { nearestFireMiles: number | null; fireAgeMinutes: number | null; firePower: number | null }
export interface FireProvider { getFireEvidence(site: Site): Promise<ProviderEvidence<FireObservation>> }
type Detection = { latitude: number; longitude: number; observedAt: string; power: number | null; confidence: string; type: string | null };
// FIRMS returns CSV, including quoted fields and CRLF. Never split quoted commas blindly.
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []; let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (!quoted && (c === "," || c === "\n")) {
      row.push(cell.replace(/\r$/, "")); cell = "";
      if (c === "\n") { if (row.some(Boolean)) rows.push(row); row = []; }
    } else cell += c;
  }
  if (quoted) throw new Error("FIRMS malformed quoted CSV");
  if (cell || row.length) { row.push(cell.replace(/\r$/, "")); rows.push(row); }
  const headers = rows.shift();
  if (!headers || !["latitude", "longitude", "acq_date", "acq_time", "frp", "confidence"].every(h => headers.includes(h))) throw new Error("FIRMS response lacks required CSV columns");
  return rows.map(values => {
    if (values.length !== headers.length) throw new Error("FIRMS malformed CSV row");
    return Object.fromEntries(headers.map((h, i) => [h, values[i]]));
  });
}
export function parseFirms(text: string, now: number): Detection[] {
  return parseCsv(text).flatMap(r => {
    const latitude = r.latitude.trim() ? Number(r.latitude) : NaN, longitude = r.longitude.trim() ? Number(r.longitude) : NaN;
    const hour = r.acq_time.padStart(4, "0"), time = Date.parse(`${r.acq_date}T${hour.slice(0, 2)}:${hour.slice(2)}:00Z`);
    const power = r.frp.trim() ? Number(r.frp) : NaN;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || !Number.isFinite(time)) throw new Error("FIRMS malformed detection coordinates/time");
    if (time > now || now - time > 48 * HOUR) return [];
    // Reject low-confidence and classified industrial/static/volcanic thermal sources.
    if (["l", "low"].includes(r.confidence.toLowerCase()) || r.type && r.type !== "0") return [];
    return [{ latitude, longitude, observedAt: new Date(time).toISOString(), power: Number.isFinite(power) && power >= 0 ? power : null, confidence: r.confidence, type: r.type ?? null }];
  });
}
export class FirmsProvider implements FireProvider {
  constructor(private cache: ProviderCache, private http: ProviderHttp, private mapKey = "", private clock = Date.now) {}
  async getFireEvidence(site: Site): Promise<ProviderEvidence<FireObservation>> {
    const now = this.clock();
    if (!this.mapKey) return unavailable("NASA FIRMS", now, HOUR, "FIRMS_MAP_KEY is not configured");
    return safely("NASA FIRMS", now, HOUR, async () => {
      const region = tile(site, 4, 100);
      const cached = await this.cache.get(`firms:VIIRS_NOAA20_NRT:v1:${region.key}`, HOUR, async () => ({ fetchedAt: this.clock(), detections: parseFirms(await this.http.text("NASA FIRMS", `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(this.mapKey)}/VIIRS_NOAA20_NRT/${region.bbox.join(",")}/3`), this.clock()) }));
      const nearby = cached.detections.map(d => ({ ...d, distance: distanceMiles(site, d) })).filter(d => d.distance <= 100 && Date.parse(d.observedAt) <= now && now - Date.parse(d.observedAt) <= 48 * HOUR).sort((a, b) => a.distance - b.distance);
      const nearest = nearby[0];
      return evidence("NASA FIRMS", { nearestFireMiles: nearest?.distance ?? null, fireAgeMinutes: nearest ? (now - Date.parse(nearest.observedAt)) / MINUTE : null, firePower: nearest?.power ?? null }, now, HOUR, {
        fetchedAt: new Date(cached.fetchedAt).toISOString(), validUntil: new Date(cached.fetchedAt + HOUR).toISOString(), observedAt: nearest?.observedAt ?? null, confidence: nearest ? nearest.type === "0" && ["n", "h", "nominal", "high"].includes(nearest.confidence.toLowerCase()) ? 0.6 : 0.35 : 0,
        details: { product: "VIIRS_NOAA20_NRT", radiusMiles: 100, detections: nearby.slice(0, 20),
          interpretation: "Satellite thermal anomalies are potential fire evidence, not verified wildfire perimeters. Empty detections do not establish zero fire risk." },
      });
    });
  }
}
