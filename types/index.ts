/**
 * Shared domain types for the OSINT Globe console.
 *
 * Everything rendered on the globe is normalised into an `Entity`, so that
 * layers, the HUD dossier and the timeline all speak the same language
 * regardless of which upstream feed produced the record.
 */

export type EntityKind =
  | "iss"
  | "aircraft"
  | "military"
  | "vessel"
  | "satellite"
  | "quake"
  | "fire"
  | "volcano"
  | "storm"
  | "flood"
  | "webcam"
  | "mapillary"
  | "radio"
  | "launch"
  | "site";

export type EntityMeta = Record<string, string | number | boolean | null | undefined>;

export interface Entity {
  /** Stable id, unique inside a layer (`kind:id`). */
  id: string;
  kind: EntityKind;
  lat: number;
  lng: number;
  /** Altitude above the ellipsoid, in kilometres. 0 = surface. */
  altitudeKm?: number;
  /** Primary label (callsign, vessel name, satellite name...). */
  label: string;
  /** Secondary line shown in the dossier and hover tooltip. */
  sublabel?: string;
  /** Observation / event time in epoch ms. */
  time?: number;
  /** Numeric weight used for ring size, point radius, heat, etc. */
  weight?: number;
  /** Feed-specific fields rendered by the dossier. */
  meta?: EntityMeta;
  /** Optional image or embed rendered in the dossier. */
  imageUrl?: string;
  embedUrl?: string;
  /** Optional stream (radio) the dossier can play. */
  streamUrl?: string;
  /** External "read more" link. */
  link?: string;
}

export type LayerId =
  | "flights"
  | "military"
  | "vessels"
  | "satellites"
  | "iss"
  | "quakes"
  | "fires"
  | "volcanoes"
  | "storms"
  | "webcams"
  | "mapillary"
  | "radio"
  | "launches"
  | "sites"
  | "graticule"
  | "terminator";

export type LayerGroup = "air" | "maritime" | "space" | "hazard" | "ground" | "overlay";

export interface LayerDef {
  id: LayerId;
  name: string;
  icon: string;
  /** Render colour (hex) used for points, rings and legend chips. */
  color: string;
  group: LayerGroup;
  /** Human readable source list for the dossier / status panel. */
  sources: string;
  /** Poll interval in ms (0 = fetch once). */
  intervalMs: number;
  /** True when the layer works without any API key. */
  keyless: boolean;
  /** Env/POWER UP key that upgrades or unlocks the layer. */
  keyName?: string;
  /** Off by default (slow or noisy layers). */
  defaultOff?: boolean;
  /** Short blurb shown in the layer dock tooltip. */
  blurb: string;
}

export interface LayerStatus {
  id: LayerId;
  count: number;
  online: boolean;
  /** Which upstream actually answered (server proxy vs direct browser fetch). */
  source?: string;
  updatedAt?: number;
  error?: string;
  loading?: boolean;
  needsKey?: boolean;
}

export type ElevationStatus =
  | { phase: "off"; progress: number }
  | { phase: "loading"; progress: number }
  | { phase: "ready"; progress: number; minMeters?: number; maxMeters?: number }
  | { phase: "error"; progress: number; error: string };

export type SensorId = "standard" | "nvg" | "flir" | "flir-inv" | "crt" | "noir" | "snow" | "bloom";

export interface SensorDef {
  id: SensorId;
  name: string;
  hint: string;
  hotkey: string;
}

export type BasemapId = "satellite" | "dark" | "street" | "topo";

export interface BasemapDef {
  id: BasemapId;
  name: string;
  /** Slippy tile template. `{l}` = zoom, `{x}` = column, `{y}` = row. */
  url: string;
  /** Alternate templates tried in order if the primary cannot be fetched. */
  fallbacks?: string[];
  attribution: string;
  /** Max tile zoom handed to the globe tile engine. */
  maxLevel: number;
  /** Equirectangular texture used when no tile source is reachable. */
  staticFallback?: string;
  /** Theme applied to the HUD chrome while this basemap is active. */
  tone: "light" | "dark";
}

export interface Pov {
  lat: number;
  lng: number;
  altitude: number;
}

export interface Selection {
  entity: Entity;
  layer: LayerId;
}

/** A credential the POWER UP panel can collect. */
export interface KeyDef {
  id: string;
  label: string;
  placeholder: string;
  hint: string;
  /** Layers unlocked or upgraded by this key. */
  unlocks: string;
  signup: string;
}

export interface FeedResult<T> {
  items: T;
  source: string;
  error?: string;
}

export type ApiKeyMap = Record<string, string>;

/** Envelope returned by every `/api/*` route. */
export interface ApiEnvelope<T> {
  ok: boolean;
  items: T;
  count?: number;
  source?: string;
  fetchedAt?: number;
  cached?: boolean;
  error?: string;
  needsKey?: boolean;
}
