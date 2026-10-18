import { fetchFirst, parseEnvelope, type FeedCandidate } from "@/lib/feeds";
import type { ApiKeyMap, Entity, EntityMeta } from "@/types";

/* ------------------------------------------------------------------ *
 * Normalised upstream records
 * ------------------------------------------------------------------ */

export interface AircraftRecord {
  icao24: string;
  callsign: string;
  lat: number;
  lng: number;
  /** metres */
  altitude: number;
  /** m/s */
  velocity: number;
  heading: number;
  verticalRate: number;
  squawk?: string;
  origin?: string;
  type?: string;
  registration?: string;
  onGround?: boolean;
}

export interface VesselRecord {
  mmsi: string;
  name: string;
  lat: number;
  lng: number;
  /** knots */
  speed?: number;
  course?: number;
  type?: string;
  destination?: string;
  flag?: string;
}

export interface SatelliteRecord {
  name: string;
  noradId: number;
  tle: string;
  group?: string;
  epoch?: string;
}

export interface QuakeRecord {
  id: string;
  mag: number;
  place: string;
  lat: number;
  lng: number;
  depthKm: number;
  time: number;
  url?: string;
  tsunami?: boolean;
  alert?: string | null;
}

export interface HazardRecord {
  id: string;
  title: string;
  lat: number;
  lng: number;
  date?: string;
  category?: string;
  source?: string;
  sourceUrl?: string;
  closed?: boolean;
  magnitude?: string;
}

export interface WebcamRecord {
  id: string;
  lat: number;
  lng: number;
  title: string;
  imageUrl?: string;
  embedUrl?: string;
  source: string;
}

export interface RadioRecord {
  id: string;
  name: string;
  lat: number;
  lng: number;
  streamUrl?: string;
  codec?: string;
  bitrate?: number;
  country?: string;
  tags?: string;
  homepage?: string;
}

export interface LaunchRecord {
  id: string;
  name: string;
  lat: number;
  lng: number;
  net?: string;
  windowStart?: string;
  windowEnd?: string;
  pad?: string;
  location?: string;
  rocket?: string;
  mission?: string;
  status?: string;
  webcast?: string;
}

export interface SiteRecord {
  id: string;
  lat: number;
  lng: number;
  name: string;
  kind: string;
}

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

