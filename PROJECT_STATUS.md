# OSINT Globe — Project Status

**Version:** 0.3.0 · **Updated:** 2026-10-18 · **Status:** ✅ Working, verified build

---

## What this release changed

The console was rebuilt around a God's-Eye-View style operating model: a
full-screen tactical HUD over a photorealistic globe, with live feeds that can
be filtered, inspected and time-scrubbed.

### Added

- **Sensor looks** — 8 GLSL post-processing modes (STD, NVG, FLIR, WHITE-HOT,
  CRT, NOIR, SNOW, GLOW) applied through the globe's `EffectComposer`, with
  matching CSS chrome and hotkeys `1`–`8`.
- **Tactical HUD** — reticle, corner brackets, scanlines, UTC mission clock with
  SIM indicator, camera/pointer telemetry, FPS + draw-call counters, per-feed
  health readout.
- **Slippy-tile basemaps** — Esri World Imagery / CARTO Dark / OSM / Esri Topo
  through three-globe's tile engine, with source probing and graceful fallback.
- **8 new live layers** — military traffic (adsb.lol), earthquakes (USGS FDSN),
  wildfires (EONET / FIRMS), volcanoes, severe storms, radio grid, launch
  schedule, OSM installations. Plus graticule and computed day/night terminator.
- **Target dossier** — full record per track, sensor footprint polygon for
  satellites, ground tracks for the ISS and any selected satellite, live audio
  for radio stations, camera embeds, OSM / Street View links.
- **Mission clock** — 30-day scrubber that re-propagates satellites and pins
  USGS/EONET windows to the selected time; playback at 1m–6h per second.
- **POWER UP** — in-app key panel (localStorage → our API routes only).
- **Console ops** — location search (`/`), solo/refresh per layer, screenshot
  (`P`), shareable view links, help (`?`), persisted preferences.
- **Clean startup** — every session starts with all feeds and terrain off; the
  user can activate one or more of four randomly sampled feed choices (or keep
  the globe empty). Shared links can be restored explicitly from that prompt.
- **Global elevation** — optional AWS Terrarium DEM sampling builds a 3D
  hypsometric relief mesh, with a 1×–100× exaggeration control and load/error
  feedback. The current global overview samples zoom-3 tiles.
- **Universe reference** — procedural distant stars, a live approximate
  heliocentric Earth-orbit inset, solar-position lighting, and an inertial sky
  that counter-rotates at the sidereal rate while keeping the map Earth-fixed.

### Fixed

- `npm install` was broken: `react-leaflet-cluster` pinned React 18 against
  React 19. Removed leaflet, react-leaflet, axios and workbox-window — none
  were imported anywhere.
- **Tailwind never compiled**: `@import "tailwindcss"` with no PostCSS config.
  Added `postcss.config.mjs`.
- **Satellites never propagated**: the code called `Satrec.create()`, which does
  not exist in satellite.js v5 (it exports `twoline2satrec`). Every satellite
  was silently dropped. Rewritten against the real v5 API.
- **TLE parsing was broken by accident**: routes joined TLE lines with a literal
  `\n` two-character sequence and the parser split on the same string, so it
  worked only while both sides stayed wrong. Now real newlines, tolerant
  parsing (`splitTle`).
- **Point altitudes were nonsense**: aircraft altitude was divided by 10 000
  and fed to globe.gl as globe-radius units, putting a 10 km airliner 6 371 km
  above the surface. Now converted properly and exaggerated only for legibility.
- **Wildfires layer actually loaded volcanoes** (EONET `volcanoes` category).
  Split into wildfires / volcanoes / storms.
- **Unbounded feeds**: OpenSky returns ~7 000 states and EONET returns large
  payloads — now trimmed server-side and capped per layer for frame-rate safety.
- Next.js upgraded 15.5.2 → 15.5.28 (CVE-2025-66478).
- PWA manifest pointed at `icon-192.png` / `icon-512.png`, which did not exist.
  Replaced with real SVG icons.
- Service worker cached `/api/*` responses — live positions could be served
  stale. Now network-only for feeds and navigations.

---

## Verified

- `npx tsc --noEmit` clean; `npm run build` succeeds (13 API routes + page).
- All 13 API routes return well-formed envelopes, including the error paths.
- All 7 GLSL shaders parse (validated with `@shaderfrog/glsl-parser`).
- Console renders server-side; dev server compiles clean.

