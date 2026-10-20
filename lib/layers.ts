import type { BasemapDef, BasemapId, KeyDef, LayerDef, LayerId, SensorDef, SensorId } from "@/types";

/**
 * Layer registry — the single source of truth for what can be drawn,
 * which colour it uses, how often it refreshes and whether it needs a key.
 */
export const LAYERS: LayerDef[] = [
  {
    id: "flights",
    name: "Live Flights",
    icon: "✈",
    color: "#7dd3fc",
    group: "air",
    sources: "OpenSky Network · adsb.lol",
    intervalMs: 30_000,
    keyless: true,
    blurb: "Global ADS-B traffic from OpenSky, trimmed and normalised.",
  },
  {
    id: "military",
    name: "Military Traffic",
    icon: "🎖",
    color: "#fbbf24",
    group: "air",
    sources: "adsb.lol · airplanes.live",
    intervalMs: 45_000,
    keyless: true,
    blurb: "ADS-B contacts flagged as military / state aircraft.",
  },
  {
    id: "vessels",
    name: "Live Vessels",
    icon: "🚢",
    color: "#34d399",
    group: "maritime",
    sources: "AISHub · Spire · MarineTraffic · Datalastic",
    intervalMs: 60_000,
    keyless: false,
    keyName: "AIS",
    defaultOff: true,
    blurb: "AIS ship positions. Needs a provider key — unlock it in POWER UP.",
  },
  {
    id: "satellites",
    name: "Satellites",
    icon: "🛰",
    color: "#a78bfa",
    group: "space",
    sources: "CelesTrak GP (SGP4)",
    intervalMs: 3_600_000,
    keyless: true,
    blurb: "TLE catalogue propagated in real time: stations, weather, GNSS, GEO, Starlink.",
  },
  {
    id: "iss",
    name: "ISS / Crewed",
    icon: "🧑‍🚀",
    color: "#f0abfc",
    group: "space",
    sources: "Open Notify · CelesTrak",
    intervalMs: 10_000,
    keyless: true,
    blurb: "International Space Station position plus ground track.",
  },
  {
    id: "quakes",
    name: "Earthquakes",
    icon: "🌋",
    color: "#f472b6",
    group: "hazard",
    sources: "USGS FDSN",
    intervalMs: 120_000,
    keyless: true,
    blurb: "Seismic events from the USGS feed, sized by magnitude.",
  },
  {
    id: "fires",
    name: "Wildfires",
    icon: "🔥",
    color: "#fb923c",
    group: "hazard",
    sources: "NASA EONET · NASA FIRMS",
    intervalMs: 300_000,
    keyless: true,
    blurb: "Active wildfire detections. Add a FIRMS key for VIIRS granularity.",
    keyName: "FIRMS",
  },
  {
    id: "volcanoes",
    name: "Volcanoes",
    icon: "⛰",
    color: "#f87171",
    group: "hazard",
    sources: "NASA EONET",
    intervalMs: 600_000,
    keyless: true,
    blurb: "Volcanic activity reported in the last 30 days.",
  },
  {
    id: "storms",
    name: "Severe Storms",
    icon: "🌀",
    color: "#22d3ee",
    group: "hazard",
    sources: "NASA EONET",
    intervalMs: 600_000,
    keyless: true,
    blurb: "Tropical cyclones and severe storm systems.",
  },
  {
    id: "webcams",
    name: "Public Cameras",
    icon: "📹",
    color: "#38bdf8",
    group: "ground",
    sources: "Windy · OpenStreetMap",
    intervalMs: 0,
    keyless: true,
    defaultOff: true,
    blurb: "Public webcams. A Windy key unlocks live thumbnails.",
    keyName: "WINDY",
  },
  {
    id: "mapillary",
    name: "Street Imagery",
    icon: "📷",
    color: "#2dd4bf",
    group: "ground",
    sources: "Mapillary Graph API",
    intervalMs: 60_000,
    keyless: false,
    defaultOff: true,
    blurb:
      "Street-level photo positions in view — click one for the thumbnail. Needs a Mapillary token (POWER UP); zoom in to city scale to query.",
    keyName: "MAPILLARY",
  },
  {
    id: "radio",
    name: "Radio Grid",
    icon: "📻",
    color: "#c4b5fd",
    group: "ground",
    sources: "Radio Browser",
    intervalMs: 0,
    keyless: true,
    blurb: "Geo-located broadcast stations — click to listen live.",
  },
  {
    id: "launches",
    name: "Launch Schedule",
    icon: "🚀",
    color: "#facc15",
    group: "space",
    sources: "Launch Library 2",
    intervalMs: 900_000,
    keyless: true,
    blurb: "Upcoming orbital launches with pads and windows.",
  },
  {
    id: "sites",
    name: "Installations",
    icon: "🏭",
    color: "#94a3b8",
    group: "ground",
    sources: "OpenStreetMap (Overpass)",
    intervalMs: 0,
    keyless: true,
    defaultOff: true,
    blurb: "Airfields, ports, military areas and nuclear sites from OSM.",
  },
  {
    id: "graticule",
    name: "Graticule",
    icon: "🧭",
    color: "#475569",
    group: "overlay",
    sources: "Generated",
    intervalMs: 0,
    keyless: true,
    blurb: "10° lat/lon grid lines.",
  },
  {
    id: "terminator",
    name: "Day / Night",
    icon: "🌗",
    color: "#fde68a",
    group: "overlay",
    sources: "Computed (subsolar point)",
    intervalMs: 60_000,
    keyless: true,
    blurb: "Sun terminator derived from the current simulation time.",
  },
];