const num = (value: unknown): number | undefined => {
  const parsed = typeof value === "string" ? Number.parseFloat(value) : (value as number);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const str = (value: unknown): string | undefined => {
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
};

function envelopeCandidate<T>(url: string, label: string): FeedCandidate<T> {
  return { url, label, parse: (raw) => parseEnvelope(raw) as T };
}

/* ------------------------------------------------------------------ *
 * Aviation — OpenSky (global) and adsb.lol (military)
 * ------------------------------------------------------------------ */

function openSkyStates(raw: unknown): AircraftRecord[] {
  const states = (raw as { states?: unknown[][] }).states ?? [];
  return states
    .filter((state) => Number.isFinite(num(state[6])) && Number.isFinite(num(state[5])))
    .map((state) => ({
      icao24: str(state[0]) ?? "unknown",
      callsign: str(state[1])?.trim() ?? "UNKNOWN",
      lng: num(state[5]) as number,
      lat: num(state[6]) as number,
      altitude: num(state[7]) ?? num(state[13]) ?? 0,
      velocity: num(state[9]) ?? 0,
      heading: num(state[10]) ?? 0,
      verticalRate: num(state[11]) ?? 0,
      squawk: str(state[14]),
      origin: str(state[2]),
      onGround: Boolean(state[8]),
    }))
    .filter((aircraft) => !aircraft.onGround);
}

export function loadFlights(keys: ApiKeyMap): Promise<{ items: AircraftRecord[]; source: string }> {
  return fetchFirst<AircraftRecord[]>(
    [
      envelopeCandidate(`/api/aviation`, "opensky/proxy"),
      {
        url: "https://opensky-network.org/api/states/all",
        label: "opensky/direct",
        parse: openSkyStates,
      },
      {
        url: "https://api.adsb.lol/v2/point/20/0/250",
        label: "adsb.lol",
        parse: (raw) => adsbLolAircraft(raw).slice(0, 2000),
      },
    ],
    { timeoutMs: 25_000 }
  );
}

function adsbLolAircraft(raw: unknown): AircraftRecord[] {
  const list = (raw as { ac?: Record<string, unknown>[] }).ac ?? [];
  return list
    .map((aircraft) => {
      const lat = num(aircraft.lat);
      const lng = num(aircraft.lon);
      if (lat === undefined || lng === undefined) return null;
      const altBaro = aircraft.alt_baro === "ground" ? 0 : num(aircraft.alt_baro) ?? 0;
      return {
        icao24: str(aircraft.hex) ?? "unknown",
        callsign: str(aircraft.flight)?.trim() ?? str(aircraft.r) ?? "UNKNOWN",
        lat,
        lng,
        // adsb.lol reports feet; convert to metres to match OpenSky.
        altitude: altBaro * 0.3048,
        velocity: (num(aircraft.gs) ?? 0) * 0.514_444,
        heading: num(aircraft.track) ?? num(aircraft.true_heading) ?? 0,
        verticalRate: (num(aircraft.baro_rate) ?? 0) * 0.005_08,
        squawk: str(aircraft.squawk),
        type: str(aircraft.t),
        registration: str(aircraft.r),
        origin: str(aircraft.ownOp),
      } satisfies AircraftRecord;
    })
    .filter((aircraft) => aircraft !== null) as AircraftRecord[];
}

export function loadMilitary(keys: ApiKeyMap): Promise<{ items: AircraftRecord[]; source: string }> {
  return fetchFirst<AircraftRecord[]>(
    [
      envelopeCandidate(`/api/aviation?scope=mil`, "adsb.lol/proxy"),
      { url: "https://api.adsb.lol/v2/mil", label: "adsb.lol", parse: adsbLolAircraft },
      { url: "https://api.airplanes.live/v2/mil", label: "airplanes.live", parse: adsbLolAircraft },
    ],
    { timeoutMs: 20_000 }
  );
}

export function aircraftToEntity(record: AircraftRecord, kind: "aircraft" | "military"): Entity {
  const altitudeKm = record.altitude / 1000;
  return {
    id: `${kind}:${record.icao24}`,
    kind,
    lat: record.lat,
    lng: record.lng,
    altitudeKm,
    label: record.callsign || record.registration || record.icao24.toUpperCase(),
    sublabel: record.type ?? record.origin ?? "ADS-B contact",
    weight: altitudeKm,
    meta: {
      ICAO24: record.icao24.toUpperCase(),
      Registration: record.registration,
      Type: record.type,
      Altitude: record.altitude,
      "Ground speed": record.velocity,
      Heading: record.heading,
      "Vertical rate": record.verticalRate,
      Squawk: record.squawk,
      "Origin country": record.origin,
    } satisfies EntityMeta,
  };
}

/* ------------------------------------------------------------------ *
 * Maritime — keyed AIS providers (server side only)
 * ------------------------------------------------------------------ */

export function loadVessels(
  keys: ApiKeyMap,
  bbox?: string
): Promise<{ items: VesselRecord[]; source: string }> {
  const query = bbox ? `?bbox=${encodeURIComponent(bbox)}` : "";
  return fetchFirst<VesselRecord[]>([
    envelopeCandidate(`/api/maritime${query}`, "ais/proxy"),
  ], { timeoutMs: 20_000 });
}

export function vesselToEntity(record: VesselRecord): Entity {
  return {
    id: `vessel:${record.mmsi}`,
    kind: "vessel",
    lat: record.lat,
    lng: record.lng,
    label: record.name || `MMSI ${record.mmsi}`,
    sublabel: record.type ?? record.destination ?? "AIS contact",
    meta: {
      MMSI: record.mmsi,
      Type: record.type,
      Speed: record.speed,
      Course: record.course,
      Destination: record.destination,
      Flag: record.flag,
    } satisfies EntityMeta,
  };
}

/* ------------------------------------------------------------------ *
 * Satellites — CelesTrak GP / TLE, propagated client side
 * ------------------------------------------------------------------ */

export const SATELLITE_GROUPS = [
  "stations",
  "weather",
  "noaa",
  "goes",
  "gps-ops",
  "glonass-ops",
  "galileo",
  "beidou",
  "geo",
  "science",
  "starlink",
] as const;

/** Parse a 3LE (or TLE) text catalogue. */
export function parseTleText(text: string, group: string): SatelliteRecord[] {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const satellites: SatelliteRecord[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.startsWith("1 ")) continue;
    const line2 = lines[i + 1];
    if (!line2 || !line2.startsWith("2 ")) continue;

    const previous = i > 0 ? lines[i - 1] : "";
    const isDataLine = previous.startsWith("1 ") || previous.startsWith("2 ");
    const name = i > 0 && !isDataLine ? previous : `NORAD ${line.slice(2, 7)}`;
    const noradId = Number.parseInt(line.slice(2, 7), 10);
    if (!Number.isFinite(noradId)) continue;

    satellites.push({ name, noradId, tle: `${line}\n${line2}`, group });
    i += 1;
  }
  return satellites;
}

