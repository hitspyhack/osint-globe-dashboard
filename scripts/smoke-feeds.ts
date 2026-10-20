/**
 * Fixture-driven smoke test for every feed loader.
 *
 * Exercises the exact client code path the browser runs — `fetchFirst` with
 * its proxy → direct fallback chain — against realistic provider payloads,
 * plus the SGP4 propagation pipeline. No network access required:
 *
 *   npm run smoke
 *
 * Fixtures follow each provider's documented response schema:
 *   OpenSky /states/all, adsb.lol + airplanes.live v2, AISHub (normalised
 *   envelope), CelesTrak GP JSON + 3LE text, Open Notify, wheretheiss.at,
 *   USGS FDSN GeoJSON, NASA EONET v2.1, Windy webcams, OSM Overpass,
 *   Radio Browser, Launch Library 2.
 */

import {
  aircraftToEntity,
  hazardToEntity,
  launchToEntity,
  loadFires,
  loadFlights,
  loadHazards,
  loadIss,
  loadLaunches,
  loadMilitary,
  loadQuakes,
  loadRadio,
  loadSatelliteGroup,
  loadSites,
  loadVessels,
  loadWebcams,
  loadMapillary,
  mapillaryToEntity,
  parseTleText,
  quakeToEntity,
  radioToEntity,
  siteToEntity,
  vesselToEntity,
  webcamToEntity,
  type AircraftRecord,
} from "../lib/sources";
import { FeedError, parseEnvelope } from "../lib/feeds";
import {
  footprintRadius,
  groundTrack,
  propagateSatellite,
  propagateSatellites,
  splitTle,
} from "../lib/satellite-propagation";
import type { ApiKeyMap } from "../types";

/* ------------------------------------------------------------------ *
 * Tiny assertion helpers
 * ------------------------------------------------------------------ */

let passed = 0;
let failed = 0;

function ok(condition: unknown, label: string, detail?: unknown): void {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
  }
}

function near(value: number, target: number, tolerance: number): boolean {
  return Number.isFinite(value) && Math.abs(value - target) <= tolerance;
}

function inRange(value: number, min: number, max: number): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
}

/* ------------------------------------------------------------------ *
 * Fetch stub with per-URL fixtures
 * ------------------------------------------------------------------ */

interface StubResponse {
  status?: number;
  body: string;
}

const routes = new Map<string, StubResponse>();
/** URL fragments that should raise a network error (like a CORS failure). */
const deadUrls: string[] = [];
/** Every fetch the stub saw, to assert where key headers actually go. */
const requestLog: Array<{ url: string; headers: Record<string, string> }> = [];

function jsonResponse(value: unknown, status = 200): StubResponse {
  return { status, body: JSON.stringify(value) };
}

function failEnvelope(error = "fetch failed"): StubResponse {
  return jsonResponse({ ok: false, items: [], error, needsKey: false });
}

const realFetch = globalThis.fetch;

async function stubbedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input instanceof Request ? input.url : input);

  const loggedHeaders: Record<string, string> = {};
  try {
    new Headers(init?.headers).forEach((value, key) => {
      loggedHeaders[key] = value;
    });
  } catch {
    /* no headers */
  }
  requestLog.push({ url, headers: loggedHeaders });

  for (const dead of deadUrls) {
    if (url.includes(dead)) {
      throw new TypeError("Failed to fetch (simulated network/CORS failure)");
    }
  }

  for (const [fragment, response] of routes) {
    if (url.includes(fragment)) {
      return new Response(response.body, {
        status: response.status ?? 200,
        headers: { "content-type": response.body.startsWith("[") || response.body.startsWith("{") ? "application/json" : "text/plain" },
      });
    }
  }

  throw new Error(`smoke test: unexpected fetch ${url} (init ${JSON.stringify(init?.method ?? "GET")})`);
}

function resetFetchStubs(): void {
  routes.clear();
  deadUrls.length = 0;
  requestLog.length = 0;
}

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

const OPENSKY_STATES = jsonResponse({
  time: 1760000000,
  states: [
    // icao24, callsign, origin_country, time_pos, last_contact, lon, lat,
    // baro_alt, on_ground, velocity, heading, vert_rate, sensors,
    // geo_alt, squawk, spi, position_source
    ["4b1815", "SWR52T  ", "Switzerland", 1760000000, 1760000000, 8.549, 47.457, 11430, false, 221.5, 273.4, -1.6, null, 11650, "1000", false, 0],
    ["c820a6", "N738AK", "United States", 1760000000, 1760000000, -118.24, 33.94, 0, true, 4.2, 90.0, 0, null, 0, null, false, 0],
    ["3c66b3", "DLH441", "Germany", 1760000000, 1760000000, 10.05, 50.12, 10668, false, 245.1, 87.2, 4.8, null, 10700, "2757", false, 0],
    ["deadbe", null, "Nowhere", 0, 0, null, null, 5000, false, 100, 0, 0, null, 5000, null, false, 0],
  ],
});

