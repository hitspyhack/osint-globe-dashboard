# OSINT Globe — Godseye Console

A live, open-source intelligence console for planet Earth: a 3D globe with
aircraft, military traffic, ships, satellites, earthquakes, wildfires, public
cameras, broadcast radio and launch pads — rendered with sensor looks and a
tactical HUD.

Built with **Next.js 15**, **React 19**, **globe.gl / three.js** and **satellite.js**
(SGP4). No API key is required. Every launch starts with feeds off and offers
four random layer choices before any live data is requested.

> The HUD, sensor-look and console UX are inspired by
> [God's Eye View](https://github.com/bilawalsidhu/gods-eye-view) (MIT, by
> Bilawal Sidhu & Sameh Khamis at Halfpixel). This project is an independent
> implementation on a different stack (Next.js + globe.gl instead of
> CesiumJS + Vite) and ships no data or assets from that repository.

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

That's it — no keys, no config. Production build:

```bash
npm run build && npm start
```

---

## What's on the globe

| Layer | What you get | Source | Key |
|---|---|---|---|
| ✈ Live Flights | Global ADS-B traffic, altitude-scaled | OpenSky Network · adsb.lol | 🟢 |
| 🎖 Military Traffic | ADS-B contacts flagged military / state | adsb.lol · reapi.adsb.lol · airplanes.live | 🟢 |
| 🚢 Live Vessels | AIS ship positions | AISHub · Spire · MarineTraffic · Datalastic | 🟡 |
| 🛰 Satellites | 700+ objects, SGP4-propagated in real time, with ground tracks and sensor footprints | CelesTrak GP | 🟢 |
| 🧑‍🚀 ISS / Crewed | Live position + orbital ground track | Open Notify · CelesTrak | 🟢 |
| 🌋 Earthquakes | Last 24h (or any pinned day), sized by magnitude, ripple rings for M4.5+ | USGS FDSN | 🟢 |
| 🔥 Wildfires | EONET incidents, or VIIRS hotspots with a FIRMS key | NASA EONET · NASA FIRMS | 🟢 / 🟡 |
| ⛰ Volcanoes | Activity, last 30 days | NASA EONET | 🟢 |
| 🌀 Severe Storms | Tropical cyclones and severe systems | NASA EONET | 🟢 |
| 📹 Public Cameras | Live thumbnails and embeds, queried for the current view | Windy · OpenStreetMap | 🟢 / 🟡 |
| 📷 Street Imagery | Street-level photo positions — zoom into a city to query, click for the thumbnail | Mapillary Graph API | 🟡 |
| 📻 Radio Grid | Geo-located broadcast stations — click to listen | Radio Browser | 🟢 |
| 🚀 Launch Schedule | Upcoming orbital launches with pads, windows and countdown | Launch Library 2 | 🟢 |
| 🏭 Installations | Airfields, ports, military areas, nuclear plants | OpenStreetMap (Overpass) | 🟢 |
| 🧭 Graticule / 🌗 Day-Night | 10° grid and the computed day/night terminator | generated | 🟢 |
| 🏔 Elevation / Terrain | Global Terrarium RGB DEM, color relief and displaced land mesh; adjustable from 1× to 100× | AWS Open Data · Terrarium tiles | 🟢 |

🟢 works with no key · 🟡 unlocks or upgrades with a key. Terrain is an opt-in
visual layer in OPTICS rather than a live OSINT feed.

---

## Console features

**Sensor looks** — GLSL post-processing on the live 3D scene (not a CSS filter
over the canvas), plus matching chrome overlays:

| Key | Look | |
|---|---|---|
| `1` | **STD** | clean imagery |
| `2` | **NVG** | green phosphor, gain, halo, rolling scanlines |
| `3` | **FLIR** | thermal LUT, black-hot |
| `4` | **WHITE** | thermal LUT, white-hot |
| `5` | **CRT** | barrel distortion, RGB convergence drift, aperture grille |
| `6` | **NOIR** | high-contrast monochrome |
| `7` | **SNOW** | low-light sensor, heavy grain |
| `8` | **GLOW** | bloom pass for night-side cities |

**Tactical HUD** — corner brackets, centre reticle, scanlines, UTC mission
clock, camera/pointer telemetry, FPS and draw-call counters, and a per-feed
health readout so an offline upstream is obvious instead of silent.

**Basemaps** — Esri World Imagery (satellite), CARTO Dark, OSM and Esri Topo,
served as slippy tiles through three-globe's tile engine with automatic
fallback if a tile server is unreachable.

**Elevation / terrain** — turn on the public AWS Terrarium RGB elevation tiles
in OPTICS to build a global 3D relief mesh. Land height can be exaggerated from
true scale to **100×**, and the surface opacity is adjustable from **0 %**
(fully transparent — relief colors tint the imagery) to **100 %** (a solid
shell). The color ramp also communicates ocean depth. The global overview uses
zoom-3 tiles (roughly 20 km/pixel at the equator), loaded only when requested,
and reports source/CORS failures in the panel.