function parseCelestrakJson(raw: unknown, group: string): SatelliteRecord[] {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((sat) => {
      const line1 = str(sat.TLE_LINE1);
      const line2 = str(sat.TLE_LINE2);
      const noradId = num(sat.NORAD_CAT_ID);
      if (!line1 || !line2 || noradId === undefined) return null;
      return {
        name: str(sat.OBJECT_NAME) ?? `NORAD ${noradId}`,
        noradId,
        tle: `${line1}\n${line2}`,
        epoch: str(sat.EPOCH),
        group,
      } satisfies SatelliteRecord;
    })
    .filter((sat) => sat !== null) as SatelliteRecord[];
}

export function loadSatelliteGroup(
  group: string
): Promise<{ items: SatelliteRecord[]; source: string }> {
  return fetchFirst<SatelliteRecord[]>(
    [
      {
        url: `/api/satellites?group=${encodeURIComponent(group)}`,
        label: `celestrak/proxy:${group}`,
        parse: (raw) => parseCelestrakJson(parseEnvelope(raw), group),
      },
      {
        url: `https://celestrak.org/NORAD/elements/gp.php?GROUP=${encodeURIComponent(group)}&FORMAT=tle`,
        label: `celestrak/direct:${group}`,
        parse: (raw) => parseTleText(String(raw), group),
      },
    ],
    { timeoutMs: 25_000 }
  );
}

/* ------------------------------------------------------------------ *
 * ISS
 * ------------------------------------------------------------------ */

export interface IssRecord {
  lat: number;
  lng: number;
  altitudeKm: number;
  velocityKph?: number;
  timestamp: number;
  source: string;
}

export function loadIss(): Promise<{ items: IssRecord[]; source: string }> {
  return fetchFirst<IssRecord[]>(
    [
      envelopeCandidate("/api/iss", "open-notify/proxy"),
      {
        url: "https://api.open-notify.org/iss-now.json",
        label: "open-notify",
        parse: (raw) => {
          const data = raw as {
            iss_position?: { latitude?: string; longitude?: string };
            timestamp?: number;
          };
          const lat = num(data.iss_position?.latitude);
          const lng = num(data.iss_position?.longitude);
          if (lat === undefined || lng === undefined) throw new Error("bad payload");
          return [
            { lat, lng, altitudeKm: 420, timestamp: (data.timestamp ?? 0) * 1000, source: "Open Notify" },
          ];
        },
      },
      {
        url: "https://api.wheretheiss.at/v1/satellites/25544",
        label: "wheretheiss.at",
        parse: (raw) => {
          const data = raw as Record<string, unknown>;
          const lat = num(data.latitude);
          const lng = num(data.longitude);
          if (lat === undefined || lng === undefined) throw new Error("bad payload");
          return [
            {
              lat,
              lng,
              altitudeKm: num(data.altitude) ?? 420,
              velocityKph: num(data.velocity),
              timestamp: (num(data.timestamp) ?? 0) * 1000,
              source: "Where the ISS at?",
            },
          ];
        },
      },
    ],
    { timeoutMs: 8000 }
  );
}

/* ------------------------------------------------------------------ *
 * Earthquakes — USGS
 * ------------------------------------------------------------------ */

export interface QuakeWindow {
  start?: string;
  end?: string;
  minMagnitude?: number;
}

