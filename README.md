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
| 🎖 Military Traffic | ADS-B contacts flagged military / state | adsb.lol · airplanes.live | 🟢 |
| 🚢 Live Vessels | AIS ship positions | AISHub · Spire · MarineTraffic · Datalastic | 🟡 |
| 🛰 Satellites | 700+ objects, SGP4-propagated in real time, with ground tracks and sensor footprints | CelesTrak GP | 🟢 |
| 🧑‍🚀 ISS / Crewed | Live position + orbital ground track | Open Notify · CelesTrak | 🟢 |
| 🌋 Earthquakes | Last 24h (or any pinned day), sized by magnitude, ripple rings for M4.5+ | USGS FDSN | 🟢 |
| 🔥 Wildfires | EONET incidents, or VIIRS hotspots with a FIRMS key | NASA EONET · NASA FIRMS | 🟢 / 🟡 |
| ⛰ Volcanoes | Activity, last 30 days | NASA EONET | 🟢 |
| 🌀 Severe Storms | Tropical cyclones and severe systems | NASA EONET | 🟢 |
| 📹 Public Cameras | Live thumbnails and embeds | Windy · OpenStreetMap | 🟢 / 🟡 |
| 📻 Radio Grid | Geo-located broadcast stations — click to listen | Radio Browser | 🟢 |
| 🚀 Launch Schedule | Upcoming orbital launches with pads, windows and countdown | Launch Library 2 | 🟢 |
| 🏭 Installations | Airfields, ports, military areas, nuclear plants | OpenStreetMap (Overpass) | 🟢 |
| 🧭 Graticule / 🌗 Day-Night | 10° grid and a computed sun terminator | generated | 🟢 |
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
true scale to **100×**; the color ramp also communicates ocean depth. The global
overview uses zoom-3 tiles (roughly 20 km/pixel at the equator), loaded only
when requested, and reports source/CORS failures in the panel.

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

**Extras** — location search (`/`), solo/refresh per layer, PNG screenshot
(`P`), shareable view links, keyboard-only operation (`?` for help), PWA
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

---

## Attribution & terms

Live feeds remain subject to each provider's terms — check before commercial
use. Notable ones: USGS and NASA EONET/FIRMS are public domain; OpenStreetMap
and the Radio Browser directory are ODbL / CC; AISHub and OpenSky accounts are
free for personal use. The console is for research and situational awareness;
it republishes only what those providers already publish publicly.

## License

MIT. See `PROJECT_STATUS.md` for the roadmap and known limitations.