**3D entity shapes** — every layer renders as recognisable 3D objects instead
of anonymous columns: aircraft and military tracks are swept-wing jets sitting
at their (exaggerated) flight level, nose pointed along the live ADS-B
heading; vessels are hulls with superstructures rotated to their AIS course;
satellites are body + solar-wing + dish models at their true SGP4 altitude
(the ISS gets its truss-and-arrays silhouette); radio masts, webcam cameras,
Mapillary photo cards with capture-direction chevrons, gradient flames,
cratered volcano cones, spiral storm systems, flood discs with rooftops,
finned rockets, roofed site blocks and gradient quake octahedrons (ripple
rings stay). Each (kind, colour) pair is one merged vertex-coloured geometry
drawn with a single shared material, and object size scales with camera
distance so shapes hold a constant share of the screen from orbit down to
street level. The busiest layers keep a mesh budget (flights 3000, military
1500) and fall back to the points pipeline beyond it; "Merge points" in OPTICS
forces points for everything.

**Imagery & zoom** — the SATELLITE and STREET basemaps now load tiles up to
zoom 19 (TOPO 17, DARK 20), and the camera can descend to ~4.5 km above the
surface with the joystick's pan floor and fine zoom steps scaled to match —
buildings, streets and even aircraft silhouettes are readable at the closest
view.

**Mouse 3D navigation** — drag to rotate the globe, scroll to zoom, and
**right-drag (or ctrl-drag) to tilt toward the horizon and rotate the
heading** for the full 3D view, Google-Earth style. The look gesture drives
the same orientation system as the joystick, so pan direction, `⌖ N-UP` and
the tilt/heading readouts all follow along.

**Navigation joystick** — a bottom-right stick drives the camera: drag the pad
to pan (speed scales with altitude, direction follows the current heading),
hold `+` / `−` to zoom, slide **TILT** from straight-down to a near-horizon
view, hold `⟲` / `⟳` to rotate the heading, and `⌖ N-UP` resets north-up.
The pad also takes focus for keyboard control (arrow keys pan, `+`/`−` zoom,
`PageUp`/`PageDown` tilt). Hide or show it in OPTICS.

**Universe reference** — a procedural deep-space starfield surrounds the globe.
A compact heliocentric inset uses the current simulation date to show Earth's
approximate eccentric orbit, distance and orbital speed. The globe's solar
lighting follows the computed subsolar point; the distant star reference turns
at Earth's sidereal rate (23h 56m) while the geographic globe stays stable.
The orbit inset is an ephemeris illustration, not a navigation-grade planetary
solution.

**Target dossier** — click any track for its full record (callsign, MMSI, NORAD
ID, magnitude, depth, footprint, TLE…), plus centre/copy coordinates,
OpenStreetMap and Street View links, inline camera feeds and live radio audio.

**Mission clock** — scrub the last 30 days; satellite positions are
re-propagated and USGS/EONET windows follow the pinned time.

**Extras** — geocoded location search (`/`), on-demand device-location
centering, solo/refresh per layer, PNG screenshot (`P`), shareable view links
(and the native iOS share sheet), keyboard-only operation (`?` for help), PWA
offline shell.

---

## Keyboard

| Key | Action | Key | Action |
|---|---|---|---|
| `1`–`8` | sensor look | `L` | layer dock |
| `/` | focus search | `T` | mission clock |
| `R` | Earth sidereal spin | `P` | screenshot |
| `+` / `-` | zoom | `?` | help |
| `Esc` | clear selection / close panels | | |

---

## POWER UP (optional keys)

Open **POWER UP** in the top right and paste keys for Windy, an AIS provider,
NASA FIRMS or OpenSky. Keys are stored in that browser's `localStorage` and are
only ever sent to this app's own `/api/*` routes, which proxy the upstream
provider — nothing is persisted server-side. Server deployments can set the same
values in `.env.local` (see `.env.example`).

---

## Architecture

```
app/
  api/                 # server proxies: caching, key handling, normalisation
    aviation/          # OpenSky (global) + adsb.lol (military)
    maritime/          # AISHub / Spire / Datalastic adapter
    satellites/        # CelesTrak TLE groups
    iss/ quakes/ hazards/ fires/ radio/ launches/ infrastructure/ geocode/
  page.tsx             # the console: state, shortcuts, panels
components/
  GlobeView.tsx        # globe.gl scene: points, rings, paths, footprints, post-FX
  HudFrame.tsx         # reticle, brackets, status strip, telemetry
  LayerDock.tsx        # feeds, counts, upstream health
  Dossier.tsx          # selected-track record
  SensorBar.tsx · TimelineBar.tsx · SearchBar.tsx · PowerUp.tsx · SettingsPanel.tsx
hooks/useGlobeData.ts  # polling, per-layer status, SGP4 propagation
lib/
  layers.ts            # layer + sensor + basemap + key registry
  sources.ts           # every upstream shape → normalised Entity
  feeds.ts             # multi-candidate fetch (proxy → direct)
  sensors.ts           # GLSL sensor looks
  satellite-propagation.ts  # SGP4 + ground tracks + footprints
  geo.ts · time.ts · keys.ts · telemetry.ts
```