const ADSB_LOL_MIL = jsonResponse({
  ac: [
    { hex: "ae1234", flight: "RCH451 ", r: "01-2001", t: "C17", alt_baro: 31000, gs: 410.0, track: 92.1, baro_rate: 0, squawk: "4221", lat: 49.01, lon: 2.55, ownOp: "USAF" },
    { hex: "ae5678", flight: "NATO01", r: "NCT-77", t: "E3TF", alt_baro: "ground", gs: 0.0, track: 0, baro_rate: 0, lat: 51.4, lon: 6.9 },
  ],
});

const AIRPLANES_LIVE_MIL = jsonResponse({
  ac: [
    { hex: "aeabcd", flight: "RRR7210", t: "GLF6", alt_baro: 41000, gs: 480.0, track: 45.0, lat: -23.5, lon: -46.6 },
  ],
});

const AIS_ENVELOPE = jsonResponse({
  ok: true,
  items: [
    { mmsi: "244110001", name: "ORION", lat: 38.7, lng: -9.4, speed: 12.4, course: 275, type: "70", destination: "LISBOA", flag: "Netherlands" },
    { mmsi: "209412000", name: "AURORA BOREALIS", lat: 51.9, lng: 4.1, speed: 8.1, course: 91, type: "80", destination: "ROTTERDAM", flag: "Cyprus" },
  ],
  source: "AISHub",
});

// Real ISS TLE (epoch 2024-01-31 ~13:09 UTC), propagated at its own epoch.
const ISS_TLE = [
  "ISS (ZARYA)",
  "1 25544U 98067A   24031.54791435  .00016717  00000+0  30777-3 0  9993",
  "2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.49543219431365",
].join("\n");

const CELESTRAK_JSON = jsonResponse({
  ok: true,
  items: [
    {
      OBJECT_NAME: "ISS (ZARYA)",
      NORAD_CAT_ID: 25544,
      EPOCH: "2024-01-31T13:09:00.000Z",
      TLE_LINE1: "1 25544U 98067A   24031.54791435  .00016717  00000+0  30777-3 0  9993",
      TLE_LINE2: "2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.49543219431365",
    },
    {
      OBJECT_NAME: "CSS (TIANHE)",
      NORAD_CAT_ID: 48274,
      EPOCH: "2024-01-30T00:00:00.000Z",
      TLE_LINE1: "1 48274U 21035A   24030.00000000  .00016717  00000+0  30777-3 0  9990",
      TLE_LINE2: "2 48274  41.4716 100.0000 0006703 130.5360 325.0288 15.60000000000000",
    },
  ],
  source: "CelesTrak GP",
});

const OPEN_NOTIFY = jsonResponse({
  message: "success",
  timestamp: 1760000000,
  iss_position: { latitude: "-12.3456", longitude: "45.6789" },
});

const WHERETHEISS = jsonResponse({
  name: "iss",
  id: 25544,
  latitude: 12.3456,
  longitude: -45.6789,
  altitude: 419.62,
  velocity: 27588.6,
  visibility: "daylight",
  footprint: 2252.4,
  timestamp: 1760000000,
});

const USGS_GEOJSON = jsonResponse({
  features: [
    {
      id: "us7000abcd",
      properties: { mag: 5.6, place: "132 km SW of Setúbal, Portugal", time: 1759990000000, url: "https://earthquake.usgs.gov/earthquakes/eventpage/us7000abcd", tsunami: 0, alert: "green", type: "earthquake" },
      geometry: { coordinates: [-9.6, 37.9, 10.0] },
    },
    {
      id: "us7000ffff",
      properties: { mag: 2.1, place: "Somewhere", time: 1759980000000, url: null, tsunami: 0, alert: null, type: "earthquake" },
      geometry: null,
    },
  ],
});

const EONET_WILDFIRES = jsonResponse({
  events: [
    {
      id: "EONET_7201",
      title: "Wildfires - Serra da Arrábida",
      closed: null,
      categories: [{ id: 8, title: "Wildfires" }],
      sources: [{ id: "FIRMS", url: "https://firms.modaps.eosdis.nasa.gov/map/#d:24hrs" }],
      geometries: [
        { date: "2026-10-18T00:00:00Z", type: "Point", coordinates: [-9.02, 38.48], magnitudeValue: 12.4, magnitudeUnit: "FRP MW" },
      ],
    },
    {
      id: "EONET_7202",
      title: "Old closed fire",
      closed: "2026-09-01T00:00:00Z",
      sources: [],
      geometries: [{ date: "2026-08-30T00:00:00Z", type: "Point", coordinates: [4.0, 44.0] }],
    },
  ],
});