function usgsGeoJson(raw: unknown): QuakeRecord[] {
  const features = (raw as { features?: Record<string, any>[] }).features ?? [];
  return features
    .map((feature) => {
      const coords = feature.geometry?.coordinates ?? [];
      const lng = num(coords[0]);
      const lat = num(coords[1]);
      const depth = num(coords[2]);
      if (lat === undefined || lng === undefined) return null;
      return {
        id: str(feature.id) ?? `${lat},${lng},${feature.properties?.time ?? 0}`,
        mag: num(feature.properties?.mag) ?? 0,
        place: str(feature.properties?.place) ?? "Unknown region",
        lat,
        lng,
        depthKm: depth ?? 0,
        time: num(feature.properties?.time) ?? 0,
        url: str(feature.properties?.url),
        tsunami: Boolean(feature.properties?.tsunami),
        alert: str(feature.properties?.alert) ?? null,
      } satisfies QuakeRecord;
    })
    .filter((quake) => quake !== null) as QuakeRecord[];
}

export function loadQuakes(window: QuakeWindow): Promise<{ items: QuakeRecord[]; source: string }> {
  const params = new URLSearchParams();
  if (window.start) params.set("start", window.start);
  if (window.end) params.set("end", window.end);
  if (window.minMagnitude !== undefined) params.set("minmag", String(window.minMagnitude));
  const query = params.toString();

  const fdsn = new URLSearchParams({ format: "geojson" });
  if (window.start) fdsn.set("starttime", window.start);
  if (window.end) fdsn.set("endtime", window.end);
  if (window.minMagnitude !== undefined) fdsn.set("minmagnitude", String(window.minMagnitude));

  return fetchFirst<QuakeRecord[]>(
    [
      envelopeCandidate(`/api/quakes${query ? `?${query}` : ""}`, "usgs/proxy"),
      {
        url: query
          ? `https://earthquake.usgs.gov/fdsnws/event/1/query?${fdsn.toString()}`
          : "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson",
        label: "usgs/direct",
        parse: usgsGeoJson,
      },
      {
        url: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson",
        label: "usgs/feed",
        parse: usgsGeoJson,
      },
    ],
    { timeoutMs: 20_000 }
  );
}

export function quakeToEntity(record: QuakeRecord): Entity {
  return {
    id: `quake:${record.id}`,
    kind: "quake",
    lat: record.lat,
    lng: record.lng,
    label: `M ${record.mag.toFixed(1)} · ${record.place}`,
    sublabel: `${record.depthKm.toFixed(0)} km depth`,
    time: record.time,
    weight: record.mag,
    link: record.url,
    meta: {
      Magnitude: record.mag,
      Depth: record.depthKm,
      Place: record.place,
      Tsunami: record.tsunami ? "flagged" : "no",
      Alert: record.alert ?? "none",
      Observed: record.time,
    } satisfies EntityMeta,
  };
}

/* ------------------------------------------------------------------ *
 * NASA EONET — fires, volcanoes, storms
 * ------------------------------------------------------------------ */

function eonetEvents(raw: unknown, fallbackCategory: string): HazardRecord[] {
  const events = (raw as { events?: Record<string, any>[] }).events ?? [];
  const records: HazardRecord[] = [];

  events.forEach((event) => {
    const geometries = event.geometries ?? [];
    const latest =
      geometries.find((g: Record<string, any>) => g.date && !event.closed) ??
      geometries[geometries.length - 1];
    if (!latest) return;

    const coords = latest.coordinates ?? [];
    const lng = num(coords[0]);
    const lat = num(coords[1]);
    if (lat === undefined || lng === undefined) return;

    const magnitude =
      latest.magnitudeValue !== undefined
        ? `${latest.magnitudeValue} ${latest.magnitudeUnit ?? ""}`.trim()
        : undefined;

    records.push({
      id: str(event.id) ?? `${fallbackCategory}:${lat},${lng}`,
      title: str(event.title) ?? "Natural event",
      lat,
      lng,
      date: str(latest.date),
      category: fallbackCategory,
      source: str(event.sources?.[0]?.id),
      sourceUrl: str(event.sources?.[0]?.url),
      closed: Boolean(event.closed),
      magnitude,
    });
  });

  return records;
}

export interface HazardWindow {
  category: string;
  days: number;
  start?: string;
  end?: string;
}

