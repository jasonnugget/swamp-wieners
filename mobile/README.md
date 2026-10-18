# Threshold Crew — native iOS app

A camera-first field app: **snap a photo → pin the hazard → share with the crew**. Accepted reports, photos, locations, selected task holds, team attribution and resolutions use the same Node/SQLite database as the supervisor website. A report remains attached to its plant for later crews and project owners; resolving it preserves the evidence and review history.

## Run on your iPhone

Requires Node 22.13+, an iPhone, and the Mac and phone on the same trusted Wi-Fi network. Install **Expo Go** from the App Store. This project uses **Expo SDK 57**, matching the installed Expo Go version reported on the test iPhone. The project SDK and Expo Go SDK must match; do not upgrade the project to a different major version just because npm offers a newer release.

From the repository root, start the API in terminal one (stop an existing API using port 3001 first):

```bash
npm ci
HOST=0.0.0.0 npm start
```

In terminal two, from the repository root:

```bash
cd mobile
npm ci
npx expo login
npm start
```

Scan the terminal QR code using your iPhone's Camera and open it in Expo Go. Allow Camera, Photos, Local Network and foreground Location when you use those features. Sign in to Expo Go with the same free Expo account used by `npx expo login` on your Mac. Physical iOS previews require matching accounts; this is separate from your crew identity. See [Expo’s device setup instructions](https://docs.expo.dev/get-started/start-developing/).

The app derives the API address from the Expo development host. If it cannot connect, open **Crew → Server connection** and enter your Mac's Wi-Fi IP with port 3001, for example `http://192.168.1.25:3001`. Find that address in macOS System Settings → Wi-Fi → Details → TCP/IP. On many Macs `ipconfig getifaddr en0` prints it. A physical phone's `localhost` points to the phone, not your Mac. The API and Metro must both be reachable; an Expo tunnel alone does not expose the API.

You can alternatively set `EXPO_PUBLIC_API_URL` in `mobile/.env`, using [.env.example](.env.example), then restart Metro. This is a public server address, never a credential.

If the server uses its demonstration clock, the app labels it. Switch the workspace to live time in Threshold Control before real field reporting; the phone does not silently change a shared server clock.

Choose a plant and your reporting name in **Crew**. Pick an existing team to use its assigned plants and roster. Team setup remains in the website's Crew reports view. Tap **Snap a hazard** to open the camera directly. Take a photo, check the hazard type and pin on one review screen, then tap **Confirm pin & share hazard**. Notes are optional; names are remembered after sharing. The affected-work summary stays visible and can be changed before submission. Camera cancellation or denial leaves a **Choose photo** option. The app confirms sharing only after the server accepts it. Other open apps and the supervisor receive live invalidations; pull to refresh is also available.

## Today at the site

The **On site** tab shows today’s selected-site hazard summary. Tap **View all 7 hazards and work status**, or **Today’s conditions & work status** on the map, for heat, wind/weather, ground/access, flooding, lightning, fire/smoke and wildlife screening, independent holds and source check times.

Current conditions come from the same canonical pipeline as the website, scoped to one plant. Forecast/model estimates are labeled; they are not confirmed incidents or exact hazard pins. Missing or stale readings remain unknown. Today uses the plant’s local calendar date and real time, even in a demo reporting workspace. Older unresolved crew reports remain carried forward on the map and in history. Cached conditions preserve last-known holds but cannot claim a current score. Restart the API after updating its code to supply the new conditions field.

## Visual design and browser preview

The crew app uses the supervisor theme’s paper, olive and copper palette, with bundled Outfit fonts and light Phosphor icons. Home centers the capture action, the field map fills its tab, and site memory keeps searchable observations in a flat list. Report categories expand horizontally; native entrance and scroll motion respect Reduce Motion. Decorative contour lines are artwork, not terrain or hazard readings.

For a presentation preview, run from `mobile/`:

```bash
npm run preview:web
```

This is a layout preview, not a replacement for the iPhone app. Its map is explicitly labeled **Coordinate preview** and positions actual site/report coordinates on an illustrative grid. iPhone continues to use native Apple Maps. Camera capture, on-device photo storage, permissions and native map gestures must be checked on iOS. The API does not currently allow the preview’s separate browser origin through CORS; use iOS for the connected reporting workflow. Do not disable browser security or widen backend access just to preview the design.

See the [mobile UI audit](../docs/mobile-ui-audit.md) for screenshots, references, checks and device limitations. The crew workspace supplies reports, sites and teams; it does not supply the supervisor’s environmental risk snapshots. This UI does not invent scores or forecast widgets.

## After an SDK upgrade

Stop the old mobile development server with Ctrl+C, then run from the repository root:

```bash
cd mobile
npm ci
npm start -- --clear
```

Close the previously opened project in Expo Go and scan the newly printed QR code. Keep the API terminal running. If Expo Go still says the project is SDK 54, you are opening an old development server or QR code; check that this terminal is running from this repository's `mobile/` directory. The project now targets SDK 57.

## iOS Simulator

Install full Xcode from the Mac App Store, launch it once, and install an iOS Simulator runtime in Xcode Settings → Components. Command Line Tools alone are insufficient. Then run the API as above and:

```bash
cd mobile
npm run ios
```

The Simulator can use `http://127.0.0.1:3001` as its server address. Its camera cannot take a real photograph: use **Choose photo** and first drag a JPEG/PNG into the Simulator's Photos library. Test real camera and GPS permissions on an iPhone.

## Boundaries and checks

Routes live in `src/app/`, workflow/provider state in `src/state/` and `src/features/`, reusable native views in `src/components/`, and transport/photo/draft helpers in `src/lib/`. `src/README.md` describes these boundaries. Shared browser/server/native contracts live in the maintained root `shared/` directory. `metro.config.js` exposes that directory for the small pure date and risk-configuration helpers; the separate mobile lockfile is preserved. Native code does not import web components or model-training code.

```bash
npm run check
npm run lint
npm run export:ios
npx expo-doctor
```

Run root `npm test`, `npm run build`, and the crew API browser tests after backend changes. iOS bundle export checks packaging; camera permissions, native map gestures and the actual device experience still need an iPhone/Simulator run.

Draft text, pin and compressed photo are saved in the app sandbox. Drafts are **not automatically uploaded**. A failed request keeps them available for an explicit retry. A stable request ID prevents the same unchanged retry from creating duplicate records. Cached reports remain visibly marked cached; no stale record becomes a site all-clear. Closing the app does not run background GPS, uploads or push notifications.

The current backend is a trusted-network prototype with shared reporting names and team context, not authenticated accounts or a public multi-tenant service. Cross-screen sharing means the same connected Threshold backend; historical records are not published to an external owner registry. Production deployment requires authenticated access and HTTPS.

`node_modules/`, `.expo/`, `dist/`, and generated `ios/`/`android/` directories are ignored. Native permissions and app metadata belong in `app.json`; do not hand-edit generated projects. Runtime evidence stays in root `runtime/`, never in the app assets.
