const CACHE = "planit-field-v11";
const CORE = [
  "/",
  "/favicon.svg",
  "/data/sites.json",
  "/data/forecasts.json",
  "/data/samples.json",
  "/data/scenario.json",
  "/data/states.geojson",
  "/data/us-states.geojson",
  "/data/weather-stations.json",
  "/data/provenance.json",
  "/models/bundle.json",
  "/models/evaluation.json",
  "/fonts/dm-sans.woff2",
  "/fonts/manrope.woff2",
  "/fonts/SpaceGrotesk-Variable.ttf",
  "/fonts/satoshi-variable.woff2",
  "/fonts/geist-latin-variable.woff2",
  "/fonts/geist-latin-ext-variable.woff2",
  "/images/wind-landscape.jpg",
  "/images/forest-canopy.jpg",
  "/fonts/InstrumentSans-Variable.ttf",
  "/fonts/BarlowCondensed-SemiBold.ttf",
];
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    (async () => {
      const response = await fetch("/asset-manifest.json", { cache: "reload" });
      if (!response.ok) throw new Error("Offline asset manifest unavailable");
      const assets = await response.json();
      const cache = await caches.open(CACHE);
      // Include initial and lazy chunks fetched before this worker took control.
      await cache.addAll([...new Set([...CORE, ...assets])]);
    })(),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((k) => k.startsWith("planit-") && k !== CACHE)
              .map((k) => caches.delete(k)),
          ),
        ),
    ]),
  );
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/uploads/")
  )
    return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      try {
        const response = await fetch(event.request);
        if (response.ok) await cache.put(event.request, response.clone());
        return response;
      } catch {
        const saved = await cache.match(event.request);
        if (saved) return saved;
        if (event.request.mode === "navigate") {
          const shell = await cache.match("/");
          if (shell) return shell;
        }
        throw new Error("Asset unavailable offline");
      }
    }),
  );
});