export function loadFires(
  keys: ApiKeyMap,
  window: HazardWindow
): Promise<{ items: HazardRecord[]; source: string }> {
  const params = new URLSearchParams({ days: String(window.days), category: window.category });
  if (window.start) params.set("start", window.start);
  if (window.end) params.set("end", window.end);

  return fetchFirst<HazardRecord[]>(
    [
      envelopeCandidate(`/api/fires?${params.toString()}`, "fires/proxy"),
      {
        url: `https://eonet.gsfc.nasa.gov/api/v2.1/events?${params.toString()}&status=open`,
        label: "eonet/direct:wildfires",
        parse: (raw) => eonetEvents(raw, "wildfires"),
      },
    ],
    { timeoutMs: 25_000 }
  );
}

export function loadHazards({
  category,
  days,
  start,
  end,
}: HazardWindow): Promise<{ items: HazardRecord[]; source: string }> {
  const params = new URLSearchParams({ category, days: String(days) });
  if (start) params.set("start", start);
  if (end) params.set("end", end);
  const query = params.toString();

  return fetchFirst<HazardRecord[]>(
    [
      envelopeCandidate(`/api/hazards?${query}`, `eonet/proxy:${category}`),
      {
        url: `https://eonet.gsfc.nasa.gov/api/v2.1/events?${query}&status=open`,
        label: `eonet/direct:${category}`,
        parse: (raw) => eonetEvents(raw, category),
      },
    ],
    { timeoutMs: 20_000 }
  );
}

export function hazardToEntity(record: HazardRecord, kind: Entity["kind"]): Entity {
  return {
    id: `${kind}:${record.id}`,
    kind,
    lat: record.lat,
    lng: record.lng,
    label: record.title,
    sublabel: record.closed ? "closed" : "open event",
    time: record.date ? Date.parse(record.date) : undefined,
    link: record.sourceUrl,
    meta: {
      Category: record.category,
      Status: record.closed ? "closed" : "open",
      Observed: record.date,
      Magnitude: record.magnitude,
      Source: record.source,
    } satisfies EntityMeta,
  };
}

/* ------------------------------------------------------------------ *
 * Webcams — Windy (keyed) and OpenStreetMap (keyless)
 * ------------------------------------------------------------------ */

function windyWebcams(raw: unknown): WebcamRecord[] {
  const data = raw as { result?: { webcams?: Record<string, any>[] }; webcams?: Record<string, any>[] };
  const list = data.result?.webcams ?? data.webcams ?? [];
  return list
    .map((cam) => {
      const lat = num(cam.location?.latitude ?? cam.latitude);
      const lng = num(cam.location?.longitude ?? cam.longitude);
      if (lat === undefined || lng === undefined) return null;
      return {
        id: str(cam.webcamId ?? cam.id) ?? `${lat},${lng}`,
        lat,
        lng,
        title: str(cam.title) ?? str(cam.location?.city) ?? "Public camera",
        imageUrl: str(cam.image?.current?.preview ?? cam.images?.current?.preview),
        embedUrl: str(cam.player?.day?.embed ?? cam.player?.live?.embed),
        source: "windy",
      } satisfies WebcamRecord;
    })
    .filter((cam) => cam !== null) as WebcamRecord[];
}

function osmWebcams(raw: unknown): WebcamRecord[] {
  const elements = (raw as { elements?: Record<string, any>[] }).elements ?? [];
  return elements
    .map((element) => {
      const lat = num(element.lat ?? element.center?.lat);
      const lng = num(element.lon ?? element.center?.lon);
      if (lat === undefined || lng === undefined) return null;
      const tags = element.tags ?? {};
      return {
        id: `osm-${element.id}`,
        lat,
        lng,
        title: str(tags.name) ?? str(tags.description) ?? "OSM camera",
        imageUrl: str(tags.image),
        embedUrl: str(tags["contact:webcam"] ?? tags.webcam ?? tags.website ?? tags.url),
        source: "osm",
      } satisfies WebcamRecord;
    })
    .filter((cam) => cam !== null) as WebcamRecord[];
}

