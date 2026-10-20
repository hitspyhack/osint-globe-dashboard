"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import * as THREE from "three";
import { BASEMAP_BY_ID, LAYER_BY_ID } from "@/lib/layers";
import { earthRotationAngle, SIDEREAL_AUTO_ROTATE_SPEED } from "@/lib/astronomy";
import { loadGlobalTerrainGrid, type GlobalTerrainGrid } from "@/lib/elevation";
import {
  GLOBE_RADIUS_UNITS,
  circlePolygon,
  kmToGlobeUnits,
  pathLengthKm,
  subsolarPoint,
  terminatorRing,
} from "@/lib/geo";
import { SENSOR_CHROME, SENSOR_PASSES, SHADER_VERTEX } from "@/lib/sensors";
import {
  headingDegrees,
  OBJECT_BASE_SCALE,
  prototypeFor,
  SHARED_OBJECT_MATERIAL,
} from "@/lib/entity-shapes";
import MatrixRain from "@/components/MatrixRain";
import { groundTrack, splitTle } from "@/lib/satellite-propagation";
import { telemetry } from "@/lib/telemetry";
import type { SatelliteRecord } from "@/lib/sources";
import type {
  BasemapId,
  Entity,
  EntityKind,
  ElevationStatus,
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
  mapillary: { radius: 0.12, altitude: 0.001 },
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
  if ((entity.kind === "aircraft" || entity.kind === "military") && entity.altitudeKm !== undefined) {
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
  if (entity.kind === "mapillary") {
    // 360° captures read slightly larger on the grid.
    return style.radius + (entity.weight ? 0.06 : 0);
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
  /**
   * Pan the view along the current screen orientation. `sx`/`sy` are stick
   * deflections in [-1, 1] (right/up); the step is scaled by `dtSeconds` and
   * by the camera altitude, so panning stays slow near the ground.
   */
  panBy(sx: number, sy: number, dtSeconds: number): void;
  /** Tilt (0–80° from nadir) and heading (° clockwise from north). */
  setOrientation(tilt: number, heading: number): void;
  getOrientation(): { tilt: number; heading: number };
  resetOrientation(): void;
}

export interface GlobeViewProps {
  entities: Partial<Record<LayerId, Entity[]>>;
  enabled: LayerId[];
  basemap: BasemapId;
  sensor: SensorId;
  autoRotate: boolean;
  /** Merge fallback points into one mesh: far faster, but no hover/click. */
  mergePoints: boolean;
  /** Render entities as 3D shapes (jets, hulls, satellites...) instead of columns. */
  objectShapes: boolean;
  elevationEnabled: boolean;
  elevationExaggeration: number;
  /** Terrain mesh opacity, 0 (invisible) – 100 (opaque). */
  elevationOpacity: number;
  onElevationStatus: (status: ElevationStatus) => void;
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

/**
 * One 3D entity rendered through the globe's objects layer. `rotation` is in
 * degrees around the local up axis (nose-north baseline, so a heading rotates
 * the shape clockwise when viewed from above); `scale` is the base world size
 * before the camera-distance zoom factor.
 */
interface ObjectDatum {
  lat: number;
  lng: number;
  altitude: number;
  rotation: { x: number; y: number; z: number };
  scale: number;
  kind: EntityKind;
  color: string;
  layer: LayerId;
  entity: Entity;
  /** Retained mesh handle for camera-distance scaling. */
  mesh?: THREE.Mesh;
}

/**
 * Entity meshes are one draw call each, so the busiest layers keep a budget:
 * over the cap the layer falls back to the (merged) points pipeline.
 */
const OBJECT_CAPS: Partial<Record<LayerId, number>> = {
  flights: 3000,
  military: 1500,
};

function objectScale(entity: Entity): number {
  const base = OBJECT_BASE_SCALE[entity.kind];
  if (entity.kind === "quake") {
    return base * (1 + Math.max(0, (entity.weight ?? 0) - 3) * 0.3);
  }
  if (entity.kind === "storm") {
    return base * (1 + Math.min(1.6, (entity.weight ?? 0) / 1000));
  }
  if (entity.kind === "mapillary") {
    // 360° captures read slightly larger on the grid.
    return base * (entity.weight ? 1.25 : 1);
  }
  return base;
}

type AnyGlobe = any;

/** Scratch objects for the per-frame orientation / pan math (no allocation). */
const ORIGIN = new THREE.Vector3(0, 0, 0);
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const scratchMatrix = new THREE.Matrix4();
const scratchNormal = new THREE.Vector3();
const scratchUp = new THREE.Vector3();
const scratchRight = new THREE.Vector3();
const scratchDirection = new THREE.Vector3();
const scratchPosition = new THREE.Vector3();

/** Max camera tilt from nadir, degrees — keeps the horizon above the floor. */
const MAX_TILT_DEG = 80;
/** Mouse-look sensitivity: degrees of view rotation per pixel of drag. */
const LOOK_HEADING_DEG_PER_PX = 0.3;
const LOOK_TILT_DEG_PER_PX = 0.25;
/** Pan speed at full stick deflection, degrees/second at globe-scale altitude. */
const PAN_SPEED_DEG_PER_SEC = 22;
/** Latitude clamp for the pan / camera sub-point. */
const MAX_LAT_DEG = 85;

/** NORAD id of the ISS, used for its TLE ground track. */
const ISS_NORAD_ID = "25544";

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
  objectShapes,
  elevationEnabled,
  elevationExaggeration,
  elevationOpacity,
  onElevationStatus,
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
  const starFieldRef = useRef<THREE.Group | null>(null);
  const sunLightRef = useRef<THREE.DirectionalLight | null>(null);
  const terrainMeshRef = useRef<THREE.Mesh | null>(null);
  /** Night-side shading veil — follows the computed subsolar point. */
  const nightVeilRef = useRef<THREE.Mesh | null>(null);
  const elevationExaggerationRef = useRef(elevationExaggeration);
  elevationExaggerationRef.current = elevationExaggeration;
  const elevationOpacityRef = useRef(elevationOpacity);
  elevationOpacityRef.current = elevationOpacity;
  /** Navigational tilt/heading, degrees. Applied by the camera.lookAt wrap. */
  const orientationRef = useRef({ tilt: 0, heading: 0 });
  const lookAtRestoreRef = useRef<(() => void) | null>(null);
  const lastPointClickRef = useRef(0);
  const frameRef = useRef(0);
  /** Active mouse-look drag (right / ctrl drag), if any. */
  const lookDragRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    tilt: number;
    heading: number;
  } | null>(null);
  /** Timestamp of the last look gesture, so its trailing click is not a deselect. */
  const lastLookRef = useRef(0);
  /** Detaches the mouse-look listeners on teardown. */
  const lookDetachRef = useRef<(() => void) | null>(null);
  /** Current object datums — kept for camera-distance scaling passes. */
  const objectsRef = useRef<ObjectDatum[]>([]);
  /** Camera-distance size factor applied to every object mesh (see tick). */
  const objectZoomRef = useRef(1);
  const [ready, setReady] = useState(false);
  const [failedTiles, setFailedTiles] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  const enabledSet = useMemo(() => new Set(enabled), [enabled]);

  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const povRef = useRef(onPovChange);
  povRef.current = onPovChange;

  /* ---------------- navigational tilt / heading ---------------- */

  // OrbitControls re-orients the camera with `camera.lookAt(target)` on every
  // update, immediately before the frame renders. `applyCameraOrientation`
  // rebuilds the orientation from scratch (idempotent): the native nadir /
  // north-up view, a heading spin, then a horizon tilt. It is hooked into
  // camera.lookAt so it always runs between the controls update and the render
  // — drags, damping, programmatic pans and flyTo tweens all pick it up
  // without fighting the controls' own state.
  const applyCameraOrientation = useCallback(() => {
    const globe = globeRef.current;
    if (!globe) return;
    const camera = globe.camera() as THREE.PerspectiveCamera | undefined;
    if (!camera) return;

    const { tilt, heading } = orientationRef.current;
    scratchMatrix.lookAt(camera.position, ORIGIN, WORLD_UP);
    camera.quaternion.setFromRotationMatrix(scratchMatrix);
    // Heading is a roll around the view axis (compass: east is up at +90°),
    // then the tilt leans the view toward the top-of-screen horizon. The
    // pan basis below uses the camera's rolled up-axis, so the joystick's
    // stick-up always flies toward the top of the screen.
    if (heading !== 0) camera.rotateZ(-THREE.MathUtils.degToRad(heading));
    if (tilt !== 0) camera.rotateX(THREE.MathUtils.degToRad(tilt));
  }, []);

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
              // Keep the camera in the Earth-fixed frame; the inertial sky rotates
              // around the globe at the computed sidereal rate below.
              controls.autoRotate = false;
              controls.autoRotateSpeed = SIDEREAL_AUTO_ROTATE_SPEED;
              controls.enableDamping = true;
              controls.dampingFactor = 0.12;
              // Street-level access: ~4.5 km above the surface. Any closer and
              // the renderer's 0.05 near plane starts z-fighting the tiles.
              controls.minDistance = 100.07;
              controls.maxDistance = 900;
            }

            // Mouse 3D navigation: right-drag (or ctrl/cmd + left-drag) tilts
            // and rotates the view through the same orientation system the
            // joystick drives — the mouse gets the full 3rd axis, not just
            // orbit + zoom. The listeners live on the container in the
            // CAPTURE phase so OrbitControls never sees these gestures
            // (ctrl + left would otherwise start a globe rotate).
            const surface = containerRef.current;
            const isLookGesture = (event: PointerEvent) =>
              event.button === 2 || (event.button === 0 && (event.ctrlKey || event.metaKey));

            const onLookPointerDown = (event: PointerEvent) => {
              if (!isLookGesture(event)) return;
              event.preventDefault();
              event.stopPropagation();
              const { tilt, heading } = orientationRef.current;
              lookDragRef.current = {
                pointerId: event.pointerId,
                x: event.clientX,
                y: event.clientY,
                tilt,
                heading,
              };
              lastLookRef.current = Date.now();
              surface.style.cursor = "grabbing";
              try {
                surface.setPointerCapture(event.pointerId);
              } catch {
                /* pointer capture is best effort */
              }
            };

            const onLookPointerMove = (event: PointerEvent) => {
              const drag = lookDragRef.current;
              if (!drag || drag.pointerId !== event.pointerId) return;
              event.preventDefault();
              const dx = event.clientX - drag.x;
              const dy = event.clientY - drag.y;
              // Grab feel — the scene follows the cursor: drag right spins the
              // world right (heading falls), drag down pulls the horizon down
              // into view (tilt rises toward the horizon).
              const heading = ((drag.heading - dx * LOOK_HEADING_DEG_PER_PX + 540) % 360) - 180;
              const tilt = Math.min(MAX_TILT_DEG, Math.max(0, drag.tilt + dy * LOOK_TILT_DEG_PER_PX));
              orientationRef.current = { tilt, heading };
              applyCameraOrientation();
            };

            const onLookPointerUp = (event: PointerEvent) => {
              if (lookDragRef.current?.pointerId !== event.pointerId) return;
              lookDragRef.current = null;
              lastLookRef.current = Date.now();
              surface.style.cursor = "";
            };

            const onLookContextMenu = (event: MouseEvent) => {
              // The right button is the look gesture — keep the menu away.
              event.preventDefault();
            };

            surface.addEventListener("pointerdown", onLookPointerDown, true);
            window.addEventListener("pointermove", onLookPointerMove, true);
            window.addEventListener("pointerup", onLookPointerUp, true);
            window.addEventListener("pointercancel", onLookPointerUp, true);
            surface.addEventListener("contextmenu", onLookContextMenu);
            lookDetachRef.current = () => {
              surface.removeEventListener("pointerdown", onLookPointerDown, true);
              window.removeEventListener("pointermove", onLookPointerMove, true);
              window.removeEventListener("pointerup", onLookPointerUp, true);
              window.removeEventListener("pointercancel", onLookPointerUp, true);
              surface.removeEventListener("contextmenu", onLookContextMenu);
              lookDragRef.current = null;
              surface.style.cursor = "";
            };

            // Hook tilt/heading into the camera's lookAt so the orientation is
            // re-applied after every controls update, right before rendering.
            const camera = instance.camera() as THREE.PerspectiveCamera;
            const nativeLookAt = camera.lookAt.bind(camera);
            camera.lookAt = ((...args: Parameters<THREE.PerspectiveCamera["lookAt"]>) => {
              (nativeLookAt as (...a: unknown[]) => void)(...args);
              applyCameraOrientation();
            }) as THREE.PerspectiveCamera["lookAt"];
            lookAtRestoreRef.current = () => {
              camera.lookAt = nativeLookAt;
            };

            // Directional sunlight is re-aimed from the computed subsolar point.
            const light = instance.lights().find((item: any) => item.type === "DirectionalLight");
            if (light) {
              light.intensity = 1.6;
              sunLightRef.current = light as THREE.DirectionalLight;
            }

            globeRef.current = instance;

            // Procedural stars provide an inertial deep-space reference behind Earth.
            const scene = instance.scene();
            starFieldRef.current = createStarField();
            scene.add(starFieldRef.current);

            // Night-side veil: a translucent shell that darkens the half of the
            // globe facing away from the Sun, with a soft twilight band along
            // the terminator. FrontSide + depth-tested, so it fades out on its
            // own once the camera descends inside its radius.
            nightVeilRef.current = createNightVeil();
            scene.add(nightVeilRef.current);

            // The tile engine lives on the inner ThreeGlobe object, which
            // globe.gl does not expose — find it by capability.
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
      lookDetachRef.current?.();
      lookDetachRef.current = null;
      lookAtRestoreRef.current?.();
      lookAtRestoreRef.current = null;
      const scene = globeRef.current?.scene();
      if (terrainMeshRef.current) {
        scene?.remove(terrainMeshRef.current);
        terrainMeshRef.current.geometry.dispose();
        (terrainMeshRef.current.material as THREE.Material).dispose();
        terrainMeshRef.current = null;
      }
      if (starFieldRef.current) {
        scene?.remove(starFieldRef.current);
        starFieldRef.current.traverse((object) => {
          if (!(object instanceof THREE.Points)) return;
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        });
        starFieldRef.current = null;
      }
      if (nightVeilRef.current) {
        scene?.remove(nightVeilRef.current);
        nightVeilRef.current.geometry.dispose();
        (nightVeilRef.current.material as THREE.Material).dispose();
        nightVeilRef.current = null;
      }
      sunLightRef.current = null;
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
          { ...pov, altitude: Math.min(6, Math.max(0.0008, pov.altitude * factor)) },
          600
        );
      },
      panBy: (sx: number, sy: number, dtSeconds: number) => {
        const globe = globeRef.current;
        const camera = globe?.camera() as THREE.PerspectiveCamera | undefined;
        if (!globe || !camera) return;

        // Screen up/right on the ground: the camera's own up axis projected
        // onto the tangent plane at the sub-camera point, so panning follows
        // the current heading/tilt instead of raw north.
        scratchUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
        scratchNormal.copy(camera.position).normalize();
        scratchUp.addScaledVector(scratchNormal, -scratchUp.dot(scratchNormal));
        if (scratchUp.lengthSq() < 1e-6) return; // degenerate at the poles
        scratchUp.normalize();
        scratchRight.crossVectors(scratchUp, scratchNormal).normalize();
        scratchDirection.copy(scratchRight).multiplyScalar(sx).addScaledVector(scratchUp, sy);

        const magnitude = scratchDirection.length();
        if (magnitude < 1e-6) return;
        scratchDirection.multiplyScalar(1 / magnitude);

        // Steps scale with altitude: whole-globe views sweep fast, close-ups crawl.
        const altitude = Math.min(3, Math.max(0.003, globe.pointOfView()?.altitude ?? 1));
        const delta = THREE.MathUtils.degToRad(
          PAN_SPEED_DEG_PER_SEC * altitude * magnitude * dtSeconds
        );
        if (delta <= 0) return;

        // Great-circle step from the current sub-point along the stick vector.
        scratchPosition
          .copy(scratchNormal)
          .multiplyScalar(Math.cos(delta))
          .addScaledVector(scratchDirection, Math.sin(delta));
        // Keep the camera out of the polar gimbal zone.
        const maxPolarY = Math.sin(THREE.MathUtils.degToRad(MAX_LAT_DEG));
        if (Math.abs(scratchPosition.y) > maxPolarY) {
          scratchPosition.y = Math.sign(scratchPosition.y) * maxPolarY;
          scratchPosition.normalize();
        }
        const distance = camera.position.length();
        camera.position.copy(scratchPosition).multiplyScalar(distance);
      },
      setOrientation: (tilt: number, heading: number) => {
        const wrapped = ((heading % 360) + 540) % 360 - 180;
        orientationRef.current = {
          tilt: Math.min(MAX_TILT_DEG, Math.max(0, tilt)),
          heading: wrapped,
        };
        applyCameraOrientation();
      },
      getOrientation: () => ({ ...orientationRef.current }),
      resetOrientation: () => {
        orientationRef.current = { tilt: 0, heading: 0 };
        applyCameraOrientation();
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

  /* ---------------- global DEM / relief mesh ---------------- */

  useEffect(() => {
    const globe = globeRef.current;
    if (!ready || !globe) return;

    if (!elevationEnabled) {
      if (terrainMeshRef.current) terrainMeshRef.current.visible = false;
      onElevationStatus({ phase: "off", progress: 0 });
      return;
    }

    if (terrainMeshRef.current) {
      terrainMeshRef.current.visible = true;
      setTerrainExaggeration(terrainMeshRef.current, elevationExaggerationRef.current);
      const terrain = terrainMeshRef.current.userData.terrainBounds as { minMeters: number; maxMeters: number };
      onElevationStatus({
        phase: "ready",
        progress: 100,
        minMeters: terrain.minMeters,
        maxMeters: terrain.maxMeters,
      });
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    onElevationStatus({ phase: "loading", progress: 0 });

    void loadGlobalTerrainGrid(controller.signal, ({ completedTiles, totalTiles }) => {
      if (cancelled) return;
      onElevationStatus({
        phase: "loading",
        progress: Math.round((completedTiles / totalTiles) * 100),
      });
    })
      .then((grid) => {
        if (cancelled) return;
        const mesh = createTerrainMesh(grid, elevationExaggerationRef.current);
        mesh.visible = true;
        mesh.userData.terrainBounds = { minMeters: grid.minMeters, maxMeters: grid.maxMeters };
        setTerrainOpacity(mesh, elevationOpacityRef.current);
        globe.scene().add(mesh);
        terrainMeshRef.current = mesh;
        onElevationStatus({
          phase: "ready",
          progress: 100,
          minMeters: grid.minMeters,
          maxMeters: grid.maxMeters,
        });
      })
      .catch((error: unknown) => {
        if (cancelled || controller.signal.aborted) return;
        controller.abort();
        const message = error instanceof Error ? error.message : String(error);
        onElevationStatus({ phase: "error", progress: 0, error: message });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [elevationEnabled, onElevationStatus, ready]);

  useEffect(() => {
    if (terrainMeshRef.current) {
      setTerrainExaggeration(terrainMeshRef.current, elevationExaggeration);
    }
  }, [elevationExaggeration, ready]);

  useEffect(() => {
    if (terrainMeshRef.current) {
      setTerrainOpacity(terrainMeshRef.current, elevationOpacity);
    }
  }, [elevationOpacity, ready]);

  /* ---------------- live solar illumination ---------------- */

  useEffect(() => {
    if (!ready) return;

    const sun = subsolarPoint(simTime);
    if (sunLightRef.current) aimSunlight(sunLightRef.current, simTime);

    // Keep the night veil aimed at the same subsolar point. The Day/Night
    // layer toggles the veil; the crisp terminator ring stays a path.
    const veil = nightVeilRef.current;
    if (veil) {
      const latitude = (sun.lat * Math.PI) / 180;
      const longitude = (sun.lng * Math.PI) / 180;
      const material = veil.material as THREE.ShaderMaterial;
      material.uniforms.uSunDirection.value
        .set(
          Math.cos(latitude) * Math.sin(longitude),
          Math.sin(latitude),
          Math.cos(latitude) * Math.cos(longitude)
        )
        .normalize();
      veil.visible = enabledSet.has("terminator");
    }
  }, [ready, simTime, enabledSet]);

  /* ---------------- 3D entity objects ---------------- */

  // Entities become recognisable 3D shapes (aircraft, vessels, satellites...)
  // whenever shape rendering is on — deliberately NOT tied to "Merge points",
  // which only governs the points fallback for over-budget layers. (Tying
  // shapes to that performance toggle previously left users stuck on columns.)
  const objectPlan = useMemo(() => {
    const datums: ObjectDatum[] = [];
    const objectLayers = new Set<LayerId>();
    if (objectShapes) {
      enabledSet.forEach((layer) => {
        const items = entities[layer];
        if (!items || !items.length) return;
        const cap = OBJECT_CAPS[layer] ?? Number.POSITIVE_INFINITY;
        if (items.length > cap) return;
        const color = LAYER_BY_ID[layer]?.color ?? "#38bdf8";
        objectLayers.add(layer);
        items.forEach((entity) => {
          if (!Number.isFinite(entity.lat) || !Number.isFinite(entity.lng)) return;
          const heading = headingDegrees(entity);
          datums.push({
            lat: entity.lat,
            lng: entity.lng,
            altitude: pointAltitude(entity),
            rotation:
              heading === null ? { x: 0, y: 0, z: 0 } : { x: 0, y: 0, z: -heading },
            scale: objectScale(entity),
            kind: entity.kind,
            color,
            layer,
            entity,
          });
        });
      });
    }
    return { datums, objectLayers };
  }, [entities, enabledSet, objectShapes]);

  const objectThreeObject = useCallback((datum: ObjectDatum) => {
    // One shared prototype + shared material per (kind, colour): each mesh is a
    // single lightweight wrapper, and the baked-in scale keeps three-globe's
    // position/rotation-only update path happy.
    const mesh = new THREE.Mesh(prototypeFor(datum.kind, datum.color), SHARED_OBJECT_MATERIAL);
    mesh.scale.setScalar(datum.scale * objectZoomRef.current);
    datum.mesh = mesh;
    return mesh;
  }, []);

  useEffect(() => {
    const globe = globeRef.current;
    if (!ready || !globe) return;

    objectsRef.current = objectPlan.datums;

    globe
      .objectsData(objectPlan.datums)
      .objectLat("lat")
      .objectLng("lng")
      .objectAltitude("altitude")
      .objectRotation("rotation")
      .objectThreeObject(objectThreeObject)
      .objectLabel((d: object) => labelFor((d as ObjectDatum).entity))
      .onObjectClick((datum: object) => {
        lastPointClickRef.current = Date.now();
        const item = datum as ObjectDatum;
        selectRef.current({ entity: item.entity, layer: item.layer });
      });
  }, [objectPlan, ready, objectThreeObject]);

  /* ---------------- points ---------------- */

  const points = useMemo(() => {
    const list: PointDatum[] = [];
    const { objectLayers } = objectPlan;
    enabledSet.forEach((layer) => {
      if (objectLayers.has(layer)) return; // rendered as 3D objects instead
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
  }, [entities, enabledSet, objectPlan]);

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
      /** Per-path dash state. A zero gap disables dashes entirely. */
      dashLength: number;
      dashGap: number;
      animateTime: number;
      name: string;
    }> = [];

    // ISS ground track (from TLE when the catalogue is available).
    if (enabledSet.has("iss")) {
      const iss = satelliteCatalog.get(ISS_NORAD_ID);
      if (iss) {
        list.push({
          points: groundTrack({ name: iss.name, noradId: iss.noradId, tle: iss.tle }, simTime, 95, 80),
          color: () => "rgba(240,171,252,0.85)",
          altitude: kmToGlobeUnits(420),
          stroke: 0.6,
          dashLength: 0,
          dashGap: 0,
          animateTime: 0,
          name: "iss-track",
        });
      }
    }

    // Selected satellite: one full revolution of ground track, dashed and animated.
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
          dashLength: 0.02,
          dashGap: 0.012,
          animateTime: 14_000,
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
        dashLength: 0,
        dashGap: 0,
        animateTime: 0,
        name: "terminator",
      });
    }

    // three-globe computes dashScale as 1 / lineLength, so a degenerate
    // (zero-length or NaN) path would poison the fat-line geometry with NaN.
    return list.filter((path) => {
      if (path.points.length < 2) return false;
      const length = pathLengthKm(path.points);
      return Number.isFinite(length) && length > 1;
    });
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
      .pathDashLength("dashLength")
      .pathDashGap("dashGap")
      .pathDashAnimateTime("animateTime");
  }, [paths, ready]);

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

  /* ---------------- true sidereal Earth / inertial-sky rotation -------- */

  useEffect(() => {
    if (!ready || !autoRotate || !starFieldRef.current) return;
    const siderealAngle = (earthRotationAngle(simTime) * Math.PI) / 180;
    // Earth is held in the geographic frame; counter-rotate the distant sky to
    // show the same physical motion against an inertial stellar background.
    starFieldRef.current.rotation.y = -siderealAngle;
  }, [autoRotate, ready, simTime]);

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
        // Visible confirmation that the 3D shape pipeline is live.
        telemetry.objects = objectsRef.current.length;
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

        // Camera-distance scaling for 3D entity objects: shapes hold a roughly
        // constant share of the viewport down to street level, then stop
        // growing once the camera pulls past the default view distance.
        // three-globe never touches mesh scale, so this is applied directly.
        if (typeof pov.altitude === "number") {
          const factor = Math.min(1, Math.max(0.02, pov.altitude / 2.4));
          const previous = objectZoomRef.current;
          if (Math.abs(factor - previous) > Math.max(0.002, previous * 0.04)) {
            objectZoomRef.current = factor;
            const datums = objectsRef.current;
            for (let index = 0; index < datums.length; index += 1) {
              datums[index].mesh?.scale.setScalar(datums[index].scale * factor);
            }
          }
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
      // A finished look gesture (ctrl + left-drag) leaves a trailing click
      // behind — that is camera work, not a deselect.
      if (Date.now() - lastLookRef.current < 350) return;
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
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#010803] text-[#6fbf85]">
          <MatrixRain className="absolute inset-0" opacity={0.4} />
          <div className="hud-spinner relative" />
          <div className="relative text-xs uppercase tracking-[0.4em] text-emerald-400">
            Initialising optics
          </div>
        </div>
      )}
      {initError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#010803] px-8 text-center">
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

function createStarField(): THREE.Group {
  const group = new THREE.Group();
  const random = seededRandom(0x41524e41);
  const galacticNormal = new THREE.Vector3(0.48, 0.7, 0.53).normalize();
  const basisA = new THREE.Vector3().crossVectors(galacticNormal, new THREE.Vector3(0, 1, 0)).normalize();
  const basisB = new THREE.Vector3().crossVectors(galacticNormal, basisA).normalize();

  const makeLayer = (count: number, size: number, seedOffset: number) => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const layerRandom = seededRandom(0x41524e41 + seedOffset);
    const warm = new THREE.Color("#ffe3bd");
    const cool = new THREE.Color("#b9d7ff");
    const neutral = new THREE.Color("#f8fafc");

    for (let index = 0; index < count; index += 1) {
      let direction: THREE.Vector3;
      if (layerRandom() < 0.36) {
        const angle = layerRandom() * Math.PI * 2;
        const bandOffset = (layerRandom() - 0.5) * 0.22;
        direction = basisA
          .clone()
          .multiplyScalar(Math.cos(angle) * Math.cos(bandOffset))
          .addScaledVector(basisB, Math.sin(angle) * Math.cos(bandOffset))
          .addScaledVector(galacticNormal, Math.sin(bandOffset));
      } else {
        const y = layerRandom() * 2 - 1;
        const angle = layerRandom() * Math.PI * 2;
        const horizontal = Math.sqrt(1 - y * y);
        direction = new THREE.Vector3(horizontal * Math.cos(angle), y, horizontal * Math.sin(angle));
      }

      // Far enough from the camera to behave like a celestial background, not a nearby shell.
      const radius = 78_000 + layerRandom() * 6_000;
      const offset = index * 3;
      positions[offset] = direction.x * radius;
      positions[offset + 1] = direction.y * radius;
      positions[offset + 2] = direction.z * radius;

      const tint = layerRandom() < 0.18 ? warm : layerRandom() < 0.42 ? cool : neutral;
      const brightness = 0.36 + layerRandom() * 0.64;
      colors[offset] = tint.r * brightness;
      colors[offset + 1] = tint.g * brightness;
      colors[offset + 2] = tint.b * brightness;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      size,
      sizeAttenuation: false,
      vertexColors: true,
      transparent: true,
      opacity: 0.84,
      depthWrite: false,
      toneMapped: false,
    });
    group.add(new THREE.Points(geometry, material));
  };

  makeLayer(3600, 1.15, 1);
  makeLayer(220, 1.9, 2);
  group.name = "procedural-inertial-starfield";
  return group;
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

