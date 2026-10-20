# OSINT Globe — Project Status

**Version:** 0.5.0 · **Updated:** 2026-10-20 · **Status:** ✅ Working, verified build + fixture-tested feeds

---

## What 0.5.0 changed

- **3D entity shapes for every layer** (`lib/entity-shapes.ts`, new) — each
  (kind, colour) pair builds ONE merged, vertex-coloured `BufferGeometry`
  prototype drawn with a single shared `MeshLambertMaterial`: aircraft and
  military contacts are swept-wing jets with engines and tailplanes, vessels
  are hull + deckhouse + bridge + funnel, satellites get body + solar wings +
  dish, the ISS a truss-and-arrays silhouette, plus radio masts, webcam
  cameras, Mapillary photo cards (capture-direction chevron), gradient flame
  cones, cratered volcanoes, flat spiral storms with an eye, flood discs with
  rooftops, finned rockets, roofed site blocks and gradient quake octahedra.
  Prototypes are cached per (kind, colour); meshes are one draw call each.
  three-globe's teardown `deallocate`s removed objects (geometry and material
  included), so the shared prototypes/material neutralise `dispose` — that is
  deliberate, not a leak.
- **Heading- and altitude-correct placement** — shapes are built in the
  objects-layer local frame (+Z surface normal, +Y north, +X east; verified
  numerically by `npm run verify:frame` against three-globe's own
  `polar2Cartesian`) and rotated by `-Heading`/`-Course` degrees so jets and
  hulls point along their live track. Aircraft AND military use the
  exaggerated flight-level curve `0.004 + min(alt_km, 14)·0.0008`;
  satellites/ISS sit at true SGP4 altitude. Object size scales with camera
  distance (`clamp(alt/2.4, 0.02, 1)`, applied by direct `mesh.scale` writes
  from the render tick — three-globe never touches mesh scale, so no data
  rebuilds are needed while zooming).
- **Object budgets & fallbacks** — flights > 3000 or military > 1500 contacts
  fall back to the points pipeline; "Merge points" (OPTICS) forces points for
  everything. Click/hover/dossier selection works on objects exactly like
  points (`objectLabel` + `onObjectClick` wired to the same selection path).
- **Day/Night terminator FIXED** — `terminatorRing` previously produced a
  wrong circle: the antipode longitude normalisation was applied to the
  subsolar longitude itself. The ring is now the true great circle 90° from
  the subsolar point; the smoke test asserts every point is exactly 90° away
  and the latitude span matches ±(90 − |declination|) at both solstices, both
  equinoxes and the live date.
- **Empty feeds no longer shadow healthy mirrors** — `fetchFirst` treats a
  candidate that parses to `[]` as a fallback, not a win (shape drift and
  throttled responses used to report the layer "online" with 0 items while a
  healthy mirror sat untried). All-empty → first empty answer; throw only
  when every candidate failed.
- **Military feed resilience** — added the `reapi.adsb.lol/v2/mil` mirror
  between adsb.lol and airplanes.live.
- **Public Cameras populate properly** — the global Overpass webcam query was
  heavy and regularly rate-limited. Webcams are now viewport-scoped: a bbox
  (≤ 60° span) rides `/api/webcams/osm|windy` and is injected into the
  Overpass query; wide views keep the global query. The layer re-fetches when
  the view settles on a new region (2.5 s debounce), and polls every 120 s.
- **Street Imagery wide views answer cleanly** — with a token but a
  wider-than-4° view, `loadMapillary` returns an empty success labelled
  "Mapillary — zoom in to query" without any network request; the proxy does
  the same when no bbox has arrived yet. The layer shows green with an
  actionable label instead of an error.
- **Street-level zoom** — `controls.minDistance` 101.5 → 100.07 (~4.5 km
  above the surface, inside the near-plane safety margin), `zoomBy` floor
  0.02 → 0.0008, joystick pan altitude floor 0.05 → 0.003. Basemap max zoom
  raised: satellite 14 → 19, street 14 → 19, dark 12 → 20, topo 13 → 17 —
  buildings and streets are readable at the closest view.
- **Tests** — smoke suite 96 → 178 assertions: terminator geometry (5 dates ×
  4 invariants), `fetchFirst` fallthrough matrix, webcams bbox routing,
  Mapillary wide-view behaviour, reapi mirror, and entity-shape sanity
  (finite/bounded geometry for all 15 kinds, cache identity, heading parsing,
  dispose no-op). New `npm run verify:frame` golden model (30 assertions)
  pins the objects-layer local frame and heading sign.

---

## What 0.4.0 changed

- **Navigation joystick** (`components/JoystickNav.tsx`) — bottom-right stick
  for pan / zoom / tilt / heading. Pan speed scales with camera altitude and
  the basis follows the current heading, so stick-up always flies toward the
  top of the screen. Tilt runs 0–80° from nadir; heading is a compass roll;
  `⌖ N-UP` resets. The pad is keyboard-operable and the whole control can be
  hidden in OPTICS.
- **Camera orientation system** (`GlobeView.applyCameraOrientation`) — tilt
  and heading are applied by wrapping `camera.lookAt`, which OrbitControls
  calls every update immediately before the frame renders. The orientation is
  rebuilt from the base nadir view each time (idempotent, no drift) and never
  touches the controls' internal state, so drags, damping, flyTo tweens and
  programmatic pans all keep working. Verified by
  `npm run verify:nav` — a headless three.js golden model of the exact math
  (14 assertions: signs, pan basis, tilt elevation, polar clamp, idempotency).