### Not verified here

The sandbox this was built in has network access to GitHub/npm only, so no
upstream feed could be reached from the server and no browser was available:

- live feed payloads have not been exercised against real responses end-to-end
- imagery and Terrarium DEM tile CORS/availability could not be probed from
  the sandbox (the app loads them from the browser at runtime)
- terrain displacement and post-processing output have not been inspected
  visually

Feed shapes were written against the providers' documented schemas and every
call site is guarded, but first run should be treated as a smoke test.

---

## Fixes from the first browser run

The first real browser session surfaced four runtime errors. Three were real
bugs, all now fixed:

1. **`object.intersectsFrustum is not a function`** — duplicate Three.js.
   `three-render-objects` requires peer `three >= 0.179` while the repo pinned
   `0.170.0`, so npm installed a *second* copy of three under `globe.gl`. The
   0.186 renderer calls `object.intersectsFrustum()`, which 0.170 objects do
   not have. Pinned `three` to `0.186.1` and reinstalled with the lockfile
   removed so the copy dedupes. Verify with `npm ls three --all` — expect one
   entry at every level.
2. **`LineSegmentsGeometry.computeBoundingSphere(): Computed radius is NaN`** —
   three-globe sets `dashScale = 1 / lineLength` for every dashed path, so a
   zero-length path produces `Infinity` and poisons the fat-line geometry.
   Dashes are now per-path (only the selected satellite's track is dashed) and
   paths are filtered on `pathLengthKm(...) > 1` before they reach globe.gl.
3. **Hydration mismatch on the UTC clock** — the chip rendered `Date.now()`
   during SSR, so server and client disagreed by a second. The clock now
   renders `--:--:--Z` until after mount.

The remaining console noise, `Failed to fetch` / `signal timed out` from
`lib/feeds.ts`, is environmental in the sandbox rather than a code defect:
the preview has no outbound egress, and the stack trace passes through
`chrome-extension://…/injectScriptAdjust.js`, i.e. a browser extension
patching `window.fetch`. Worth re-checking in a clean profile with real
network access before treating it as a bug.

---

## Known limitations

- **Vessels need a key.** There is no reliable keyless global AIS feed; the
  layer stays dark until an AISHub / Spire / Datalastic / MarineTraffic key is
  added.
- **Point merging trade-off.** Points are individual meshes so they stay
  clickable. "Merge points" in OPTICS trades clicking for speed on huge feeds.
- **OpenSky anonymous access** is heavily rate-limited; the route falls back to
  an adsb.lol regional query. Add OpenSky credentials for reliable global traffic.
- **Overpass layers** (cameras, installations) are slow by nature — off by
  default, cached 1h/12h on the proxy.
- **Elevation is a global overview, not city-scale terrain.** The opt-in
  Terrarium DEM samples zoom-3 coverage (~20 km/pixel at the equator); fine
  local relief and photorealistic 3D buildings still need higher-zoom terrain
  tiles or a different renderer.

---

## Backlog

**High**
1. Smoke-test every layer against live responses; fix shape drift.
2. 3D aircraft/ship models oriented by heading via `objectsData`.
3. Submarine cable + datacenter / critical-infrastructure datasets.
4. AI briefing: summarise what is currently in view (OpenAI key, optional).

**Medium**
5. Track trails: persist recent positions per entity and draw fading paths.
6. Region alerts: notify when new M5+ quakes or military traffic enter view.
7. Saved views / bookmarks with named shareable links.
8. Heatmap mode for quake and fire density.
9. Convoy/vessel dwell detection, gap analysis for AIS.

**Low**
10. Light HUD theme for daytime basemaps.
11. Voice control ("fly to Taipei", "show me military flights").
12. Unit tests for the parsers in `lib/sources.ts`.

---

## Development

```bash
git pull
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
npm run typecheck  # tsc --noEmit
```

Adding a layer is three steps: a `LayerDef` in `lib/layers.ts`, a loader +
normaliser in `lib/sources.ts` (plus an `/api/*` route if it needs caching or a
key), and a style entry in `components/GlobeView.tsx`. The dock, HUD counters
and dossier pick it up automatically.