/**
 * Night-side shading for the Day/Night layer: a translucent shell just above
 * the basemap (and typical terrain) that darkens everything facing away from
 * the Sun. The fragment shader derives day/night from the world-space normal
 * against the subsolar direction, with a smooth twilight band in between.
 *
 * FrontSide + depth-tested: markers and paths above the shell stay bright, and
 * the veil disappears by itself once the camera drops inside its radius
 * (street level), where whole-hlobe shading no longer makes sense.
 */
function createNightVeil(): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(GLOBE_RADIUS_UNITS + 0.12, 64, 48);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    uniforms: {
      uSunDirection: { value: new THREE.Vector3(1, 0, 0) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDirection;
      varying vec3 vWorldPosition;
      void main() {
        // 1 where the surface points at the Sun, -1 on the far side.
        float sun = dot(normalize(vWorldPosition), normalize(uSunDirection));
        // Soft twilight band straddling the terminator.
        float night = smoothstep(0.09, -0.14, sun);
        gl_FragColor = vec4(0.004, 0.016, 0.024, night * 0.58);
      }
    `,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "night-side-veil";
  mesh.renderOrder = 1;
  mesh.visible = false;
  return mesh;
}

function createTerrainMesh(grid: GlobalTerrainGrid, initialExaggeration: number): THREE.Mesh {
  const { longitudeSegments, latitudeSegments, heightsMeters } = grid;
  const columns = longitudeSegments + 1;
  const rows = latitudeSegments + 1;
  const positions = new Float32Array(columns * rows * 3);
  const colors = new Float32Array(columns * rows * 3);
  const indices = new Uint32Array(longitudeSegments * latitudeSegments * 6);
  const baseRadius = GLOBE_RADIUS_UNITS + 0.04;
  let vertex = 0;

  for (let row = 0; row < rows; row += 1) {
    const latitude = 90 - (row / latitudeSegments) * 180;
    const phi = (latitude * Math.PI) / 180;
    const cosLat = Math.cos(phi);
    const sinLat = Math.sin(phi);

    for (let column = 0; column < columns; column += 1) {
      const longitude = -180 + (column / longitudeSegments) * 360;
      const lambda = (longitude * Math.PI) / 180;
      const offset = vertex * 3;
      positions[offset] = baseRadius * cosLat * Math.sin(lambda);
      positions[offset + 1] = baseRadius * sinLat;
      positions[offset + 2] = baseRadius * cosLat * Math.cos(lambda);
      setTerrainVertexColor(colors, offset, heightsMeters[vertex]);
      vertex += 1;
    }
  }

  let indexOffset = 0;
  for (let row = 0; row < latitudeSegments; row += 1) {
    for (let column = 0; column < longitudeSegments; column += 1) {
      const northwest = row * columns + column;
      const northeast = northwest + 1;
      const southwest = northwest + columns;
      const southeast = southwest + 1;
      // The order is outward-facing for the globe's north-up coordinate system.
      indices[indexOffset++] = northwest;
      indices[indexOffset++] = southeast;
      indices[indexOffset++] = northeast;
      indices[indexOffset++] = northwest;
      indices[indexOffset++] = southwest;
      indices[indexOffset++] = southeast;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("elevationMeters", new THREE.BufferAttribute(heightsMeters, 1));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  const material = new THREE.MeshPhongMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.58,
    depthWrite: false,
    side: THREE.DoubleSide,
    shininess: 16,
    specular: new THREE.Color("#475569"),
  });
  material.userData.setTerrainExaggeration = (value: number) => {
    material.userData.currentExaggeration = value;
    const shader = material.userData.terrainShader as
      | { uniforms: Record<string, { value: number }> }
      | undefined;
    if (shader?.uniforms.uTerrainExaggeration) {
      shader.uniforms.uTerrainExaggeration.value = value;
    }
  };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTerrainExaggeration = {
      value: material.userData.currentExaggeration ?? initialExaggeration,
    };
    material.userData.terrainShader = shader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      "#include <common>\nattribute float elevationMeters;\nuniform float uTerrainExaggeration;"
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\ntransformed += normalize(transformed) * max(elevationMeters, 0.0) * 0.0000156958 * uTerrainExaggeration;"
    );
  };

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "terrarium-global-elevation";
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  mesh.userData.terrainBounds = { minMeters: grid.minMeters, maxMeters: grid.maxMeters };
  return mesh;
}

const TERRAIN_COLOR_STOPS = [
  { height: -11_000, color: new THREE.Color("#103b59") },
  { height: -4_500, color: new THREE.Color("#17647a") },
  { height: -300, color: new THREE.Color("#378d83") },
  { height: 700, color: new THREE.Color("#7caa71") },
  { height: 2_200, color: new THREE.Color("#c1b96f") },
  { height: 4_500, color: new THREE.Color("#c78759") },
  { height: 8_900, color: new THREE.Color("#f4eee0") },
];

function setTerrainVertexColor(colors: Float32Array, offset: number, elevationMeters: number): void {
  let lower = TERRAIN_COLOR_STOPS[0];
  let upper = TERRAIN_COLOR_STOPS[TERRAIN_COLOR_STOPS.length - 1];
  for (let index = 1; index < TERRAIN_COLOR_STOPS.length; index += 1) {
    if (elevationMeters <= TERRAIN_COLOR_STOPS[index].height) {
      lower = TERRAIN_COLOR_STOPS[index - 1];
      upper = TERRAIN_COLOR_STOPS[index];
      break;
    }
  }
  const span = Math.max(1, upper.height - lower.height);
  const t = Math.max(0, Math.min(1, (elevationMeters - lower.height) / span));
  colors[offset] = lower.color.r + (upper.color.r - lower.color.r) * t;
  colors[offset + 1] = lower.color.g + (upper.color.g - lower.color.g) * t;
  colors[offset + 2] = lower.color.b + (upper.color.b - lower.color.b) * t;
}

function setTerrainExaggeration(mesh: THREE.Mesh, value: number): void {
  const material = mesh.material as THREE.MeshPhongMaterial;
  const setter = material.userData.setTerrainExaggeration as ((scale: number) => void) | undefined;
  setter?.(value);
}

/** Relief surface opacity, 0–100: transparent overlay over the basemap or a solid DEM shell. */
function setTerrainOpacity(mesh: THREE.Mesh, opacityPercent: number): void {
  const material = mesh.material as THREE.MeshPhongMaterial;
  const opacity = Math.min(1, Math.max(0, opacityPercent / 100));
  material.opacity = opacity;
  material.transparent = opacity < 1;
  material.depthWrite = opacity >= 1;
  material.visible = opacity > 0.001;
}

function aimSunlight(light: THREE.DirectionalLight, date: Date): void {
  const sun = subsolarPoint(date);
  const latitude = (sun.lat * Math.PI) / 180;
  const longitude = (sun.lng * Math.PI) / 180;
  const radius = 600;
  light.position.set(
    radius * Math.cos(latitude) * Math.sin(longitude),
    radius * Math.sin(latitude),
    radius * Math.cos(latitude) * Math.cos(longitude)
  );
  light.target.position.set(0, 0, 0);
  light.target.updateMatrixWorld();
}

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
