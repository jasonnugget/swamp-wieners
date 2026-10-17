import { readFileSync, mkdirSync, writeFileSync, renameSync } from "node:fs";
import { resolve, join } from "node:path";
import type { Site, Forecast, ModelBundle } from "../shared/types";
import type { WeatherPoint } from "../shared/weather";
import { completeSiteData } from "../shared/site-data";
import { Store } from "./store";
import { Engine } from "./engine";
import { collect } from "./pipeline/collect";
import { createProviders, PROVIDER_INTERVALS, type ProviderName, type StoredProviderRecord } from "./pipeline/providers";
import { ProviderPoller } from "./pipeline/provider-poller";
import { mapConcurrent } from "./integrations/provider";

try { process.loadEnvFile(); } catch { /* Optional server credentials. */ }
const args = process.argv.slice(2);
const selection = args.find(a => a.startsWith("--providers="))?.slice("--providers=".length);
const providers = selection === undefined ? Object.keys(PROVIDER_INTERVALS) as ProviderName[] : selection.split(",") as ProviderName[];
if (args.some(a => a !== "--offline" && !a.startsWith("--providers=")) || providers.some(p => !Object.hasOwn(PROVIDER_INTERVALS, p)))
  throw new Error("Usage: npm run data:complete -- [--offline] [--providers=usgs,firms,floodplain,wildlife,lightning,nws]");
const directory = resolve(process.env.DATA_DIR ?? "runtime");
const read = <T>(file: string): T => JSON.parse(readFileSync(join("public", file), "utf8"));
const sites = read<Site[]>("data/sites.json"), store = new Store(directory);
try {
  const engine = new Engine(store, sites, read<Record<string, Forecast>>("data/forecasts.json"), read<ModelBundle>("models/bundle.json"), read("data/scenario.json"));
  if (!args.includes("--offline")) {
    const due = sites.filter(site => {
      const p = store.get<WeatherPoint>("environment-weather", site.id);
      return !p || p.stale || Date.now() - Date.parse(p.fetchedAt) >= 15 * 60000;
    });
    // Persist each bounded batch immediately; an interrupted run is resumable.
    for (let i = 0; i < due.length; i += 10) {
      for (const r of await collect(due.slice(i, i + 10))) {
        if (r.point) store.put("environment-weather", r.site.id, r.point);
        store.put("feed", `${r.site.id}:environment`, { id: `${r.site.id}:environment`, checkedAt: new Date().toISOString(), ok: !!r.point && !r.point.stale, message: r.error ?? "Weather loaded" });
      }
      console.log(`Weather ${Math.min(i + 10, due.length)}/${due.length}`);
    }
    const poller = new ProviderPoller(store, sites, createProviders(store, () => engine.now()), () => {});
    await Promise.all(providers.map(async provider => {
      let completed = 0;
      await mapConcurrent(sites, 2, async site => {
        const prior = store.get<StoredProviderRecord>("environment-provider", `${site.id}:${provider}`);
        if (!prior || prior.evidence.status !== "ok" || Date.parse(prior.evidence.validUntil) <= Date.now()) await poller.refresh(site, provider, true);
        completed++;
        if (completed % 75 === 0) console.log(`${provider} ${completed}/${sites.length}`);
      });
      console.log(`${provider} finished: ${sites.length} plants`);
    }));
  }
  const now = Date.now(), snapshot = engine.snapshot();
  const completions = sites.map(site => completeSiteData(site, snapshot.siteRisks[site.id].observation, now, store.get<WeatherPoint>("environment-weather", site.id)));
  const fieldSummary: Record<string, { source: number; synthetic: number; notApplicable: number }> = {};
  for (const plant of completions) for (const [path, field] of Object.entries(plant.fields)) {
    const counts = fieldSummary[path] ??= { source: 0, synthetic: 0, notApplicable: 0 };
    counts[field.kind === "SOURCE" ? "source" : field.kind === "SYNTHETIC" ? "synthetic" : "notApplicable"]++;
  }
  const output = { version: 1, generatedAt: new Date(now).toISOString(), usage: "DEMO_ONLY", plantCount: sites.length,
    collection: args.includes("--offline") ? "persisted-cache-only" : "live-refresh-with-persistent-cache", fieldSummary, sites: completions };
  const outputDirectory = join(directory, "site-data"); mkdirSync(outputDirectory, { recursive: true });
  const file = join(outputDirectory, "completion.json");
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(output, null, 2) + "\n"); renameSync(temporary, file);
  const csv = ["siteId,name,state,latitude,longitude,sourceFields,syntheticFields,notApplicableFields,observedCoveragePercent",
    ...completions.map(plant => [plant.siteId, plant.site.name, plant.site.state, plant.site.latitude, plant.site.longitude,
      plant.completeness.source, plant.completeness.synthetic, plant.completeness.notApplicable, plant.observed.coverage.percent]
      .map(value => `"${String(value).replaceAll('"', '""')}"`).join(","))].join("\n") + "\n";
  const csvFile = join(outputDirectory, "coverage.csv"), temporaryCsv = `${csvFile}.${process.pid}.tmp`;
  writeFileSync(temporaryCsv, csv); renameSync(temporaryCsv, csvFile);
  console.log(JSON.stringify({ file, plants: sites.length, fieldsPerPlant: Object.keys(fieldSummary).length, fieldSummary }, null, 2));
} finally { store.close(); }
