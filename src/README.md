# Browser application

`main.tsx` mounts React and imports the global stylesheet. The application is built by Vite; the Node API is a separate process in development.

| Directory | Responsibility |
| --- | --- |
| [app](app/README.md) | Workspace composition, navigation, selected site, and snapshot lifecycle |
| [components](components/README.md) | Map, chart, and forecast-window presentation shared by workflows |
| [features](features/README.md) | Model Lab and crew-report workflows |
| [lib](lib/README.md) | HTTP transport, snapshot caching, and service-worker registration |
| [styles](styles/README.md) | Global theme, layout, responsive, and accessibility rules |

Import contracts and pure calculations from `shared/`. Operational decisions come from server snapshots. Local model experiments and hypothetical sensitivity changes stay separate from those decisions. Preserve visible source modes, unknown coverage, evidence, and the actual browser backend.

Check frontend changes with `npm run build`; run `npm run test:e2e` for interactions, browser ML, asset loading, and offline behavior.