**How data flows.** Each layer declares a list of candidate sources — normally
our own `/api/*` proxy first, the upstream URL second. The proxy is preferred
because it caches and keeps credentials server-side; the direct browser request
keeps the console alive when the proxy has no egress (offline dev, locked-down
sandbox). Everything normalises into one `Entity` shape, so rendering, the HUD
and the dossier are source-agnostic.

**Resilience.** Every feed fails independently: a dead upstream marks its layer
in the dock and leaves a visible status, never a blank globe. Basemaps probe
their tile server and fall back to the next template, then to a static texture.

**Feed smoke tests.** `npm run smoke` runs 79 offline fixture assertions across
every loader, parser, entity mapper and the SGP4 pipeline — no network needed —
so parser drift is caught before it reaches the console.

---

## iOS / TestFlight (Capacitor)

The iOS app bundles the static client in the native app; it does **not** load
production UI from a remote `server.url`. The Next.js API routes remain hosted
on your HTTPS deployment. This keeps the app usable offline at launch and lets
Apple review a self-contained client while feeds continue to use the backend.

### 1. Deploy the web/API service

Deploy this Next.js project to an HTTPS origin that serves both the web app and
its `/api/*` routes (for example, `https://globe.example.com`). Deploy the
current repository version: it adds CORS headers for `capacitor://localhost`
and handles the iOS `OPTIONS` preflight, including the `x-ogd-keys` header.
Configure any server-side provider keys as described in **POWER UP** above.

### 2. Build and sync the native project (macOS)

Install dependencies, then pass the **bare HTTPS origin** of that deployment
(no `/api` suffix or other path):

```bash
npm ci
CAPACITOR_API_URL=https://globe.example.com npm run ios:sync
```

`ios:sync` makes a temporary copy of the app without the dynamic API routes,
creates the static `www/` client with the API origin embedded, and adds/syncs
the checked-in Xcode project (minimum deployment target: iOS 15). Generated
`www/` and `ios/App/App/public/` assets
are intentionally git-ignored; rerun the command whenever the frontend changes
or the API origin changes, before building or archiving in Xcode.

To open the synchronized project:

```bash
CAPACITOR_API_URL=https://globe.example.com npm run ios:open
```

`npm run ios:open` syncs first, then opens `ios/App/App.xcodeproj`. For a
simulator or connected device, select the destination in Xcode; the optional
`npm run ios:run` command also syncs before building and launching.

### 3. Sign and upload to TestFlight

1. On a Mac, install a current Xcode version and sign in to an Apple Developer
   account enrolled in the Apple Developer Program.
2. If `com.hitspyhack.osintglobe` is not a bundle ID you control, choose a
   unique one and update `appId` in `capacitor.config.ts` and the App target's
   **Bundle Identifier** under Xcode **Signing & Capabilities**. Keep the
   values in sync, then run `npm run ios:sync` again.
3. In Xcode, select the **App** target, choose your **Team**, enable
   **Automatically manage signing**, and set the marketing version/build
   number under **General → Identity**. Verify the app icon, launch screen and
   location permission text on a simulator/device.
4. Choose **Any iOS Device (arm64)** (or a generic iOS device), then select
   **Product → Archive**. In Organizer choose **Distribute App → App Store
   Connect → Upload** and follow the signing prompts.
5. In App Store Connect, create the app record if needed, wait for processing,
   then add the uploaded build to a TestFlight internal or external testing
   group. External testing may require Beta App Review.

### Privacy and release checks

Location is requested only after tapping the location button. The app does
not persist the location, but the visible map bounds can be sent with
area-scoped feed requests. A view link intentionally shared by the user can
include the current globe coordinates. Provider keys entered in **POWER UP**
are stored in the app's local storage and sent with requests to your hosted
`/api/*` proxy, which forwards applicable keys to the selected provider.
Review your deployment's logging/privacy policy, then complete App Store
Connect's privacy disclosures and provide a privacy-policy URL that matches
the services and providers you enable.

A signed archive and TestFlight upload require macOS/Xcode and your Apple
Developer account; they cannot be produced from this Linux development
workspace. The repository includes the native project and setup steps, but the
production API origin, signing team and App Store Connect app record must be
provided/configured by the app owner.

---

## Attribution & terms

Live feeds remain subject to each provider's terms — check before commercial
use. Notable ones: USGS and NASA EONET/FIRMS are public domain; OpenStreetMap
and the Radio Browser directory are ODbL / CC; AISHub and OpenSky accounts are
free for personal use. Mapillary imagery is CC-BY-SA — thumbnails link back to
their source page on mapillary.com. The console is for research and situational
awareness; it republishes only what those providers already publish publicly.

## License

MIT. See `PROJECT_STATUS.md` for the roadmap and known limitations.