const EONET_VOLCANOES = jsonResponse({
  events: [
    {
      id: "EONET_6501",
      title: "Erta Ale Volcano",
      closed: null,
      sources: [{ id: "EO", url: "https://eonet.gsfc.nasa.gov" }],
      geometries: [{ date: "2026-10-15T00:00:00Z", type: "Point", coordinates: [40.67, 13.6] }],
    },
  ],
});

const WINDY_WEBCAMS = jsonResponse({
  ok: true,
  items: [
    {
      id: "1512345678",
      lat: 38.52,
      lng: -8.9,
      title: "Setúbal Bay",
      imageUrl: "https://example.com/preview.jpg",
      embedUrl: "https://example.com/embed",
      source: "windy",
    },
  ],
  source: "Windy",
});

const OVERPASS_WEBCAMS = jsonResponse({
  elements: [
    { type: "node", id: 123456, lat: 41.14, lon: -8.61, tags: { name: "Porto Cam", "contact:webcam": "https://example.com/porto" } },
    { type: "node", id: 789012, lat: 38.72, lon: -9.14, tags: { name: "Lisbon Skyline", webcam: "https://example.com/lisboa" } },
    { type: "node", id: 999, lat: null, lon: null, tags: {} },
  ],
});

const MAPILLARY_PROXY = jsonResponse({
  ok: true,
  items: [
    { id: "mly-111", lat: 38.524, lng: -8.888, thumbUrl: "https://example.com/mly-111.jpg", capturedAt: 1759990000000, isPano: true, compassAngle: 271.4 },
    { id: "mly-222", lat: 38.531, lng: -8.901, thumbUrl: undefined, capturedAt: undefined, isPano: false, compassAngle: undefined },
  ],
  source: "Mapillary",
});

const MAPILLARY_DIRECT = jsonResponse({
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      id: "mly-333",
      geometry: { type: "Point", coordinates: [-9.14, 38.72] },
      properties: { compass_angle: 42.0, thumb_1024_url: "https://example.com/mly-333.jpg", captured_at: 1759991000000, is_pano: false },
    },
    { type: "Feature", id: "mly-bad", geometry: { type: "Point", coordinates: [] }, properties: {} },
  ],
});

const RADIO_BROWSER = jsonResponse([  {
    stationuuid: "9606a7d1-0e1e-4a1c-acb5-7f6c9d8e1a2b",
    name: "Rádio Comercial",
    url: "http://example.com/stream",
    url_resolved: "https://example.com/stream.mp3",
    homepage: "https://example.com",
    codec: "MP3",
    bitrate: 128,
    tags: "pop,rock,portugal",
    country: "Portugal",
    geo_lat: 38.72,
    geo_long: -9.14,
    votes: 1234,
  },
  { stationuuid: "dead", name: "No geo station", geo_lat: null, geo_long: null },
]);

const LAUNCH_LIBRARY = jsonResponse({
  results: [
    {
      id: "3b5b2c1e-0000-4a00-9000-000000000001",
      name: "Falcon 9 Block 5 | Starlink Group 12-3",
      net: "2026-10-22T02:30:00Z",
      window_start: "2026-10-22T02:30:00Z",
      window_end: "2026-10-22T06:00:00Z",
      status: { name: "Go for Launch" },
      pad: { name: "Space Launch Complex 40", latitude: 28.562, longitude: -80.577, location: { name: "Cape Canaveral, FL, USA" } },
      rocket: { configuration: { full_name: "Falcon 9 Block 5", name: "Falcon 9" } },
      mission: { name: "Starlink Group 12-3" },
      vidURLs: [{ url: "https://www.youtube.com/watch?v=example" }],
      webcast: null,
    },
  ],
});

const OVERPASS_SITES = jsonResponse({
  elements: [
    { type: "node", id: 1001, lat: 38.774, lon: -9.134, tags: { aeroway: "aerodrome", iata: "LBX", name: "Lisbon Airport" } },
    { type: "way", id: 2002, center: { lat: 38.5, lon: -8.9 }, tags: { landuse: "harbour", name: "Porto de Setúbal" } },
    { type: "way", id: 3003, center: { lat: 38.7, lon: -9.0 }, tags: { landuse: "military", name: "Base Militar de Lisboa" } },
    { type: "node", id: 4004, lat: 41.0, lon: -8.2, tags: { power: "plant", "plant:source": "nuclear", name: "Central Nuclear" } },
    { type: "node", id: 5005, lat: 40.0, lon: -7.0, tags: { shop: "supermarket" } },
  ],
});

/* ------------------------------------------------------------------ *
 * TLE builder — synthetic, valid checksums, epoch = now
 * ------------------------------------------------------------------ */

