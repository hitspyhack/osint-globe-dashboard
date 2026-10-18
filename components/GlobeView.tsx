"use client";

import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import * as THREE from "three";
import { BASEMAP_BY_ID, LAYER_BY_ID } from "@/lib/layers";
import { GLOBE_RADIUS_UNITS, circlePolygon, kmToGlobeUnits, terminatorRing } from "@/lib/geo";
import { SENSOR_CHROME, SENSOR_PASSES, SHADER_VERTEX } from "@/lib/sensors";
import { groundTrack, splitTle } from "@/lib/satellite-propagation";
import { telemetry } from "@/lib/telemetry";
import type { SatelliteRecord } from "@/lib/sources";
import type {
  BasemapId,
  Entity,
  EntityKind,
  LayerId,
  Pov,
  Selection,
  SensorId,
} from "@/types";

/* ------------------------------------------------------------------ *
 * Rendering profile per entity kind
 * ------------------------------------------------------------------ */

interface KindStyle {
  radius: number;
  /** Altitude in globe radius units. */
  altitude: number;
  /** Multiply altitude for kinds whose real altitude matters. */
  useRealAltitude?: boolean;
}

const STYLES: Record<EntityKind, KindStyle> = {
  iss: { radius: 0.55, altitude: 0.004, useRealAltitude: true },
  aircraft: { radius: 0.17, altitude: 0.006 },
  military: { radius: 0.22, altitude: 0.009 },
  vessel: { radius: 0.15, altitude: 0.002 },
  satellite: { radius: 0.13, altitude: 0.01, useRealAltitude: true },
  quake: { radius: 0.18, altitude: 0.004 },
  fire: { radius: 0.14, altitude: 0.002 },
  volcano: { radius: 0.22, altitude: 0.003 },
  storm: { radius: 0.26, altitude: 0.003 },
  flood: { radius: 0.24, altitude: 0.002 },
  webcam: { radius: 0.12, altitude: 0.001 },
  radio: { radius: 0.1, altitude: 0.001 },
  launch: { radius: 0.34, altitude: 0.02 },
  site: { radius: 0.11, altitude: 0.001 },
};

function pointAltitude(entity: Entity): number {
  const style = STYLES[entity.kind];
  if (style.useRealAltitude && entity.altitudeKm !== undefined) {
    return Math.max(0.002, kmToGlobeUnits(entity.altitudeKm));
  }
  if (entity.kind === "quake") {
    return style.altitude + Math.max(0, (entity.weight ?? 0) - 3) * 0.004;
  }
  if (entity.kind === "aircraft" && entity.altitudeKm !== undefined) {
    // Exaggerate flight levels so altitude differences read on a globe.
    return 0.004 + Math.min(entity.altitudeKm, 14) * 0.0008;
  }
  return style.altitude;
}

function pointRadius(entity: Entity): number {
  const style = STYLES[entity.kind];
  if (entity.kind === "quake") {
    return style.radius + Math.max(0, (entity.weight ?? 0) - 3) * 0.07;
  }
  if (entity.kind === "storm") {
    return style.radius + Math.min(2, (entity.weight ?? 0) / 1000);
  }
  return style.radius;
}

/* ------------------------------------------------------------------ *
 * Public API + props
 * ------------------------------------------------------------------ */

export interface GlobeApi {
  flyTo(lat: number, lng: number, altitude?: number, durationMs?: number): void;
  getPov(): Pov;
  screenshot(): string | null;
  setAutoRotate(enabled: boolean): void;
  zoomBy(factor: number): void;
}

export interface GlobeViewProps {
  entities: Partial<Record<LayerId, Entity[]>>;
  enabled: LayerId[];
  basemap: BasemapId;
  sensor: SensorId;
  autoRotate: boolean;
  /** Merge all points into one mesh: far faster, but no hover/click. */
  mergePoints: boolean;
  simTime: Date;
  selection: Selection | null;
  satelliteCatalog: Map<string, SatelliteRecord>;
  onSelect: (selection: Selection | null) => void;
  onPovChange?: (pov: Pov) => void;
  apiRef: MutableRefObject<GlobeApi | null>;
  onReady?: () => void;
}

