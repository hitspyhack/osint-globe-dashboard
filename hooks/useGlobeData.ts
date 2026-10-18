"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  quakeToEntity,
  radioToEntity,
  siteToEntity,
  vesselToEntity,
  webcamToEntity,
  type SatelliteRecord,
} from "@/lib/sources";
import { propagateSatellite, splitTle } from "@/lib/satellite-propagation";
import { LAYER_BY_ID } from "@/lib/layers";
import { toIsoDate } from "@/lib/time";
import type { ApiKeyMap, Entity, LayerId, LayerStatus } from "@/types";

/** Hard caps so a busy feed can never tank the frame rate. */
const CAPS: Partial<Record<LayerId, number>> = {
  flights: 3000,
  military: 1500,
  vessels: 3000,
  satellites: 700,
  quakes: 900,
  fires: 2500,
  volcanoes: 400,
  storms: 400,
  webcams: 500,
  radio: 500,
  launches: 40,
  sites: 1800,
};

const SATELLITE_GROUPS = [
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
];

const SATELLITE_GROUP_CAPS: Record<string, number> = {
  starlink: 150,
  geo: 120,
  "gps-ops": 60,
  "glonass-ops": 40,
  galileo: 40,
  beidou: 50,
  noaa: 40,
  goes: 20,
  science: 80,
};

const ISS_NORAD = "25544";

const PROPAGATION_INTERVAL_MS = 10_000;
const CATALOGUE_REFRESH_MS = 3_600_000;

export interface GlobeDataOptions {
  enabled: LayerId[];
  keys: ApiKeyMap;
  /** Simulation clock — drives SGP4 propagation and historical windows. */
  simTime: Date;
  /** When false, hazard/quake feeds are pinned to `simTime`. */
  live: boolean;
  /** Visible bounds, used to narrow AIS queries. */
  bbox?: string;
}

export interface GlobeData {
  entities: Partial<Record<LayerId, Entity[]>>;
  statuses: Partial<Record<LayerId, LayerStatus>>;
  /** Raw TLE catalogue, so the globe can draw ground tracks on demand. */
  satelliteCatalog: Map<string, SatelliteRecord>;
  refresh: (layer?: LayerId) => void;
}

interface LoaderContext {
  keys: ApiKeyMap;
  bbox?: string;
  window: { start?: string; end?: string };
}

type Loader = (ctx: LoaderContext) => Promise<{ entities: Entity[]; source: string }>;

const LOADERS: Partial<Record<LayerId, Loader>> = {
  flights: async ({ keys }) => {
    const { items, source } = await loadFlights(keys);
    return { entities: items.map((item) => aircraftToEntity(item, "aircraft")), source };
  },
  military: async ({ keys }) => {
    const { items, source } = await loadMilitary(keys);
    return { entities: items.map((item) => aircraftToEntity(item, "military")), source };
  },
  vessels: async ({ keys, bbox }) => {
    const { items, source } = await loadVessels(keys, bbox);
    return { entities: items.map(vesselToEntity), source };
  },
  quakes: async ({ window }) => {
    const { items, source } = await loadQuakes({ start: window.start, end: window.end });
    return { entities: items.map(quakeToEntity), source };
  },
  fires: async ({ keys, window }) => {
    const { items, source } = await loadFires(keys, {
      category: "wildfires",
      days: window.start ? 10 : 5,
      start: window.start,
      end: window.end,
    });
    return { entities: items.map((item) => hazardToEntity(item, "fire")), source };
  },
  volcanoes: async ({ window }) => {
    const { items, source } = await loadHazards({
      category: "volcanoes",
      days: 30,
      start: window.start,
      end: window.end,
    });
    return { entities: items.map((item) => hazardToEntity(item, "volcano")), source };
  },
  storms: async ({ window }) => {
    const { items, source } = await loadHazards({
      category: "severeStorms",
      days: 10,
      start: window.start,
      end: window.end,
    });
    return { entities: items.map((item) => hazardToEntity(item, "storm")), source };
  },
  webcams: async ({ keys }) => {
    const { items, source } = await loadWebcams(keys);
    return { entities: items.map(webcamToEntity), source };
  },
  radio: async () => {
    const { items, source } = await loadRadio();
    return { entities: items.map(radioToEntity), source };
  },
  launches: async () => {
    const { items, source } = await loadLaunches();
    return { entities: items.map(launchToEntity), source };
  },
  sites: async () => {
    const { items, source } = await loadSites();
    return { entities: items.map(siteToEntity), source };
  },
};

/**
 * Owns every live feed in the console.
 *
 * Failures are recorded per layer, so the dock can show exactly which upstream
 * is offline instead of silently rendering an empty globe.
 */