function tleChecksum(line: string): number {
  let sum = 0;
  for (const character of line.slice(0, 68)) {
    if (character >= "0" && character <= "9") sum += Number(character);
    else if (character === "-") sum += 1;
  }
  return sum % 10;
}

function withChecksum(line: string): string {
  return `${line.slice(0, 68)}${tleChecksum(line)}`;
}

/** Build a fresh LEO TLE (a ~420 km, 51.6° orbit) with today's epoch. */
function syntheticTle(): [string, string] {
  const now = new Date();
  const startOfYear = Date.UTC(now.getUTCFullYear(), 0, 1);
  const dayOfYear = (now.getTime() - startOfYear) / 86_400_000 + 1;
  const epoch = `${String(now.getUTCFullYear() % 100).padStart(2, "0")}${String(Math.floor(dayOfYear)).padStart(3, "0")}.${String(Math.floor((dayOfYear % 1) * 1e8)).padStart(8, "0")}`;

  const line1 = withChecksum(
    `1 99999U 26099A   ${epoch}  .00005000  00000+0  10000-3 0  9990`.padEnd(68, " ").slice(0, 68)
  );
  const line2 = withChecksum(
    `2 99999  51.6400 120.0000 0001500  90.0000 270.0000 15.50000000`
  );
  return [line1, line2];
}

/* ------------------------------------------------------------------ *
 * Tests
 * ------------------------------------------------------------------ */

const NO_KEYS: ApiKeyMap = {};
const WINDY_KEYS: ApiKeyMap = { WINDY: "test-key" };

async function testFlights(): Promise<void> {
  console.log("\n✈  flights (OpenSky states)");

  // Path A: proxy fails → OpenSky direct succeeds; ground + coord-less dropped.
  resetFetchStubs();
  routes.set("/api/aviation", failEnvelope());
  routes.set("opensky-network.org/api/states/all", OPENSKY_STATES);
  let result = await loadFlights(NO_KEYS);
  ok(result.source === "opensky/direct", "falls back to opensky/direct", result.source);
  ok(result.items.length === 2, "keeps airborne aircraft, drops on-ground + null coords", result.items.length);
  ok(result.items.every((a) => !a.onGround), "ground contacts filtered");
  const swr = result.items.find((a) => a.icao24 === "4b1815") as AircraftRecord;
  ok(near(swr.lat, 47.457, 1e-6) && near(swr.lng, 8.549, 1e-6), "lat/lng mapped from state[6]/state[5]");
  ok(near(swr.altitude, 11430, 1e-6), "baro altitude in metres", swr.altitude);
  ok(swr.callsign === "SWR52T", "callsign trimmed", swr.callsign);

  // Path B: OpenSky also unreachable → adsb.lol regional point query.
  resetFetchStubs();
  routes.set("/api/aviation", failEnvelope());
  deadUrls.push("opensky-network.org");
  routes.set(
    "api.adsb.lol/v2/point/20/0/250",
    jsonResponse({
      ac: [
        { hex: "4b1815", flight: "SWR52T ", r: "HB-JNQ", t: "A333", alt_baro: 35000, gs: 480.0, track: 273.4, baro_rate: -64, squawk: "1000", lat: 47.4, lon: 8.5, ownOp: "Swiss" },
      ],
    })
  );
  result = await loadFlights(NO_KEYS);
  ok(result.source === "adsb.lol", "falls back to adsb.lol", result.source);
  const adsb = result.items[0];
  ok(near(adsb.altitude, 35000 * 0.3048, 0.1), "adsb.lol altitude converted ft → m", adsb.altitude);
  ok(near(adsb.velocity, 480 * 0.514444, 0.01), "ground speed converted kt → m/s", adsb.velocity);
  ok(adsb.registration === "HB-JNQ" && adsb.type === "A333", "registration + type mapped");

  const entity = aircraftToEntity(adsb, "aircraft");
  ok(entity.kind === "aircraft" && inRange(entity.lat, -90, 90) && Boolean(entity.label), "aircraftToEntity", entity);
}

async function testMilitary(): Promise<void> {
  console.log("\n🎖  military traffic (adsb.lol / airplanes.live)");

  resetFetchStubs();
  routes.set("/api/aviation?scope=mil", failEnvelope());
  routes.set("api.adsb.lol/v2/mil", ADSB_LOL_MIL);
  let result = await loadMilitary(NO_KEYS);
  ok(result.source === "adsb.lol", "falls back to adsb.lol /v2/mil", result.source);
  ok(result.items.length === 2, "ground military contact kept (watched by pad spotters)", result.items.length);
  const reach = result.items[0];
  ok(reach.type === "C17" && reach.origin === "USAF", "type + operator mapped");

  resetFetchStubs();
  routes.set("/api/aviation?scope=mil", failEnvelope());
  deadUrls.push("api.adsb.lol");
  routes.set("api.airplanes.live/v2/mil", AIRPLANES_LIVE_MIL);
  result = await loadMilitary(NO_KEYS);
  ok(result.source === "airplanes.live", "mirror fallback to airplanes.live", result.source);
  ok(result.items.length === 1 && result.items[0].callsign === "RRR7210", "airplanes.live parsed");

  const entity = aircraftToEntity(reach, "military");
  ok(entity.kind === "military" && entity.id === "military:ae1234", "military entity id/kind", entity.id);
}