interface PointDatum {
  lat: number;
  lng: number;
  size: number;
  color: string;
  altitude: number;
  layer: LayerId;
  entity: Entity;
}

type AnyGlobe = any;

/* ------------------------------------------------------------------ *
 * Component
 * ------------------------------------------------------------------ */

export default function GlobeView({
  entities,
  enabled,
  basemap,
  sensor,
  autoRotate,
  mergePoints,
  simTime,
  selection,
  satelliteCatalog,
  onSelect,
  onPovChange,
  apiRef,
  onReady,
}: GlobeViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const globeRef = useRef<AnyGlobe | null>(null);
  const tileTargetRef = useRef<AnyGlobe | null>(null);
  const passesRef = useRef<any[]>([]);
  const lastPointClickRef = useRef(0);
  const frameRef = useRef(0);
  const [ready, setReady] = useState(false);
  const [failedTiles, setFailedTiles] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  const enabledSet = useMemo(() => new Set(enabled), [enabled]);

  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const povRef = useRef(onPovChange);
  povRef.current = onPovChange;

  /* ---------------- initialisation ---------------- */

  useEffect(() => {
    let cancelled = false;
    let animationFrame = 0;

    const boot = async () => {
      if (!containerRef.current || globeRef.current) return;

      try {
        const { default: Globe } = await import("globe.gl");

        if (cancelled || !containerRef.current || globeRef.current) return;

        animationFrame = requestAnimationFrame(() => {
          if (cancelled || !containerRef.current) return;
          try {
            // globe.gl is a Kapsule component: `new Globe(element, config)`.
            // Clear first so React strict-mode double mounts never stack canvases.
            containerRef.current.innerHTML = "";

            const instance = new Globe(containerRef.current, {
              rendererConfig: {
                // Required for canvas.toDataURL() screenshots.
                preserveDrawingBuffer: true,
                antialias: true,
                alpha: false,
                powerPreference: "high-performance",
              },
            });

            instance
              .backgroundColor("#020617")
              .showAtmosphere(true)
              .atmosphereColor("#38bdf8")
              .atmosphereAltitude(0.18)
              .showGraticules(false)
              .pointOfView({ lat: 24, lng: 6, altitude: 2.4 })
              .pointLabel((d: object) => labelFor((d as PointDatum).entity))
              .onPointClick((datum: object) => {
                lastPointClickRef.current = Date.now();
                const point = datum as PointDatum;
                selectRef.current({ entity: point.entity, layer: point.layer });
              });

            const controls = instance.controls();
            if (controls) {
              controls.autoRotate = autoRotate;
              controls.autoRotateSpeed = 0.28;
              controls.enableDamping = true;
              controls.dampingFactor = 0.12;
              controls.minDistance = 101.5;
              controls.maxDistance = 900;
            }

            // Directional light gives satellite imagery a terminator of its own.
            const light = instance.lights().find((item: any) => item.type === "DirectionalLight");
            if (light) light.intensity = 1.6;

            globeRef.current = instance;

            // The tile engine lives on the inner ThreeGlobe object, which
            // globe.gl does not expose — find it by capability.
            const scene = instance.scene();
            tileTargetRef.current =
              scene.children.find((child: any) => typeof child.updatePov === "function") ?? null;

            setReady(true);
            onReady?.();
          } catch (error) {
            console.error("Globe initialisation failed:", error);
            setInitError(error instanceof Error ? error.message : String(error));
          }
        });
      } catch (error) {
        console.error("Failed to load globe.gl:", error);
        setInitError(error instanceof Error ? error.message : String(error));
      }
    };

    void boot();

    return () => {
      cancelled = true;
      cancelAnimationFrame(animationFrame);
      cancelAnimationFrame(frameRef.current);
      try {
        globeRef.current?._destructor?.();
      } catch {
        /* globe already torn down */
      }
      globeRef.current = null;
      tileTargetRef.current = null;
      apiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- imperative API ---------------- */

  useEffect(() => {
    if (!ready) return;

    apiRef.current = {
      flyTo: (lat, lng, altitude = 0.6, durationMs = 2200) => {
        globeRef.current?.pointOfView({ lat, lng, altitude }, durationMs);
      },
      getPov: () => globeRef.current?.pointOfView() ?? { lat: 0, lng: 0, altitude: 2.4 },
      screenshot: () => {
        const canvas = globeRef.current?.renderer()?.domElement as HTMLCanvasElement | undefined;
        if (!canvas) return null;
        try {
          return canvas.toDataURL("image/png");
        } catch {
          return null;
        }
      },
      setAutoRotate: (enabled: boolean) => {
        const controls = globeRef.current?.controls();
        if (controls) controls.autoRotate = enabled;
      },
      zoomBy: (factor: number) => {
        const pov = globeRef.current?.pointOfView();
        if (!pov) return;
        globeRef.current?.pointOfView(
          { ...pov, altitude: Math.min(6, Math.max(0.02, pov.altitude * factor)) },
          600
        );
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  /* ---------------- basemap / tile engine ---------------- */

  useEffect(() => {
    const globe = globeRef.current;
    if (!ready || !globe) return;

    const definition = BASEMAP_BY_ID[basemap];
    const templates = [definition.url, ...(definition.fallbacks ?? [])];
    let cancelled = false;

    const applyTiles = (template: string) => {
      globe.globeTileEngineMaxLevel(definition.maxLevel);
      globe.globeTileEngineUrl((x: number, y: number, level: number) =>
        template
          .replace("{l}", String(level))
          .replace("{x}", String(x))
          .replace("{y}", String(y))
      );
      try {
        globe.globeTileEngineClearCache();
      } catch {
        /* cache clear is best effort */
      }
      setFailedTiles(false);
    };

    const applyStatic = () => {
      try {
        // Hide the tile engine by clearing its URL; three-globe restores the
        // base sphere, which we then paint with a single equirectangular map.
        globe.globeTileEngineUrl(null);
        globe.globeImageUrl(definition.staticFallback ?? null);
      } catch (error) {
        console.warn("Static basemap fallback failed:", error);
      }
      setFailedTiles(true);
    };

    (async () => {
      for (const template of templates) {
        const reachable = await probeTile(template);
        if (cancelled) return;
        if (reachable) {
          applyTiles(template);
          // Refresh the engine once the camera settles.
          const target = tileTargetRef.current;
          if (target) {
            try {
              target.updatePov(globe.camera());
            } catch {
              /* noop */
            }
          }
          return;
        }
      }
      if (!cancelled) applyStatic();
    })();

    return () => {
      cancelled = true;
    };
  }, [basemap, ready]);

  /* ---------------- points ---------------- */

  const points = useMemo(() => {
    const list: PointDatum[] = [];
    enabledSet.forEach((layer) => {
      const items = entities[layer];
      if (!items) return;
      const color = LAYER_BY_ID[layer]?.color ?? "#38bdf8";
      items.forEach((entity) => {
        if (!Number.isFinite(entity.lat) || !Number.isFinite(entity.lng)) return;
        list.push({
          lat: entity.lat,
          lng: entity.lng,
          size: pointRadius(entity),
          color,
          altitude: pointAltitude(entity),
          layer,
          entity,
        });
      });
    });
    return list;
  }, [entities, enabledSet]);

  useEffect(() => {
    const globe = globeRef.current;
    if (!ready || !globe) return;

    globe
      .pointsData(points)
      .pointLat("lat")
      .pointLng("lng")
      .pointColor("color")
      .pointAltitude("altitude")
      .pointRadius("size")
      .pointResolution(12)
      .pointsMerge(mergePoints)
      .pointsTransitionDuration(0);
  }, [points, ready, mergePoints]);

  /* ---------------- rings: quake ripples + selection ---------------- */

  const ripples = useMemo(() => {
    if (!enabledSet.has("quakes")) return [];
    return (entities.quakes ?? [])
      .filter((quake) => (quake.weight ?? 0) >= 4.5)
      .slice(0, 60)
      .map((quake) => {
        const magnitude = quake.weight ?? 0;
        return {
          lat: quake.lat,
          lng: quake.lng,
          maxR: 1.2 + magnitude * 0.9,
          propagationSpeed: 0.9 + magnitude * 0.15,
          repeatPeriod: 1400,
          color: (t: number) => `rgba(244,114,182,${(1 - t) * 0.85})`,
        };
      });
  }, [entities.quakes, enabledSet]);

  useEffect(() => {
    const globe = globeRef.current;
    if (!ready || !globe) return;

    globe
      .ringsData(ripples)
      .ringLat("lat")
      .ringLng("lng")
      .ringAltitude(0.002)
      .ringColor("color")
      .ringMaxRadius("maxR")
      .ringPropagationSpeed("propagationSpeed")
      .ringRepeatPeriod("repeatPeriod")
      .ringResolution(64);
  }, [ripples, ready]);

  /* ---------------- paths: orbits, terminator ---------------- */

  const paths = useMemo(() => {
    const list: Array<{
      points: Array<{ lat: number; lng: number }>;
      color: string | ((t: number) => string);
      altitude: number;
      stroke?: number;
      name: string;
    }> = [];

    // ISS ground track (from TLE when the catalogue is available).
    if (enabledSet.has("iss")) {
      const iss = satelliteCatalog.get("25544");
      if (iss) {
        list.push({
          points: groundTrack(
            { name: iss.name, noradId: iss.noradId, tle: iss.tle },
            simTime,
            95,
            80
          ),
          color: () => "rgba(240,171,252,0.85)",
          altitude: kmToGlobeUnits(420),
          stroke: 0.6,
          name: "iss-track",
        });
      }
    }

    // Selected satellite: one full revolution of ground track.
    if (selection?.entity.kind === "satellite") {
      const lines = splitTle(String(selection.entity.meta?.TLE ?? ""));
      if (lines) {
        list.push({
          points: groundTrack(
            {
              name: selection.entity.label,
              noradId: Number(selection.entity.meta?.NORAD ?? 0),
              tle: `${lines[0]}\n${lines[1]}`,
            },
            simTime,
            96,
            90
          ),
          color: (t: number) => `rgba(167,139,250,${0.25 + 0.6 * (1 - Math.abs(t - 0.5) * 2)})`,
          altitude: Math.max(0.004, kmToGlobeUnits(selection.entity.altitudeKm ?? 500)),
          stroke: 0.8,
          name: "satellite-track",
        });
      }
    }

    if (enabledSet.has("terminator")) {
      list.push({
        points: terminatorRing(simTime).map(([lng, lat]) => ({ lat, lng })),
        color: () => "rgba(253,230,138,0.75)",
        altitude: 0.003,
        stroke: 0.5,
        name: "terminator",
      });
    }

    return list.filter((path) => path.points.length > 1);
  }, [enabledSet, satelliteCatalog, selection, simTime]);

  useEffect(() => {
    const globe = globeRef.current;
    if (!ready || !globe) return;

    globe
      .pathsData(paths)
      .pathPoints("points")
      .pathPointLat("lat")
      .pathPointLng("lng")
      .pathPointAlt("altitude")
      .pathColor("color")
      .pathStroke("stroke")
      .pathTransitionDuration(0)
      .pathDashLength(0.02)
      .pathDashGap(0.012)
      .pathDashAnimateTime(selection?.entity.kind === "satellite" ? 14_000 : 0);
  }, [paths, ready, selection]);

  /* ---------------- polygons: sensor footprint ---------------- */

  const footprints = useMemo(() => {
    if (selection?.entity.kind !== "satellite") return [];
    const footprintKm = Number(selection.entity.meta?.Footprint ?? 0);
    if (!Number.isFinite(footprintKm) || footprintKm <= 0) return [];

    return [
      {
        coords: circlePolygon(selection.entity.lat, selection.entity.lng, footprintKm, 72),
        color: "rgba(167,139,250,0.10)",
        stroke: "rgba(167,139,250,0.55)",
        altitude: 0.0015,
      },
    ];
  }, [selection]);

  useEffect(() => {
    const globe = globeRef.current;
    if (!ready || !globe) return;

    globe
      .polygonsData(footprints)
      .polygonGeoJsonGeometry((d: any) => ({
        type: "Polygon",
        coordinates: [d.coords],
      }))
      .polygonCapColor((d: any) => d.color)
      .polygonSideColor(() => "rgba(0,0,0,0)")
      .polygonStrokeColor((d: any) => d.stroke)
      .polygonAltitude((d: any) => d.altitude);
  }, [footprints, ready]);

  /* ---------------- labels: selection + high-signal events ---------------- */

  const labels = useMemo(() => {
    const list: Array<{
      lat: number;
      lng: number;
      text: string;
      size: number;
      color: string;
      altitude: number;
    }> = [];

    if (selection) {
      const { entity } = selection;
      list.push({
        lat: entity.lat,
        lng: entity.lng,
        text: entity.label,
        size: 0.62,
        color: "#f8fafc",
        altitude: pointAltitude(entity) + 0.03,
      });
    }

    if (enabledSet.has("launches")) {
      (entities.launches ?? []).slice(0, 12).forEach((launch) => {
        list.push({
          lat: launch.lat,
          lng: launch.lng,
          text: `🚀 ${launch.label}`,
          size: 0.42,
          color: "#facc15",
          altitude: 0.03,
        });
      });
    }

    if (enabledSet.has("quakes")) {
      (entities.quakes ?? [])
        .filter((quake) => (quake.weight ?? 0) >= 6)
        .slice(0, 8)
        .forEach((quake) => {
          list.push({
            lat: quake.lat,
            lng: quake.lng,
            text: `M${(quake.weight ?? 0).toFixed(1)}`,
            size: 0.42,
            color: "#f472b6",
            altitude: 0.02,
          });
        });
    }

    if (enabledSet.has("iss") && entities.iss?.length) {
      list.push({
        lat: entities.iss[0].lat,
        lng: entities.iss[0].lng,
        text: "ISS",
        size: 0.5,
        color: "#f0abfc",
        altitude: kmToGlobeUnits(420) + 0.02,
      });
    }

    return list;
  }, [selection, enabledSet, entities.launches, entities.quakes, entities.iss]);

  useEffect(() => {
    const globe = globeRef.current;
    if (!ready || !globe) return;

    globe
      .labelsData(labels)
      .labelLat("lat")
      .labelLng("lng")
      .labelText("text")
      .labelSize("size")
      .labelColor("color")
      .labelAltitude("altitude")
      .labelDotRadius(0.16)
      .labelResolution(3)
      .labelsTransitionDuration(0);
  }, [labels, ready]);

  /* ---------------- graticule ---------------- */

  useEffect(() => {
    const globe = globeRef.current;
    if (!ready || !globe) return;
    globe.showGraticules(enabledSet.has("graticule"));
  }, [enabledSet, ready]);

  /* ---------------- sensor looks (post-processing) ---------------- */

  useEffect(() => {
    const globe = globeRef.current;
    if (!ready || !globe) return;

    let disposed = false;

    const apply = async () => {
      const [{ ShaderPass }, { OutputPass }, { UnrealBloomPass }] = await Promise.all([
        import("three/examples/jsm/postprocessing/ShaderPass.js"),
        import("three/examples/jsm/postprocessing/OutputPass.js"),
        import("three/examples/jsm/postprocessing/UnrealBloomPass.js"),
      ]);

      if (disposed) return;

      const composer = globe.postProcessingComposer();
      if (!composer) return;

      // Drop the passes we added last time.
      passesRef.current.forEach((pass) => {
        composer.removePass(pass);
        pass.dispose?.();
      });
      passesRef.current = [];

      const definitions = SENSOR_PASSES[sensor];
      const renderer = globe.renderer();
      const size = renderer.getSize(new THREE.Vector2());

      definitions.forEach((definition) => {
        if (definition.type === "shader") {
          const pass = new ShaderPass({
            uniforms: {
              tDiffuse: { value: null },
              time: { value: 0 },
              resolution: { value: new THREE.Vector2(size.x, size.y) },
            },
            vertexShader: SHADER_VERTEX,
            fragmentShader: definition.fragmentShader,
          });
          composer.addPass(pass);
          passesRef.current.push(pass);
        }

        if (definition.type === "bloom") {
          const pass = new UnrealBloomPass(
            new THREE.Vector2(size.x, size.y),
            definition.strength,
            definition.radius,
            definition.threshold
          );
          composer.addPass(pass);
          passesRef.current.push(pass);
        }
      });

      // Always finish with an output pass so tone mapping / colour space are
      // handled consistently once extra passes are in the chain.
      const output = new OutputPass();
      composer.addPass(output);
      passesRef.current.push(output);
    };

    void apply();

    return () => {
      disposed = true;
    };
  }, [sensor, ready]);

  /* ---------------- auto-rotate ---------------- */

  useEffect(() => {
    const globe = globeRef.current;
    if (!ready || !globe) return;
    const controls = globe.controls();
    if (controls) controls.autoRotate = autoRotate;
  }, [autoRotate, ready]);

  /* ---------------- telemetry + tile engine POV updates ---------------- */

  useEffect(() => {
    if (!ready) return;

    let frames = 0;
    let last = performance.now();
    let lastPov: Pov | null = null;
    let lastTileUpdate = 0;

    const tick = () => {
      frameRef.current = requestAnimationFrame(tick);
      const globe = globeRef.current;
      if (!globe) return;

      const now = performance.now();
      frames += 1;
      if (now - last >= 1000) {
        telemetry.fps = Math.round((frames * 1000) / (now - last));
        frames = 0;
        last = now;

        const renderer = globe.renderer();
        if (renderer?.info?.render) {
          telemetry.drawCalls = renderer.info.render.calls;
          telemetry.triangles = renderer.info.render.triangles;
        }
      }

      const pov = globe.pointOfView();
      if (pov) {
        telemetry.lat = pov.lat;
        telemetry.lng = pov.lng;
        telemetry.altitude = pov.altitude;

        if (
          !lastPov ||
          Math.abs(lastPov.lat - pov.lat) > 0.01 ||
          Math.abs(lastPov.lng - pov.lng) > 0.01 ||
          Math.abs(lastPov.altitude - pov.altitude) > 0.005
        ) {
          lastPov = pov;
          povRef.current?.(pov);
        }

        // Feed the camera to the slippy-tile engine (throttled).
        const target = tileTargetRef.current;
        if (target && now - lastTileUpdate > 120) {
          lastTileUpdate = now;
          try {
            target.updatePov(globe.camera());
          } catch {
            /* tile engine may not be present on older builds */
          }
        }
      }

      // Advance time-based shader uniforms.
      const elapsed = now / 1000;
      passesRef.current.forEach((pass) => {
        if (pass.uniforms?.time) pass.uniforms.time.value = elapsed;
      });
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [ready]);

  /* ---------------- resize handling ---------------- */

  useEffect(() => {
    if (!ready) return;
    const container = containerRef.current;
    const globe = globeRef.current;
    if (!container || !globe) return;

    const observer = new ResizeObserver(() => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      globe.width(width);
      globe.height(height);

      passesRef.current.forEach((pass) => {
        if (pass.uniforms?.resolution) {
          pass.uniforms.resolution.value.set(
            width * window.devicePixelRatio,
            height * window.devicePixelRatio
          );
        }
        if (pass.setSize) pass.setSize(width, height);
      });
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [ready]);

  /* ---------------- pointer position + deselect ---------------- */

  useEffect(() => {
    const container = containerRef.current;
    if (!ready || !container) return;

    const canvas = container.querySelector("canvas");
    const surface = canvas ?? container;

    const onPointerMove = (event: Event) => {
      const globe = globeRef.current;
      if (!globe) return;
      const rect = (surface as HTMLElement).getBoundingClientRect();
      const pointer = event as PointerEvent;
      const coords = screenToGeo(
        globe,
        pointer.clientX - rect.left,
        pointer.clientY - rect.top,
        rect.width,
        rect.height
      );
      telemetry.pointerLat = coords?.lat ?? null;
      telemetry.pointerLng = coords?.lng ?? null;
    };

    const onPointerLeave = () => {
      telemetry.pointerLat = null;
      telemetry.pointerLng = null;
    };

    const onClick = () => {
      // globe.gl's own point click fires first; ignore empty-space clicks that
      // are really part of a point selection.
      if (Date.now() - lastPointClickRef.current < 350) return;
      selectRef.current(null);
    };

    surface.addEventListener("pointermove", onPointerMove);
    surface.addEventListener("pointerleave", onPointerLeave);
    surface.addEventListener("click", onClick);

    return () => {
      surface.removeEventListener("pointermove", onPointerMove);
      surface.removeEventListener("pointerleave", onPointerLeave);
      surface.removeEventListener("click", onClick);
    };
  }, [ready]);

  const chromeClass = SENSOR_CHROME[sensor] ?? "";

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className={`globe-surface h-full w-full ${chromeClass}`} />
      {!ready && !initError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950 text-slate-400">
          <div className="hud-spinner" />
          <div className="text-xs uppercase tracking-[0.4em] text-sky-400">Initialising optics</div>
        </div>
      )}
      {initError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950 px-8 text-center">
          <div className="text-xs uppercase tracking-[0.3em] text-rose-400">Optics offline</div>
          <p className="max-w-md text-[11px] leading-relaxed text-slate-400">
            The 3D globe could not start. This usually means WebGL is unavailable or blocked in
            this browser.
          </p>
          <pre className="max-w-md overflow-auto rounded border border-rose-900/60 bg-rose-950/40 p-2 text-[10px] text-rose-300">
            {initError}
          </pre>
        </div>
      )}
      {ready && failedTiles && (
        <div className="pointer-events-none absolute left-1/2 top-24 -translate-x-1/2 rounded border border-amber-500/40 bg-amber-950/70 px-3 py-1.5 text-[11px] uppercase tracking-widest text-amber-200">
          Imagery tiles unavailable — switch basemap in settings
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function labelFor(entity: Entity): string {
  const lines = [`<b>${escapeHtml(entity.label)}</b>`];
  if (entity.sublabel) lines.push(escapeHtml(entity.sublabel));
  if (entity.altitudeKm !== undefined) {
    lines.push(`${entity.altitudeKm.toFixed(entity.altitudeKm < 100 ? 1 : 0)} km`);
  }
  return lines.join("<br/>");
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

/**
 * Can this tile template actually be loaded by the browser?
 *
 * WebGL textures require CORS-enabled images, and a tile server that is down
 * would otherwise leave a black globe with no explanation. A low-zoom probe
 * tile answers the question cheaply.
 */
function probeTile(template: string): Promise<boolean> {
  const url = template
    .replace("{l}", "1")
    .replace("{x}", "0")
    .replace("{y}", "0");

  return new Promise((resolve) => {
    const image = new Image();
    let settled = false;

    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(ok);
    };

    const timer = setTimeout(() => finish(false), 9000);
    image.crossOrigin = "anonymous";
    image.onload = () => finish(image.width > 0);
    image.onerror = () => finish(false);
    image.src = url;
  });
}

/**
 * Screen pixel → geographic coordinates.
 *
 * globe.gl's own `toGlobeCoords` raycasts against the base sphere mesh, which
 * is hidden while the slippy-tile engine is active, so we intersect the globe
 * analytically instead.
 */
function screenToGeo(
  globe: AnyGlobe,
  x: number,
  y: number,
  width: number,
  height: number
): { lat: number; lng: number } | null {
  const camera = globe.camera();
  if (!camera) return null;

  const ndcX = (x / width) * 2 - 1;
  const ndcY = -(y / height) * 2 + 1;

  // Ray from the camera through the cursor, in world space.
  const origin = camera.position.clone();
  const direction = cameraDirection(globe, ndcX, ndcY);
  if (!direction) return null;

  // Solve |origin + t·direction|² = R² for the sphere at the origin.
  const a = direction.dot(direction);
  const b = 2 * origin.dot(direction);
  const c = origin.dot(origin) - GLOBE_RADIUS_UNITS * GLOBE_RADIUS_UNITS;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;

  const t = (-b - Math.sqrt(discriminant)) / (2 * a);
  if (t < 0) return null;

  const hit = origin.clone().add(direction.multiplyScalar(t));
  const r = hit.length() || 1;
  const lat = 90 - (Math.acos(hit.y / r) * 180) / Math.PI;
  let lng = 90 - (Math.atan2(hit.z, hit.x) * 180) / Math.PI;
  lng = ((lng + 540) % 360) - 180;

  return { lat, lng };
}

function cameraDirection(globe: AnyGlobe, ndcX: number, ndcY: number) {
  const camera = globe.camera();
  if (!camera) return null;
  return new THREE.Vector3(ndcX, ndcY, 0.5).unproject(camera).sub(camera.position).normalize();
}
