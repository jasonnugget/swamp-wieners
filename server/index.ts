import express from "express";
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Store } from "./store";
import { Engine } from "./engine";
import { triage } from "./jev";
import { fetchAlerts, fetchWeather } from "./feeds";
import { CATEGORIES, TASKS } from "../shared/policy";
import type {
  Forecast,
  HazardReport,
  ModelBundle,
  Site,
  Strike,
} from "../shared/types";

try {
  process.loadEnvFile();
} catch {
  /* Optional local environment file. */
}
const root = resolve("."),
  directory = resolve(process.env.DATA_DIR ?? "runtime");
const read = <T>(file: string): T =>
  JSON.parse(readFileSync(join(root, "public", file), "utf8"));
const store = new Store(directory);
const engine = new Engine(
  store,
  read<Site[]>("data/sites.json"),
  read<Record<string, Forecast>>("data/forecasts.json"),
  read<ModelBundle>("models/bundle.json"),
  read("data/scenario.json"),
);
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "6mb" }));
const clients = new Set<express.Response>();
function broadcast() {
  for (const res of clients)
    res.write(
      `data: ${JSON.stringify({ now: new Date(engine.now()).toISOString() })}\n\n`,
    );
}
app.use("/api", (req, res, next) => {
  if (req.method !== "GET" && req.headers.origin) {
    try {
      if (new URL(req.headers.origin).host !== req.headers.host)
        return res
          .status(403)
          .json({ error: "Cross-origin writes are not allowed" });
    } catch {
      return res.status(403).json({ error: "Invalid origin" });
    }
  }
  res.setHeader("Cache-Control", "no-store");
  next();
});
app.get("/api/health", (_req, res) =>
  res.json({ ok: true, version: engine.models.version }),
);
app.get("/api/snapshot", (_req, res) => res.json(engine.snapshot()));
app.get("/api/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.flushHeaders();
  res.write('data: {"connected":true}\n\n');
  clients.add(res);
  const timer = setInterval(() => res.write(": heartbeat\n\n"), 20000);
  req.on("close", () => {
    clearInterval(timer);
    clients.delete(res);
  });
});
const reportSchema = z.object({
  siteId: z.string(),
  category: z.enum(
    CATEGORIES as [
      (typeof CATEGORIES)[number],
      ...(typeof CATEGORIES)[number][],
    ],
  ),
  description: z.string().trim().min(5).max(2000),
  tasks: z
    .array(
      z.enum(TASKS as [(typeof TASKS)[number], ...(typeof TASKS)[number][]]),
    )
    .min(1),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  author: z.string().trim().min(1).max(80),
  photo: z.string().max(5_500_000).optional(),
});
app.post("/api/reports", (req, res) => {
  const parsed = reportSchema.safeParse(req.body);
  if (!parsed.success)
    return res
      .status(400)
      .json({ error: parsed.error.issues.map((i) => i.message).join("; ") });
  const { photo, ...input } = parsed.data;
  if (!engine.sites.some((s) => s.id === input.siteId))
    return res.status(404).json({ error: "Site not found" });
  let photoUrl: string | undefined;
  if (photo) {
    const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(
      photo,
    );
    if (!m)
      return res
        .status(400)
        .json({ error: "Photo must be JPEG, PNG, or WebP" });
    const bytes = Buffer.from(m[2], "base64");
    if (bytes.length > 4 * 1024 * 1024)
      return res.status(400).json({ error: "Photo must be under 4 MB" });
    const imageId = `${randomUUID()}.${m[1]}`;
    mkdirSync(join(directory, "uploads"), { recursive: true });
    writeFileSync(join(directory, "uploads", imageId), bytes);
    photoUrl = `/uploads/${imageId}`;
  }
  const report = engine.report({ ...input, photoUrl });
  broadcast();
  res.status(201).json(report);
  void triage(report).then((result) => {
    const current = store.get<HazardReport>("report", report.id);
    if (current) {
      store.put("report", report.id, { ...current, triage: result });
      broadcast();
    }
  });
});
app.post("/api/reports/:id/resolve", (req, res) => {
  const input = z
    .object({
      author: z.string().trim().min(1).max(80),
      resolution: z.string().trim().min(5).max(1000),
    })
    .safeParse(req.body);
  if (!input.success)
    return res
      .status(400)
      .json({
        error: "Name and resolution of at least five characters are required",
      });
  const report = store.get<HazardReport>("report", req.params.id);
  if (!report) return res.status(404).json({ error: "Report not found" });
  if (report.status === "resolved") return res.json(report);
  const updated = {
    ...report,
    status: "resolved" as const,
    resolvedAt: new Date(engine.now()).toISOString(),
    resolvedBy: input.data.author,
    resolution: input.data.resolution,
  };
  store.put("report", report.id, updated);
  broadcast();
  res.json(updated);
});
app.post("/api/reports/:id/confirm-triage", (req, res) => {
  const report = store.get<HazardReport>("report", req.params.id);
  if (!report) return res.status(404).json({ error: "Report not found" });
  const category = (report.triage?.answers?.category as { choice?: string })
    ?.choice;
  const task = (report.triage?.answers?.task as { choice?: string })?.choice;
  if (!CATEGORIES.includes(category as never) || !TASKS.includes(task as never))
    return res.status(400).json({ error: "No complete suggestion to confirm" });
  const updated = {
    ...report,
    category: category as HazardReport["category"],
    tasks: [
      ...new Set([...report.tasks, task as HazardReport["tasks"][number]]),
    ],
  };
  store.put("report", report.id, updated);
  broadcast();
  res.json(updated);
});
app.post("/api/demo/strike", (req, res) => {
  if (engine.clockMode() !== "demo")
    return res
      .status(400)
      .json({ error: "Enable demo mode to inject a simulated strike" });
  const input = z
    .object({
      siteId: z.string(),
      distanceMiles: z.number().min(0).max(50).default(6),
    })
    .safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: "Invalid strike" });
  const site = engine.sites.find((s) => s.id === input.data.siteId);
  if (!site) return res.status(404).json({ error: "Site not found" });
  const strike: Strike = {
    id: randomUUID(),
    latitude: site.latitude + input.data.distanceMiles / 69.1,
    longitude: site.longitude,
    time: new Date(engine.now()).toISOString(),
    mode: "simulated",
  };
  store.insert("strike", strike.id, strike);
  broadcast();
  res.json(strike);
});
app.post("/api/clock", (req, res) => {
  const input = z
    .object({
      mode: z.enum(["real", "demo"]),
      advanceMinutes: z.number().min(0).max(1440).optional(),
    })
    .safeParse(req.body);
  if (!input.success)
    return res.status(400).json({ error: "Invalid clock request" });
  engine.setClock(
    input.data.mode,
    new Date(
      engine.now() + (input.data.advanceMinutes ?? 0) * 60000,
    ).toISOString(),
  );
  broadcast();
  res.json(engine.snapshot());
});
app.post("/api/demo/reset", (_req, res) => {
  engine.reset();
  broadcast();
  res.json(engine.snapshot());
});
const refreshing = new Set<string>();
async function updateFeeds(site: Site, weather = true) {
  refreshing.add(site.id);
  const now = Date.now();
  const results = await Promise.allSettled([
    weather
      ? fetchWeather(site, engine.models, now)
      : Promise.resolve(undefined),
    fetchAlerts(site),
  ]);
  if (results[0].status === "fulfilled" && results[0].value)
    store.put("forecast", site.id, results[0].value);
  if (results[1].status === "fulfilled") {
    for (const alert of store.all<{ id: string; siteId: string }>("alert"))
      if (alert.siteId === site.id)
        store.db
          .prepare("DELETE FROM records WHERE kind=? AND id=?")
          .run("alert", alert.id);
    for (const alert of results[1].value) store.put("alert", alert.id, alert);
  }
  results.forEach((r, i) => {
    if (i === 0 && !weather) return;
    store.put("feed", `${site.id}:${i === 0 ? "weather" : "nws"}`, {
      id: `${site.id}:${i === 0 ? "weather" : "nws"}`,
      checkedAt: new Date(now).toISOString(),
      ok: r.status === "fulfilled",
      message:
        r.status === "fulfilled"
          ? i === 0
            ? "Live 48-hour-lead forecast loaded"
            : "NWS alert check completed"
          : String(r.reason),
    });
  });
  refreshing.delete(site.id);
  broadcast();
}
app.post("/api/sites/:id/refresh", async (req, res) => {
  const site = engine.sites.find((s) => s.id === req.params.id);
  if (!site) return res.status(404).json({ error: "Site not found" });
  if (refreshing.has(site.id))
    return res.status(409).json({ error: "Refresh already running" });
  engine.setClock("real");
  broadcast();
  await updateFeeds(site);
  res.json(engine.snapshot());
});
app.use(
  "/uploads",
  express.static(join(directory, "uploads"), {
    setHeaders: (r) => r.setHeader("X-Content-Type-Options", "nosniff"),
  }),
);
app.use("/data", express.static(join(root, "public/data")));
app.use("/models", express.static(join(root, "public/models")));
if (existsSync(join(root, "dist/index.html"))) {
  app.use(express.static(join(root, "dist")));
  app.get("/{*path}", (_req, res) =>
    res.sendFile(join(root, "dist/index.html")),
  );
}
app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(error instanceof Error ? error.message : "Request error");
    res.status(400).json({ error: "Request could not be processed" });
  },
);
const timer = setInterval(() => {
  if (engine.tick()) broadcast();
}, 5000);
engine.tick();
// Stagger network work; every site gets watched after opting into the real clock.
// Alerts are polled every two minutes, weather every fifteen, up to five in flight.
const feedTimer = setInterval(() => {
  if (engine.clockMode() !== "real" || refreshing.size >= 5) return;
  const checked = (id: string) =>
    Date.parse(
      store.get<{ checkedAt: string }>("feed", id)?.checkedAt ?? "1970-01-01",
    );
  const due = engine.sites
    .filter(
      (s) =>
        !refreshing.has(s.id) && Date.now() - checked(`${s.id}:nws`) > 120000,
    )
    .sort((a, b) => checked(`${a.id}:nws`) - checked(`${b.id}:nws`))
    .slice(0, 5 - refreshing.size);
  for (const site of due)
    void updateFeeds(
      site,
      Date.now() - checked(`${site.id}:weather`) > 900000,
    ).catch((e) => {
      refreshing.delete(site.id);
      console.error(
        "Feed refresh failed",
        e instanceof Error ? e.message : "Unknown error",
      );
    });
}, 10000);
const server = app.listen(
  Number(process.env.PORT ?? 3001),
  process.env.HOST ?? "127.0.0.1",
  () =>
    console.log(
      `PlanIT API http://${process.env.HOST ?? "127.0.0.1"}:${process.env.PORT ?? 3001}`,
    ),
);
function shutdown() {
  clearInterval(timer);
  clearInterval(feedTimer);
  for (const c of clients) c.end();
  server.close(() => {
    store.close();
    process.exit(0);
  });
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