export const LAYER_BY_ID: Record<LayerId, LayerDef> = LAYERS.reduce(
  (acc, layer) => {
    acc[layer.id] = layer;
    return acc;
  },
  {} as Record<LayerId, LayerDef>
);

/** A clean launch leaves every OSINT feed disabled until the user picks layers. */
export const DEFAULT_ENABLED: LayerId[] = [];

export const GROUP_LABELS: Record<string, string> = {
  air: "AIR",
  maritime: "MARITIME",
  space: "SPACE",
  hazard: "HAZARDS",
  ground: "GROUND / SIGINT",
  overlay: "OVERLAYS",
};

export const GROUP_ORDER = ["air", "space", "maritime", "hazard", "ground", "overlay"];

export const SENSORS: SensorDef[] = [
  { id: "standard", name: "STD", hint: "Clean imagery — no processing", hotkey: "1" },
  { id: "nvg", name: "NVG", hint: "Gen-3 night vision, green phosphor", hotkey: "2" },
  { id: "flir", name: "FLIR", hint: "Thermal — black hot", hotkey: "3" },
  { id: "flir-inv", name: "WHITE", hint: "Thermal — white hot", hotkey: "4" },
  { id: "crt", name: "CRT", hint: "Analogue monitor, RGB convergence drift", hotkey: "5" },
  { id: "noir", name: "NOIR", hint: "High-contrast monochrome", hotkey: "6" },
  { id: "snow", name: "SNOW", hint: "Low-light sensor, heavy grain", hotkey: "7" },
  { id: "bloom", name: "GLOW", hint: "Bloom pass for night-side cities", hotkey: "8" },
];

export const SENSOR_BY_ID: Record<SensorId, SensorDef> = SENSORS.reduce(
  (acc, sensor) => {
    acc[sensor.id] = sensor;
    return acc;
  },
  {} as Record<SensorId, SensorDef>
);

export const BASEMAPS: BasemapDef[] = [
  {
    id: "satellite",
    name: "SATELLITE",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{l}/{y}/{x}",
    fallbacks: [
      "https://basemaps.cartocdn.com/dark_all/{l}/{x}/{y}@2x.png",
      "https://tile.openstreetmap.org/{l}/{x}/{y}.png",
    ],
    attribution: "Esri World Imagery",
    maxLevel: 14,
    staticFallback: "https://unpkg.com/three-globe/example/img/earth-dark.jpg",
    tone: "dark",
  },
  {
    id: "dark",
    name: "DARK",
    url: "https://basemaps.cartocdn.com/dark_all/{l}/{x}/{y}@2x.png",
    fallbacks: ["https://tile.openstreetmap.org/{l}/{x}/{y}.png"],
    attribution: "© OpenStreetMap · © CARTO",
    maxLevel: 12,
    staticFallback: "https://unpkg.com/three-globe/example/img/earth-dark.jpg",
    tone: "dark",
  },
  {
    id: "street",
    name: "STREET",
    url: "https://tile.openstreetmap.org/{l}/{x}/{y}.png",
    fallbacks: ["https://basemaps.cartocdn.com/rastertiles/voyager/{l}/{x}/{y}@2x.png"],
    attribution: "© OpenStreetMap contributors",
    maxLevel: 14,
    staticFallback: "https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg",
    tone: "dark",
  },
  {
    id: "topo",
    name: "TOPO",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{l}/{y}/{x}",
    fallbacks: ["https://tile.openstreetmap.org/{l}/{x}/{y}.png"],
    attribution: "Esri World Topo",
    maxLevel: 13,
    staticFallback: "https://unpkg.com/three-globe/example/img/earth-topology.png",
    tone: "light",
  },
];

export const BASEMAP_BY_ID: Record<BasemapId, BasemapDef> = BASEMAPS.reduce(
  (acc, map) => {
    acc[map.id] = map;
    return acc;
  },
  {} as Record<BasemapId, BasemapDef>
);

export const KEY_DEFS: KeyDef[] = [
  {
    id: "MAPILLARY",
    label: "Mapillary token",
    placeholder: "MLY|…|…",
    hint: "Street-level photo positions on the globe. Free token from the Mapillary developer dashboard.",
    unlocks: "Street Imagery",
    signup: "https://www.mapillary.com/dashboard/developers",
  },
  {
    id: "WINDY",
    label: "Windy Webcams",
    placeholder: "windy webcam api key",
    hint: "Live thumbnails and embeds for the public camera layer.",
    unlocks: "Public Cameras",
    signup: "https://api.windy.com/keys",
  },
  {
    id: "AIS",
    label: "AIS provider",
    placeholder: "aishub / spire / marinetraffic / datalastic key",
    hint: "Unlocks live ship positions. AISHub keys are free for personal use.",
    unlocks: "Live Vessels",
    signup: "https://www.aishub.net/api",
  },
  {
    id: "FIRMS",
    label: "NASA FIRMS",
    placeholder: "firms map_key",
    hint: "Upgrades wildfires from EONET polygons to VIIRS hotspot detections.",
    unlocks: "Wildfires (VIIRS)",
    signup: "https://firms.modaps.eosdis.nasa.gov/api/map_key/",
  },
  {
    id: "OPENSKY_USER",
    label: "OpenSky user",
    placeholder: "username",
    hint: "Raises the OpenSky request budget for live flights.",
    unlocks: "Live Flights",
    signup: "https://opensky-network.org/index.php?option=com_users&view=registration",
  },
  {
    id: "OPENSKY_PASS",
    label: "OpenSky password",
    placeholder: "password",
    hint: "Paired with the OpenSky user above.",
    unlocks: "Live Flights",
    signup: "https://opensky-network.org/index.php?option=com_users&view=registration",
  },
];