- **Elevation surface opacity** — 0–100 % slider in OPTICS (persisted).
  0 % hides the mesh, <100 % renders it translucent over the imagery
  (`transparent`, no depth write), 100 % is a solid opaque shell.
- **Mapillary street imagery layer** — new `/api/mapillary` proxy (Graph API
  v4 `GET /images`, token from env or POWER UP, cached 60 s) with a direct
  browser fallback; city-scale bboxes only (wider views skip the query
  cleanly). Points render teal, 360° captures slightly larger; the dossier
  shows the thumbnail and links to the source photo (CC-BY-SA).
- **POWER UP keys now actually reach the proxies** — `feedHeaders` was defined
  but never used, so AIS / FIRMS / OpenSky / Windy keys pasted into the panel
  were silently dropped client-side. Keys now ride `x-ogd-keys` on the proxy
  candidate only (asserted by the smoke test: never attached to direct
  third-party requests).

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
- **`npm run smoke`** — 96 fixture assertions covering every feed loader,
  every entity mapper, the proxy → browser-direct fallback chain of each
  layer, and the SGP4 pipeline (real ISS TLE propagated at its epoch:
  420 km / 7.67 km/s; synthetic fresh TLE at now; ground-track continuity;
  footprint radius). Runs offline against stubbed `fetch`, so it works in
  sandboxes without egress. Also asserts POWER UP key routing (proxy-only
  header) and the Mapillary bbox reorder + zoom gate.
- **`npm run verify:nav`** — headless three.js golden model of the joystick
  orientation/pan math (14 assertions).

### Fix from the fixture smoke test

- **Satellites layer was silently empty through a healthy proxy.** The
  `/api/satellites` route normalises the catalogue server-side
  (`{name, noradId, tle, group}`), but the client's proxy candidate ran
  `parseCelestrakJson` over it, which expects CelesTrak GP-JSON fields
  (`TLE_LINE1`, `NORAD_CAT_ID`, …) — every record was dropped and the layer
  reported success with 0 objects. This was invisible in the egress-less
  sandbox (the proxy always fails there, so the direct TLE fallback hid it),
  but on any normal deployment the satellites layer would have been dark.
  `parseSatelliteItems` now accepts both shapes. The same audit confirmed
  every other proxy route's envelope items match the client record types.
- **OSM infrastructure direct fallback** labelled tag-mismatched elements
  "Installation" instead of dropping them; now matches the proxy route's
  `classify()` semantics (drop unknowns).

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
  clickable. "Merge points" in OPTICS trades clicking for speed on huge feeds;
  with it off, entity layers render as 3D shapes and the busiest feeds
  (flights > 3000, military > 1500) fall back to points to cap the mesh count.
- **OpenSky anonymous access** is heavily rate-limited; the route falls back to
  an adsb.lol regional query. Add OpenSky credentials for reliable global traffic.
- **Overpass layers** (cameras, installations) are slow by nature — off by
  default, cached 1h/12h on the proxy. Cameras are viewport-scoped now, so the
  heavy global query only runs on wide views.
- **Elevation is a global overview, not city-scale terrain.** The opt-in
  Terrarium DEM samples zoom-3 coverage (~20 km/pixel at the equator); fine
  local relief and photorealistic 3D buildings still need higher-zoom terrain
  tiles or a different renderer.

---

## Backlog

Backlog item 1 ("smoke-test every layer against live responses") is now
covered offline by `npm run smoke` — 178 fixture assertions across every
loader, parser, entity mapper and the SGP4 pipeline, including each layer's
proxy → browser-direct fallback chain. Remaining gap: live upstream payloads
still drift over time, so re-point fixtures at real responses occasionally.

**High**
2. Submarine cable + datacenter / critical-infrastructure datasets.
3. AI briefing: summarise what is currently in view (OpenAI key, optional).

**Medium**
4. Track trails: persist recent positions per entity and draw fading paths.
5. Region alerts: notify when new M5+ quakes or military traffic enter view.
6. Saved views / bookmarks with named shareable links.
7. Heatmap mode for quake and fire density.
8. Convoy/vessel dwell detection, gap analysis for AIS.

**Low**
9. Light HUD theme for daytime basemaps.
10. Voice control ("fly to Taipei", "show me military flights").
11. Unit tests for the parsers in `lib/sources.ts`.

---

## Development

```bash
git pull
npm install
npm run dev            # http://localhost:3000
npm run build          # production build
npm run typecheck      # tsc --noEmit
npm run smoke          # 178 fixture assertions across every feed + shapes
npm run verify:nav     # joystick / orientation golden model (14 assertions)
npm run verify:frame   # objects-layer frame + heading sign (30 assertions)
```

Adding a layer is three steps: a `LayerDef` in `lib/layers.ts`, a loader +
normaliser in `lib/sources.ts` (plus an `/api/*` route if it needs caching or a
key), and a shape builder + `OBJECT_BASE_SCALE` entry in
`lib/entity-shapes.ts` (plus a `STYLES` entry for the points fallback). The
dock, HUD counters and dossier pick it up automatically.