export function loadWebcams(keys: ApiKeyMap): Promise<{ items: WebcamRecord[]; source: string }> {
  const candidates: FeedCandidate<WebcamRecord[]>[] = [];

  if (keys.WINDY) {
    candidates.push(envelopeCandidate(`/api/webcams/windy?limit=200`, "windy/proxy"));
  }

  candidates.push(envelopeCandidate(`/api/webcams/osm?limit=200`, "osm/proxy"));

  const overpassQuery =
    '[out:json][timeout:60];(node["webcam"](-85,-180,85,180);node["contact:webcam"](-85,-180,85,180););out tags center 400;';
  candidates.push({
    url: `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`,
    label: "osm/direct",
    parse: osmWebcams,
  });
  candidates.push({
    url: `https://overpass.kumi.systems/api/interpreter?data=${encodeURIComponent(overpassQuery)}`,
    label: "osm/direct-mirror",
    parse: osmWebcams,
  });

  return fetchFirst(candidates, { timeoutMs: 60_000 });
}

export function webcamToEntity(record: WebcamRecord): Entity {
  return {
    id: `webcam:${record.source}:${record.id}`,
    kind: "webcam",
    lat: record.lat,
    lng: record.lng,
    label: record.title,
    sublabel: record.source === "windy" ? "Windy camera" : "OpenStreetMap camera",
    imageUrl: record.imageUrl,
    embedUrl: record.embedUrl,
    link: record.embedUrl ? undefined : record.imageUrl,
    meta: {
      Provider: record.source === "windy" ? "Windy" : "OpenStreetMap",
      ID: record.id,
    } satisfies EntityMeta,
  };
}

/* ------------------------------------------------------------------ *
 * Radio Browser
 * ------------------------------------------------------------------ */

function radioStations(raw: unknown): RadioRecord[] {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((station) => {
      const lat = num(station.geo_lat);
      const lng = num(station.geo_long);
      if (lat === undefined || lng === undefined) return null;
      return {
        id: str(station.stationuuid) ?? `${lat},${lng}`,
        name: str(station.name) ?? "Unknown station",
        lat,
        lng,
        streamUrl: str(station.url_resolved) ?? str(station.url),
        codec: str(station.codec),
        bitrate: num(station.bitrate),
        country: str(station.country),
        tags: str(station.tags),
        homepage: str(station.homepage),
      } satisfies RadioRecord;
    })
    .filter((station) => station !== null) as RadioRecord[];
}

const RADIO_QUERY =
  "?hidebroken=true&has_geo_info=true&order=votes&reverse=true&limit=400";

export function loadRadio(): Promise<{ items: RadioRecord[]; source: string }> {
  return fetchFirst<RadioRecord[]>(
    [
      envelopeCandidate("/api/radio", "radio-browser/proxy"),
      {
        url: `https://de1.api.radio-browser.info/json/stations/search${RADIO_QUERY}`,
        label: "radio-browser/de1",
        parse: radioStations,
      },
      {
        url: `https://fi1.api.radio-browser.info/json/stations/search${RADIO_QUERY}`,
        label: "radio-browser/fi1",
        parse: radioStations,
      },
    ],
    { timeoutMs: 20_000 }
  );
}

export function radioToEntity(record: RadioRecord): Entity {
  return {
    id: `radio:${record.id}`,
    kind: "radio",
    lat: record.lat,
    lng: record.lng,
    label: record.name,
    sublabel: record.country ?? record.tags ?? "Broadcast station",
    streamUrl: record.streamUrl,
    link: record.homepage,
    meta: {
      Country: record.country,
      Codec: record.codec,
      Bitrate: record.bitrate,
      Tags: record.tags?.split(",").slice(0, 6).join(", "),
    } satisfies EntityMeta,
  };
}

/* ------------------------------------------------------------------ *
 * Launch Library 2
 * ------------------------------------------------------------------ */

function launches(raw: unknown): LaunchRecord[] {
  const data = raw as { results?: Record<string, any>[] };
  const list = data.results ?? [];
  return list
    .map((launch) => {
      const lat = num(launch.pad?.latitude);
      const lng = num(launch.pad?.longitude);
      if (lat === undefined || lng === undefined) return null;
      const vidUrl = launch.vidURLs?.[0]?.url ?? launch.webcast ?? null;
      return {
        id: str(launch.id) ?? `${lat},${lng}`,
        name: str(launch.name) ?? "Upcoming launch",
        lat,
        lng,
        net: str(launch.net),
        windowStart: str(launch.window_start),
        windowEnd: str(launch.window_end),
        pad: str(launch.pad?.name),
        location: str(launch.pad?.location?.name),
        rocket: str(launch.rocket?.configuration?.full_name ?? launch.rocket?.configuration?.name),
        mission: str(launch.mission?.name),
        status: str(launch.status?.name),
        webcast: str(vidUrl),
      } satisfies LaunchRecord;
    })
    .filter((launch) => launch !== null) as LaunchRecord[];
}