async function testVessels(): Promise<void> {
  console.log("\n🚢  vessels (keyed AIS envelope)");

  resetFetchStubs();
  routes.set("/api/maritime", AIS_ENVELOPE);
  const result = await loadVessels(NO_KEYS, "37,-10,40,-7");
  ok(result.source === "ais/proxy", "proxy used for AIS", result.source);
  ok(result.items.length === 2, "two vessels");
  ok(result.items[0].mmsi === "244110001" && result.items[0].destination === "LISBOA", "AISHub fields mapped");
  const entity = vesselToEntity(result.items[0]);
  ok(entity.kind === "vessel" && entity.label === "ORION", "vesselToEntity", entity.label);
}

async function testSatellites(): Promise<void> {
  console.log("\n🛰  satellites (CelesTrak GP JSON + 3LE text + SGP4)");

  resetFetchStubs();
  // The /api/satellites route normalises the catalogue server-side.
  routes.set(
    "/api/satellites?group=stations",
    jsonResponse({
      ok: true,
      items: [
        { name: "ISS (ZARYA)", noradId: 25544, tle: ISS_TLE.split("\n").slice(1).join("\n"), group: "stations" },
        { name: "CSS (TIANHE)", noradId: 48274, tle: "1 48274U 21035A   24030.00000000  .00016717  00000+0  30777-3 0  9990\n2 48274  41.4716 100.0000 0006703 130.5360 325.0288 15.60000000000000", group: "stations" },
      ],
      source: "CelesTrak:stations",
    })
  );
  let result = await loadSatelliteGroup("stations");
  ok(result.source.startsWith("celestrak/proxy"), "proxy candidate wins when healthy", result.source);
  ok(result.items.length === 2, "normalised proxy records accepted", result.items.length);
  ok(result.items[0].name === "ISS (ZARYA)" && result.items[0].group === "stations", "proxy record fields", result.items[0]);
  ok(result.items[0].tle.includes("\n"), "TLE lines joined with a real newline");

  // A GP-JSON passthrough envelope must still parse (shape tolerance).
  resetFetchStubs();
  routes.set("/api/satellites?group=stations", CELESTRAK_JSON);
  result = await loadSatelliteGroup("stations");
  ok(result.items.length === 2 && result.items[0].name === "ISS (ZARYA)", "GP JSON envelope accepted too", result.items[0]?.name);

  resetFetchStubs();
  routes.set("/api/satellites?group=stations", failEnvelope());
  routes.set(
    "celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle",
    { body: `ISS (ZARYA)\r\n${ISS_TLE.split("\n").slice(1).join("\r\n")}\r\n\r\nCSS (TIANHE)\r\n1 48274U 21035A   24030.00000000  .00016717  00000+0  30777-3 0  9990\r\n2 48274  41.4716 100.0000 0006703 130.5360 325.0288 15.60000000000000` }
  );
  result = await loadSatelliteGroup("stations");
  ok(result.source === "celestrak/direct:stations", "direct TLE fallback", result.source);
  ok(result.items.length === 2 && result.items[0].name === "ISS (ZARYA)", "3LE names recovered from name lines");

  const parsed = parseTleText("truncated catalogue\n1 25544U 98067A   24031.54791435  .00016717  00000+0  30777-3 0  9993\nno line two here", "stations");
  ok(parsed.length === 0, "truncated TLE pair dropped", parsed);

  // SGP4: historical ISS TLE propagated at its own epoch.
  const lines = splitTle(ISS_TLE);
  ok(Array.isArray(lines) && lines?.[0].startsWith("1 ") && lines?.[1].startsWith("2 "), "splitTle handles name line");
  ok(splitTle("1 only\nnope") === null, "splitTle rejects incomplete input");

  const epoch = new Date("2024-01-31T13:09:00Z");
  const fix = propagateSatellite(lines![0], lines![1], epoch);
  ok(fix !== null, "propagation returns a fix");
  ok(inRange(fix!.lat, -90, 90) && inRange(fix!.lng, -180, 180), "geodetic coords in range", fix);
  ok(inRange(fix!.altitude, 350, 480), `altitude ≈ 420 km (got ${fix!.altitude.toFixed(1)})`);
  ok(inRange(fix!.velocity, 7.3, 8.0), `orbital speed ≈ 7.66 km/s (got ${fix!.velocity.toFixed(2)})`);
  ok(near(footprintRadius(420), 2247, 120), "footprint radius for 420 km ≈ 2250 km", footprintRadius(420));

  // Synthetic fresh TLE propagated at now.
  const [synthetic1, synthetic2] = syntheticTle();
  const nowFix = propagateSatellite(synthetic1, synthetic2, new Date());
  ok(nowFix !== null && inRange(nowFix!.altitude, 350, 480), `synthetic TLE propagates at now (alt ${nowFix?.altitude.toFixed(1)} km)`);
  ok(propagateSatellite("garbage", "more garbage") === null, "malformed TLE returns null, does not throw");

  const propagated = propagateSatellites(
    [
      { name: "ISS", noradId: 25544, tle: ISS_TLE },
      { name: "Broken", noradId: 0, tle: "not a tle" },
    ],
    epoch
  );
  ok(propagated.length === 1 && propagated[0].name === "ISS", "propagateSatellites drops broken entries");
  ok(propagated[0].noradId === 25544, "noradId preserved");

  const track = groundTrack({ name: "ISS", noradId: 25544, tle: ISS_TLE }, epoch, 90, 60);
  ok(track.length === 61, "ground track samples", track.length);
  ok(track.every((p) => inRange(p.lat, -90, 90) && inRange(p.lng, -540, 540)), "track coords finite");
  const maxStep = track.slice(1).reduce((max, point, index) => {
    const previous = track[index];
    return Math.max(max, Math.hypot(point.lat - previous.lat, point.lng - previous.lng));
  }, 0);
  ok(maxStep < 30, "track is contiguous (no antimeridian snap)", maxStep);
}