export function useGlobeData({ enabled, keys, simTime, live, bbox }: GlobeDataOptions): GlobeData {
  const [entities, setEntities] = useState<Partial<Record<LayerId, Entity[]>>>({});
  const [statuses, setStatuses] = useState<Partial<Record<LayerId, LayerStatus>>>({});
  const [satelliteCatalog, setSatelliteCatalog] = useState<Map<string, SatelliteRecord>>(new Map());

  // Latest args, read through refs so pollers never restart on clock ticks.
  const argsRef = useRef({ keys, bbox, live, simTime, enabled });
  argsRef.current = { keys, bbox, live, simTime, enabled };

  const catalogRef = useRef<Map<string, SatelliteRecord>>(new Map());
  const inFlightRef = useRef<Set<LayerId>>(new Set());
  const mountedRef = useRef(true);

  const enabledKey = enabled.slice().sort().join("|");
  const keysKey = Object.entries(keys)
    .map(([id, value]) => `${id}=${value}`)
    .sort()
    .join("|");
  // Historical windows only change when the day changes — avoids refetch storms
  // while the timeline is being scrubbed.
  const dayKey = live ? "live" : toIsoDate(simTime);

  const runLayer = useCallback(async (layer: LayerId) => {
    const loader = LOADERS[layer];
    if (!loader) return;
    if (inFlightRef.current.has(layer)) return;
    inFlightRef.current.add(layer);

    const { keys: currentKeys, bbox: currentBbox, live: isLive, simTime: now } = argsRef.current;

    setStatuses((prev) => ({
      ...prev,
      [layer]: { ...(prev[layer] ?? { id: layer, count: 0, online: false }), id: layer, loading: true } satisfies LayerStatus,
    }));

    try {
      const window = isLive
        ? {}
        : {
            start: new Date(now.getTime() - 24 * 3600_000).toISOString().slice(0, 10),
            end: toIsoDate(now),
          };

      const result = await loader({ keys: currentKeys, bbox: currentBbox, window });
      if (!mountedRef.current) return;

      const cap = CAPS[layer] ?? 1000;
      const items = result.entities.slice(0, cap);

      setEntities((prev) => ({ ...prev, [layer]: items }));
      setStatuses((prev) => ({
        ...prev,
        [layer]: {
          id: layer,
          count: items.length,
          online: true,
          source: result.source,
          updatedAt: Date.now(),
          loading: false,
          needsKey: false,
        },
      }));
    } catch (error) {
      if (!mountedRef.current) return;
      const message = error instanceof Error ? error.message : String(error);
      setStatuses((prev) => ({
        ...prev,
        [layer]: {
          id: layer,
          count: prev[layer]?.count ?? 0,
          online: prev[layer]?.online ?? false,
          error: message,
          updatedAt: prev[layer]?.updatedAt,
          loading: false,
          needsKey: Boolean(LAYER_BY_ID[layer]?.keyName) && (prev[layer]?.count ?? 0) === 0,
        },
      }));
    } finally {
      inFlightRef.current.delete(layer);
    }
  }, []);

  const refresh = useCallback(
    (layer?: LayerId) => {
      const targets = layer ? [layer] : (argsRef.current.enabled ?? []);
      targets.forEach((id) => {
        inFlightRef.current.delete(id);
        void runLayer(id);
      });
    },
    [runLayer]
  );

  /* ---- satellite catalogue ------------------------------------------- */

  const loadCatalogue = useCallback(async () => {
    setStatuses((prev) => {
      const current: LayerStatus = prev.satellites ?? {
        id: "satellites",
        count: 0,
        online: false,
      };
      return { ...prev, satellites: { ...current, loading: true } };
    });

    const results = await Promise.allSettled(
      SATELLITE_GROUPS.map((group) => loadSatelliteGroup(group))
    );
    if (!mountedRef.current) return;

    const catalog = new Map<string, SatelliteRecord>();
    results.forEach((result, index) => {
      if (result.status !== "fulfilled") return;
      const group = SATELLITE_GROUPS[index];
      const cap = SATELLITE_GROUP_CAPS[group] ?? 200;
      result.value.items.slice(0, cap).forEach((satellite) => {
        catalog.set(String(satellite.noradId), satellite);
      });
    });

    catalogRef.current = catalog;
    setSatelliteCatalog(catalog);

    if (catalog.size === 0) {
      const reason = results
        .map((result) => (result.status === "rejected" ? String(result.reason) : ""))
        .filter(Boolean)
        .join(" · ");
      setStatuses((prev) => ({
        ...prev,
        satellites: {
          id: "satellites",
          count: 0,
          online: false,
          error: reason || "CelesTrak catalogue unavailable",
          loading: false,
        } satisfies LayerStatus,
      }));
    }
  }, []);

  const propagate = useCallback((catalog: Map<string, SatelliteRecord>) => {
    const { simTime: now } = argsRef.current;
    const positions: Entity[] = [];

    catalog.forEach((satellite) => {
      const lines = splitTle(satellite.tle);
      if (!lines) return;
      const position = propagateSatellite(lines[0], lines[1], now);
      if (!position) return;

      positions.push({
        id: `satellite:${satellite.noradId}`,
        kind: "satellite",
        lat: position.lat,
        lng: position.lng,
        altitudeKm: position.altitude,
        label: satellite.name,
        sublabel: satellite.group ?? "Satellite",
        time: now.getTime(),
        weight: position.altitude,
        meta: {
          NORAD: satellite.noradId,
          Altitude: position.altitude,
          Velocity: position.velocity,
          Footprint: position.footprint,
          Group: satellite.group,
          Epoch: satellite.epoch,
          TLE: satellite.tle,
        },
      });
    });

    const cap = CAPS.satellites ?? 700;
    setEntities((prev) => ({ ...prev, satellites: positions.slice(0, cap) }));
    setStatuses((prev) => ({
      ...prev,
      satellites: {
        id: "satellites",
        count: positions.length,
        online: positions.length > 0,
        source: "CelesTrak · SGP4",
        updatedAt: Date.now(),
        loading: false,
        error: positions.length === 0 ? "no TLE data" : undefined,
      } satisfies LayerStatus,
    }));
  }, []);

  const propagateRef = useRef(propagate);
  propagateRef.current = propagate;

  useEffect(() => {
    if (!enabled.includes("satellites")) return;
    void loadCatalogue();
    const timer = setInterval(() => void loadCatalogue(), CATALOGUE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [enabledKey, loadCatalogue]);

  useEffect(() => {
    if (!enabled.includes("satellites")) return;
    propagateRef.current(catalogRef.current);
    const timer = setInterval(() => propagateRef.current(catalogRef.current), PROPAGATION_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [enabledKey]);

  // Re-propagate when the clock jumps (timeline scrubbing), not on every tick.
  const lastPropagatedRef = useRef(0);
  useEffect(() => {
    if (!enabled.includes("satellites")) return;
    if (Math.abs(simTime.getTime() - lastPropagatedRef.current) < 60_000) return;
    lastPropagatedRef.current = simTime.getTime();
    propagateRef.current(catalogRef.current);
  }, [simTime, enabledKey]);

  /* ---- ISS ------------------------------------------------------------ */

  useEffect(() => {
    if (!enabled.includes("iss")) return;
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;

      try {
        const { items, source } = await loadIss();
        const record = items[0];
        if (cancelled || !record) return;

        setEntities((prev) => ({
          ...prev,
          iss: [
            {
              id: `iss:${ISS_NORAD}`,
              kind: "iss",
              lat: record.lat,
              lng: record.lng,
              altitudeKm: record.altitudeKm,
              label: "ISS (ZARYA)",
              sublabel: record.source,
              time: record.timestamp,
              meta: {
                NORAD: 25544,
                Altitude: record.altitudeKm,
                Velocity: record.velocityKph ? record.velocityKph / 3600 : undefined,
                Source: record.source,
              },
            },
          ],
        }));
        setStatuses((prev) => ({
          ...prev,
          iss: { id: "iss", count: 1, online: true, source, updatedAt: Date.now() },
        }));
        return;
      } catch {
        /* fall through to TLE propagation */
      }

      const iss = catalogRef.current.get(ISS_NORAD);
      const lines = iss ? splitTle(iss.tle) : null;
      if (!lines || cancelled) return;

      const position = propagateSatellite(lines[0], lines[1], argsRef.current.simTime);
      if (!position || cancelled) return;

      setEntities((prev) => ({
        ...prev,
        iss: [
          {
            id: `iss:${ISS_NORAD}`,
            kind: "iss",
            lat: position.lat,
            lng: position.lng,
            altitudeKm: position.altitude,
            label: "ISS (ZARYA)",
            sublabel: "SGP4 propagation",
            time: argsRef.current.simTime.getTime(),
            meta: {
              NORAD: 25544,
              Altitude: position.altitude,
              Velocity: position.velocity,
              Footprint: position.footprint,
              Source: "CelesTrak SGP4",
            },
          },
        ],
      }));
      setStatuses((prev) => ({
        ...prev,
        iss: {
          id: "iss",
          count: 1,
          online: true,
          source: "CelesTrak · SGP4",
          updatedAt: Date.now(),
        },
      }));
    };

    void tick();
    const timer = setInterval(() => void tick(), 10_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [enabledKey]);

  /* ---- polled layers -------------------------------------------------- */

  useEffect(() => {
    mountedRef.current = true;
    const timers: Array<ReturnType<typeof setInterval>> = [];
    const layers = argsRef.current.enabled;

    layers.forEach((layer) => {
      const definition = LAYER_BY_ID[layer];
      if (!definition || !LOADERS[layer]) return;

      void runLayer(layer);
      if (definition.intervalMs > 0) {
        timers.push(setInterval(() => void runLayer(layer), definition.intervalMs));
      }
    });

    return () => {
      timers.forEach(clearInterval);
    };
  }, [enabledKey, keysKey, dayKey, runLayer]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return { entities, statuses, satelliteCatalog, refresh };
}