export function loadLaunches(): Promise<{ items: LaunchRecord[]; source: string }> {
  const path = "https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=20&mode=detailed";
  return fetchFirst<LaunchRecord[]>(
    [
      envelopeCandidate("/api/launches", "launch-library/proxy"),
      { url: path, label: "launch-library/direct", parse: launches },
    ],
    { timeoutMs: 25_000 }
  );
}

export function launchToEntity(record: LaunchRecord): Entity {
  const net = record.net ? Date.parse(record.net) : undefined;
  return {
    id: `launch:${record.id}`,
    kind: "launch",
    lat: record.lat,
    lng: record.lng,
    label: record.mission ? `${record.mission}` : record.name,
    sublabel: record.pad ?? record.location ?? "Launch pad",
    time: net,
    link: record.webcast,
    meta: {
      Vehicle: record.rocket,
      Pad: record.pad,
      Location: record.location,
      Status: record.status,
      "Window start": record.windowStart,
      "Window end": record.windowEnd,
      NET: record.net,
    } satisfies EntityMeta,
  };
}

/* ------------------------------------------------------------------ *
 * OSM infrastructure
 * ------------------------------------------------------------------ */

const SITE_QUERIES: Array<{ kind: string; query: string }> = [
  { kind: "Airfield", query: 'node["aeroway"="aerodrome"]["iata"](-85,-180,85,180)' },
  { kind: "Port", query: 'node["landuse"="harbour"](-85,-180,85,180)' },
  { kind: "Military", query: 'way["landuse"="military"](-85,-180,85,180)' },
  { kind: "Nuclear", query: 'node["power"="plant"]["plant:source"="nuclear"](-85,-180,85,180)' },
];

function osmSites(raw: unknown, kind: string): SiteRecord[] {
  const elements = (raw as { elements?: Record<string, any>[] }).elements ?? [];
  return elements
    .map((element) => {
      const lat = num(element.lat ?? element.center?.lat);
      const lng = num(element.lon ?? element.center?.lon);
      if (lat === undefined || lng === undefined) return null;
      const tags = element.tags ?? {};
      return {
        id: `osm-${kind}-${element.type}-${element.id}`,
        lat,
        lng,
        name:
          str(tags.name) ??
          str(tags["name:en"]) ??
          str(tags.ref) ??
          str(tags.iata) ??
          `${kind} installation`,
        kind,
      } satisfies SiteRecord;
    })
    .filter((site) => site !== null) as SiteRecord[];
}

export function loadSites(): Promise<{ items: SiteRecord[]; source: string }> {
  return fetchFirst<SiteRecord[]>([
    envelopeCandidate("/api/infrastructure", "osm/proxy"),
    {
      url: `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(
        `[out:json][timeout:90];(${SITE_QUERIES.map((s) => s.query).join(";")});out tags center 1500;`
      )}`,
      label: "osm/direct",
      parse: (raw) => {
        const elements = (raw as { elements?: Record<string, any>[] }).elements ?? [];
        // The union query loses the per-filter label, so bucket by tags.
        return elements
          .map((element) => {
            const tags: Record<string, string> = element.tags ?? {};
            let kind = "Installation";
            if (tags.aeroway === "aerodrome") kind = "Airfield";
            else if (tags.landuse === "harbour") kind = "Port";
            else if (tags.landuse === "military") kind = "Military";
            else if (tags.power === "plant") kind = "Nuclear";
            return osmSites({ elements: [element] }, kind)[0] ?? null;
          })
          .filter((site) => site !== null) as SiteRecord[];
      },
    },
  ], { timeoutMs: 90_000 });
}

export function siteToEntity(record: SiteRecord): Entity {
  return {
    id: `site:${record.id}`,
    kind: "site",
    lat: record.lat,
    lng: record.lng,
    label: record.name,
    sublabel: record.kind,
    meta: {
      Category: record.kind,
      Source: "OpenStreetMap",
    } satisfies EntityMeta,
  };
}