async function testIss(): Promise<void> {
  console.log("\n🧑‍🚀  ISS position");

  resetFetchStubs();
  routes.set("/api/iss", failEnvelope());
  routes.set("api.open-notify.org/iss-now.json", OPEN_NOTIFY);
  let result = await loadIss();
  ok(result.source === "open-notify", "falls back to Open Notify", result.source);
  ok(near(result.items[0].lat, -12.3456, 1e-4) && near(result.items[0].lng, 45.6789, 1e-4), "string coords parsed");

  resetFetchStubs();
  routes.set("/api/iss", failEnvelope());
  deadUrls.push("api.open-notify.org"); // http:// endpoint is mixed content on HTTPS pages
  routes.set("api.wheretheiss.at/v1/satellites/25544", WHERETHEISS);
  result = await loadIss();
  ok(result.source === "wheretheiss.at", "second fallback to wheretheiss.at", result.source);
  ok(near(result.items[0].altitudeKm, 419.62, 0.01), "altitude from wheretheiss.at", result.items[0].altitudeKm);
}

async function testQuakes(): Promise<void> {
  console.log("\n🌋  earthquakes (USGS FDSN)");

  resetFetchStubs();
  routes.set("/api/quakes", failEnvelope());
  routes.set("earthquake.usgs.gov/fdsnws/event/1/query", USGS_GEOJSON);
  const result = await loadQuakes({ start: "2026-10-19", end: "2026-10-20" });
  ok(result.source === "usgs/direct", "falls back to USGS direct", result.source);
  ok(result.items.length === 1, "null-geometry feature dropped", result.items.length);
  const quake = result.items[0];
  ok(near(quake.lat, 37.9, 1e-6) && near(quake.lng, -9.6, 1e-6), "geojson coords lng/lat order respected");
  ok(near(quake.mag, 5.6, 1e-6) && near(quake.depthKm, 10, 1e-6), "magnitude + depth");
  const entity = quakeToEntity(quake);
  ok(entity.kind === "quake" && entity.label.includes("M 5.6"), "quakeToEntity label", entity.label);
}

async function testHazards(): Promise<void> {
  console.log("\n🔥  wildfires + volcanoes (EONET)");

  resetFetchStubs();
  routes.set("/api/fires", failEnvelope());
  routes.set("eonet.gsfc.nasa.gov/api/v2.1/events", EONET_WILDFIRES);
  let result = await loadFires(NO_KEYS, { category: "wildfires", days: 5 });
  ok(result.source === "eonet/direct:wildfires", "falls back to EONET direct", result.source);
  ok(result.items.length === 2, "open + closed events both kept (closed flag marks them)");
  const fire = result.items[0];
  ok(fire.magnitude === "12.4 FRP MW" && fire.category === "wildfires", "geometry magnitude mapped", fire.magnitude);
  const fireEntity = hazardToEntity(fire, "fire");
  ok(fireEntity.kind === "fire" && fireEntity.link?.includes("firms"), "hazardToEntity fire", fireEntity);

  resetFetchStubs();
  routes.set("/api/hazards", failEnvelope());
  routes.set("eonet.gsfc.nasa.gov/api/v2.1/events", EONET_VOLCANOES);
  result = await loadHazards({ category: "volcanoes", days: 30 });
  ok(result.items.length === 1 && result.items[0].title.includes("Erta Ale"), "volcano category parsed");
}

async function testWebcams(): Promise<void> {
  console.log("\n📹  public cameras (Windy + OSM Overpass)");

  // Keyless: OSM proxy fails → Overpass direct.
  resetFetchStubs();
  routes.set("/api/webcams/osm", failEnvelope());
  routes.set("overpass-api.de/api/interpreter", OVERPASS_WEBCAMS);
  let result = await loadWebcams(NO_KEYS);
  ok(result.source === "osm/direct", "falls back to Overpass direct", result.source);
  ok(result.items.length === 2, "null-coordinate node dropped", result.items.length);
  ok(result.items[1].embedUrl === "https://example.com/lisboa", "webcam=* tag read");
  const entity = webcamToEntity(result.items[0]);
  ok(entity.kind === "webcam" && entity.embedUrl === "https://example.com/porto", "webcamToEntity", entity);

  // Keyed: Windy envelope wins when a key is present.
  resetFetchStubs();
  routes.set("/api/webcams/windy", WINDY_WEBCAMS);
  result = await loadWebcams(WINDY_KEYS);
  ok(result.source === "windy/proxy", "windy candidate tried first with a key", result.source);
  ok(result.items.length === 1 && result.items[0].title === "Setúbal Bay", "windy payload parsed");
}

async function testMapillary(): Promise<void> {
  console.log("\n📷  street imagery (Mapillary)");

  const KEYS: ApiKeyMap = { MAPILLARY: "MLY|test|token" };

  // Path A: proxy healthy with normalised items; the key rides the
  // x-ogd-keys header on the proxy request only.
  resetFetchStubs();
  routes.set("/api/mapillary", MAPILLARY_PROXY);
  let result = await loadMapillary(KEYS, "38.4,-9.0,38.6,-8.8");
  ok(result.source === "mapillary/proxy", "proxy candidate used", result.source);
  ok(result.items.length === 2, "normalised proxy records accepted", result.items.length);
  const proxyRequest = requestLog.find((entry) => entry.url.includes("/api/mapillary"));
  ok(Boolean(proxyRequest?.headers["x-ogd-keys"]), "POWER UP key sent to the proxy via x-ogd-keys");
  ok(
    !requestLog.some((entry) => !entry.url.includes("/api/") && entry.headers["x-ogd-keys"]),
    "key header never attached to direct third-party requests"
  );
  const pano = result.items[0];
  ok(pano.isPano && pano.thumbUrl?.includes("mly-111"), "pano flagged, thumb mapped");
  const entity = mapillaryToEntity(pano);
  ok(
    entity.kind === "mapillary" && entity.link === "https://www.mapillary.com/app/?pKey=mly-111" && entity.imageUrl === pano.thumbUrl,
    "mapillaryToEntity image + source link",
    entity.link
  );

  // Path B: proxy fails → direct browser fetch with the token in the URL and
  // the bbox reordered to Mapillary's minLng,minLat,maxLng,maxLat.
  resetFetchStubs();
  routes.set("/api/mapillary", failEnvelope());
  routes.set("graph.mapillary.com/images", MAPILLARY_DIRECT);
  result = await loadMapillary(KEYS, "38.4,-9.0,38.6,-8.8");
  ok(result.source === "mapillary/direct", "falls back to mapillary/direct", result.source);
  const directRequest = requestLog.find((entry) => entry.url.includes("graph.mapillary.com"));
  ok(Boolean(directRequest?.url.includes("access_token=MLY%7Ctest%7Ctoken")), "token carried in the direct URL");
  ok(
    Boolean(directRequest?.url.includes("bbox=-9,38.4,-8.8,38.6")),
    "bbox reordered to west,south,east,north",
    directRequest?.url
  );
  ok(result.items.length === 1 && result.items[0].id === "mly-333", "GeoJSON features parsed, empty coords dropped");
  ok(near(result.items[0].lat, 38.72, 1e-6) && near(result.items[0].lng, -9.14, 1e-6), "lng/lat order respected");

  // Path C: zoomed out — the direct candidate is skipped entirely.
  resetFetchStubs();
  routes.set("/api/mapillary", failEnvelope());
  let threw: unknown = null;
  try {
    await loadMapillary(KEYS, "-60,-170,60,170");
  } catch (error) {
    threw = error;
  }
  ok(threw instanceof FeedError, "wide bbox raises instead of querying Mapillary");
  ok(
    !requestLog.some((entry) => entry.url.includes("graph.mapillary.com")),
    "no direct Mapillary request when zoomed out"
  );

  // No key: only the proxy candidate exists.
  resetFetchStubs();
  routes.set("/api/mapillary", failEnvelope());
  threw = null;
  try {
    await loadMapillary(NO_KEYS, "38.4,-9.0,38.6,-8.8");
  } catch (error) {
    threw = error;
  }
  ok(threw instanceof FeedError, "no key + dead proxy → FeedError");
  ok(!requestLog.some((entry) => entry.url.includes("graph.mapillary.com")), "no direct request without a token");
}

async function testRadio(): Promise<void> {
  console.log("\n📻  radio grid (Radio Browser) + key routing");

  // POWER UP keys must reach our own proxies (x-ogd-keys) and never leak to
  // direct third-party requests.
  resetFetchStubs();
  routes.set("/api/maritime", AIS_ENVELOPE);
  await loadVessels({ AIS: "aishub-token" }, "37,-10,40,-7");
  const maritimeRequest = requestLog.find((entry) => entry.url.includes("/api/maritime"));
  ok(Boolean(maritimeRequest?.headers["x-ogd-keys"]), "AIS key reaches the maritime proxy");
  ok(
    !requestLog.some((entry) => !entry.url.includes("/api/") && entry.headers["x-ogd-keys"]),
    "key header never leaks to third-party URLs"
  );

  resetFetchStubs();
  routes.set("/api/radio", failEnvelope());
  routes.set("de1.api.radio-browser.info", RADIO_BROWSER);
  const result = await loadRadio();
  ok(result.source === "radio-browser/de1", "falls back to de1 mirror", result.source);
  ok(result.items.length === 1, "station without geo dropped", result.items.length);
  const station = result.items[0];
  ok(station.streamUrl === "https://example.com/stream.mp3" && station.country === "Portugal", "station fields mapped");
  const entity = radioToEntity(station);
  ok(entity.kind === "radio" && entity.streamUrl === station.streamUrl, "radioToEntity");
}

async function testLaunches(): Promise<void> {
  console.log("\n🚀  launch schedule (Launch Library 2)");

  resetFetchStubs();
  routes.set("/api/launches", failEnvelope());
  routes.set("ll.thespacedevs.com", LAUNCH_LIBRARY);
  const result = await loadLaunches();
  ok(result.source === "launch-library/direct", "falls back to LL2 direct", result.source);
  const launch = result.items[0];
  ok(near(launch.lat, 28.562, 1e-6) && near(launch.lng, -80.577, 1e-6), "pad coordinates");
  ok(launch.rocket === "Falcon 9 Block 5" && launch.status === "Go for Launch", "vehicle + status");
  ok(launch.webcast?.includes("youtube"), "webcast URL from vidURLs");
  const entity = launchToEntity(launch);
  ok(entity.kind === "launch" && entity.time === Date.parse("2026-10-22T02:30:00Z"), "launchToEntity time");
}

async function testSites(): Promise<void> {
  console.log("\n🏢  OSM infrastructure");

  resetFetchStubs();
  routes.set("/api/infrastructure", failEnvelope());
  routes.set("overpass-api.de/api/interpreter", OVERPASS_SITES);
  const result = await loadSites();
  ok(result.source === "osm/direct", "falls back to Overpass direct", result.source);
  const kinds = new Set(result.items.map((site) => site.kind));
  ok(kinds.has("Airfield") && kinds.has("Port") && kinds.has("Military") && kinds.has("Nuclear"), "union query bucketed by tags", [...kinds]);
  ok(!kinds.has("Installation"), "unrelated elements excluded");
  const entity = siteToEntity(result.items[0]);
  ok(entity.kind === "site" && entity.sublabel === "Airfield", "siteToEntity");
}

function testEnvelopes(): void {
  console.log("\n📮  envelope + error handling");

  ok((parseEnvelope({ ok: true, items: [1, 2] }) as unknown[]).length === 2, "success envelope returns items");
  let threw: unknown = null;
  try {
    parseEnvelope({ ok: false, items: [], error: "upstream down" });
  } catch (error) {
    threw = error;
  }
  ok(threw instanceof Error && (threw as Error).message === "upstream down", "failure envelope throws so fetchFirst moves on");

  const feedError = new FeedError("all dead", ["a: x", "b: y"]);
  ok(feedError.attempts.length === 2, "FeedError carries attempt log");
}

async function main(): Promise<void> {
  globalThis.fetch = stubbedFetch as typeof fetch;

  try {
    await testFlights();
    await testMilitary();
    await testVessels();
    await testSatellites();
    await testIss();
    await testQuakes();
    await testHazards();
    await testWebcams();
    await testMapillary();
    await testRadio();
    await testLaunches();
    await testSites();
    testEnvelopes();
  } finally {
    globalThis.fetch = realFetch;
  }

  console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed} passed, ${failed} failed`);
  process.exitCode = failed === 0 ? 0 : 1;
}

void main();
