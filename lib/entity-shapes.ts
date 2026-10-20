import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Entity, EntityKind } from "@/types";

/* ------------------------------------------------------------------ *
 * Entity shapes — one merged, vertex-coloured prototype per kind
 * ------------------------------------------------------------------ */

/**
 * Every 3D entity on the globe renders from a single merged BufferGeometry
 * prototype per (kind, colour) pair, coloured through vertex colours and drawn
 * with one shared material. That keeps a sky full of aircraft at one draw call
 * per object while still giving each kind a recognisable silhouette:
 *
 *   aircraft / military  — swept-wing jet, nose north, heading-rotated
 *   vessel               — hull + superstructure, course-rotated
 *   satellite            — body + solar wings + dish, at real altitude
 *   iss                  — truss + paired arrays + modules
 *   radio                — lattice mast with crossbooms
 *   webcam               — camera body with a forward lens
 *   mapillary            — photo card with a capture-direction chevron
 *   fire                 — gradient flame cones
 *   volcano              — cratered cone with a lava neck
 *   storm                — flat spiral ribbon with a bright eye
 *   flood                — hex water disc with rooftops breaking the surface
 *   launch               — rocket with nose cone and fins
 *   site                 — block with a pyramid roof
 *   quake                — gradient octahedron (ripple rings stay in GlobeView)
 *
 * Prototypes are built in the objects-layer local frame used by three-globe
 * when `objectFacesSurface` is on: +Z is up (surface normal), +Y is north and
 * +X is east — so a model's nose points north and a heading is a rotation
 * about +Z.
 */

/** Shared by every entity mesh: vertex colours carry the per-kind palette. */
export const SHARED_OBJECT_MATERIAL = new THREE.MeshLambertMaterial({
  vertexColors: true,
  side: THREE.DoubleSide,
});

/**
 * three-globe's ThreeDigest `deallocate`s removed objects — geometry and
 * material included. The prototypes and material here are shared and must
 * outlive every data refresh, so disposal is neutralised. GPU buffers simply
 * stay resident, which is exactly what a shared-prototype cache wants.
 */
function protectFromDisposal(object: { dispose: () => unknown }): void {
  Object.defineProperty(object, "dispose", {
    value: () => {},
    configurable: true,
    writable: true,
  });
}

protectFromDisposal(SHARED_OBJECT_MATERIAL);

/** World-space size multiplier per kind at zoom factor 1 (globe radius = 100). */
export const OBJECT_BASE_SCALE: Record<EntityKind, number> = {
  iss: 0.9,
  aircraft: 0.5,
  military: 0.55,
  vessel: 0.45,
  satellite: 0.55,
  quake: 0.55,
  fire: 0.6,
  volcano: 0.7,
  storm: 0.85,
  flood: 0.75,
  webcam: 0.45,
  mapillary: 0.5,
  radio: 0.55,
  launch: 0.7,
  site: 0.5,
};

/* ---------------- colour helpers ---------------- */

const WHITE = new THREE.Color("#f8fafc");
const DARK = new THREE.Color("#0b1220");
const PANEL_BLUE = new THREE.Color("#1d4ed8");
const ENGINE_GRAY = new THREE.Color("#334155");
const LAVA = new THREE.Color("#f97316");
const FLAME_RED = new THREE.Color("#b91c1c");
const FLAME_YELLOW = new THREE.Color("#fde047");
const TRUSS_GRAY = new THREE.Color("#94a3b8");

function lighten(color: THREE.Color, amount: number): THREE.Color {
  return color.clone().lerp(WHITE, amount);
}

function darken(color: THREE.Color, amount: number): THREE.Color {
  return color.clone().lerp(DARK, amount);
}

type PaintSpec =
  | THREE.ColorRepresentation
  | ((x: number, y: number, z: number, out: THREE.Color) => void);

/** Attach a per-vertex `color` attribute (single colour or a gradient). */
function paint(geometry: THREE.BufferGeometry, spec: PaintSpec): THREE.BufferGeometry {
  const position = geometry.getAttribute("position");
  const count = position.count;
  const colors = new Float32Array(count * 3);
  const out = new THREE.Color();
  for (let index = 0; index < count; index += 1) {
    if (typeof spec === "function") {
      spec(position.getX(index), position.getY(index), position.getZ(index), out);
    } else {
      out.set(spec);
    }
    colors[index * 3] = out.r;
    colors[index * 3 + 1] = out.g;
    colors[index * 3 + 2] = out.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

/** Clamp helper shared by the gradient painters. */
function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * Merge painted parts into one geometry. `mergeGeometries` needs a uniform
 * index state, so indexed parts are flattened first; scratch parts are
 * disposed afterwards (only the merged result is ever uploaded to the GPU).
 */
function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = parts.map((part) => (part.index ? part.toNonIndexed() : part));
  const merged = mergeGeometries(flat, false);
  if (!merged) {
    throw new Error("entity-shapes: incompatible prototype geometries");
  }
  flat.forEach((part) => part.dispose());
  // Protect the shared result from three-globe's teardown `deallocate`.
  protectFromDisposal(merged);
  merged.computeBoundingSphere();
  return merged;
}

/** Stand a Y-axis primitive up along +Z (the surface normal). */
function upright(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  geometry.rotateX(Math.PI / 2);
  return geometry;
}

/* ---------------- per-kind builders ---------------- */

function buildAircraft(color: THREE.Color): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  const fuselage = new THREE.BoxGeometry(0.16, 1.0, 0.17);
  fuselage.translate(0, 0.02, 0.02);
  paint(fuselage, color);
  parts.push(fuselage);

  const nose = new THREE.ConeGeometry(0.085, 0.24, 6);
  nose.translate(0, 0.64, 0.02);
  paint(nose, lighten(color, 0.35));
  parts.push(nose);

  for (const side of [-1, 1]) {
    const wing = new THREE.BoxGeometry(0.68, 0.26, 0.05);
    wing.translate(side * 0.36, 0.05, 0);
    wing.rotateZ(-side * 0.34); // sweep the outer tip back
    paint(wing, darken(color, 0.18));
    parts.push(wing);

    const engine = new THREE.CylinderGeometry(0.05, 0.05, 0.16, 6);
    engine.translate(side * 0.2, 0.02, -0.1);
    paint(engine, ENGINE_GRAY);
    parts.push(engine);
  }

  const tailFin = new THREE.BoxGeometry(0.05, 0.3, 0.24);
  tailFin.translate(0, -0.4, 0.1);
  paint(tailFin, lighten(color, 0.2));
  parts.push(tailFin);

  const tailplane = new THREE.BoxGeometry(0.54, 0.18, 0.05);
  tailplane.translate(0, -0.44, 0);
  paint(tailplane, darken(color, 0.1));
  parts.push(tailplane);

  return merge(parts);
}

function buildVessel(color: THREE.Color): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  const hull = new THREE.BoxGeometry(0.24, 0.85, 0.13);
  hull.translate(0, -0.05, 0.03);
  paint(hull, color);
  parts.push(hull);

  const bow = new THREE.ConeGeometry(0.12, 0.32, 4);
  bow.rotateY(Math.PI / 4);
  bow.scale(1, 1, 0.72);
  bow.translate(0, 0.53, 0.03);
  paint(bow, lighten(color, 0.15));
  parts.push(bow);

  const deckhouse = new THREE.BoxGeometry(0.17, 0.34, 0.15);
  deckhouse.translate(0, -0.14, 0.12);
  paint(deckhouse, lighten(color, 0.3));
  parts.push(deckhouse);

  const bridge = new THREE.BoxGeometry(0.13, 0.12, 0.11);
  bridge.translate(0, -0.04, 0.22);
  paint(bridge, lighten(color, 0.55));
  parts.push(bridge);

  const funnel = new THREE.CylinderGeometry(0.035, 0.035, 0.14, 6);
  funnel.translate(0, -0.22, 0.25);
  paint(funnel, darken(color, 0.35));
  parts.push(funnel);

  return merge(parts);
}

function buildSatellite(color: THREE.Color): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  const body = new THREE.BoxGeometry(0.26, 0.2, 0.2);
  paint(body, color);
  parts.push(body);

  for (const side of [-1, 1]) {
    const panel = new THREE.BoxGeometry(0.55, 0.18, 0.02);
    panel.translate(side * 0.43, 0, 0);
    paint(panel, PANEL_BLUE);
    parts.push(panel);

    const hinge = new THREE.BoxGeometry(0.05, 0.06, 0.05);
    hinge.translate(side * 0.16, 0, 0);
    paint(hinge, lighten(color, 0.4));
    parts.push(hinge);
  }

  const dish = new THREE.CylinderGeometry(0.012, 0.09, 0.07, 8);
  upright(dish);
  dish.translate(0, 0, 0.13);
  paint(dish, lighten(color, 0.5));
  parts.push(dish);

  const mast = new THREE.CylinderGeometry(0.012, 0.012, 0.1, 5);
  upright(mast);
  mast.translate(0, 0, 0.1);
  paint(mast, darken(color, 0.2));
  parts.push(mast);

  return merge(parts);
}

function buildIss(color: THREE.Color): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  const truss = new THREE.BoxGeometry(1.15, 0.09, 0.09);
  paint(truss, TRUSS_GRAY);
  parts.push(truss);

  const module = new THREE.CylinderGeometry(0.055, 0.055, 0.52, 8);
  module.translate(0, 0, 0.05);
  paint(module, color);
  parts.push(module);

  const node = new THREE.SphereGeometry(0.07, 8, 6);
  node.translate(0, 0, 0.05);
  paint(node, lighten(color, 0.3));
  parts.push(node);

  for (const side of [-1, 1]) {
    for (const offset of [0.3, 0.53]) {
      const panel = new THREE.BoxGeometry(0.21, 0.5, 0.018);
      panel.translate(side * offset, 0, 0);
      paint(panel, PANEL_BLUE);
      parts.push(panel);
    }
  }

  const radiator = new THREE.BoxGeometry(0.3, 0.06, 0.22);
  radiator.translate(0, 0, -0.09);
  paint(radiator, darken(color, 0.25));
  parts.push(radiator);

  return merge(parts);
}

function buildRadio(color: THREE.Color): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  const mast = new THREE.CylinderGeometry(0.024, 0.07, 0.95, 5);
  upright(mast);
  mast.translate(0, 0, 0.45);
  paint(mast, color);
  parts.push(mast);

  for (const [height, angle] of [
    [0.58, 0],
    [0.72, Math.PI / 2],
  ] as const) {
    const boom = new THREE.BoxGeometry(0.44, 0.03, 0.03);
    boom.rotateZ(angle);
    boom.translate(0, 0, height);
    paint(boom, darken(color, 0.15));
    parts.push(boom);
  }

  const tip = new THREE.SphereGeometry(0.05, 6, 5);
  tip.translate(0, 0, 0.95);
  paint(tip, lighten(color, 0.55));
  parts.push(tip);

  const base = new THREE.BoxGeometry(0.16, 0.16, 0.08);
  base.translate(0, 0, 0.04);
  paint(base, darken(color, 0.4));
  parts.push(base);

  return merge(parts);
}

function buildWebcam(color: THREE.Color): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  const body = new THREE.BoxGeometry(0.3, 0.36, 0.22);
  body.translate(0, 0, 0.15);
  paint(body, color);
  parts.push(body);

  const lens = new THREE.CylinderGeometry(0.018, 0.075, 0.16, 8);
  lens.translate(0, 0.26, 0.15);
  paint(lens, DARK);
  parts.push(lens);

  const hood = new THREE.ConeGeometry(0.09, 0.08, 8);
  hood.rotateX(-Math.PI / 2);
  hood.translate(0, 0.2, 0.15);
  paint(hood, darken(color, 0.25));
  parts.push(hood);

  const mount = new THREE.BoxGeometry(0.1, 0.1, 0.12);
  mount.translate(0, 0, 0.03);
  paint(mount, darken(color, 0.45));
  parts.push(mount);

  return merge(parts);
}

function buildMapillary(color: THREE.Color): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  const card = new THREE.BoxGeometry(0.52, 0.5, 0.045);
  card.translate(0, 0, 0.11);
  paint(card, color);
  parts.push(card);

  const gloss = new THREE.BoxGeometry(0.44, 0.42, 0.012);
  gloss.translate(0, 0, 0.14);
  paint(gloss, lighten(color, 0.45));
  parts.push(gloss);

  const chevron = new THREE.BoxGeometry(0.1, 0.14, 0.06);
  chevron.translate(0, 0.31, 0.12);
  paint(chevron, lighten(color, 0.75));
  parts.push(chevron);

  const stem = new THREE.CylinderGeometry(0.02, 0.02, 0.09, 5);
  upright(stem);
  stem.translate(0, 0, 0.04);
  paint(stem, darken(color, 0.4));
  parts.push(stem);

  return merge(parts);
}

function buildFire(_color: THREE.Color): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  const flame = new THREE.ConeGeometry(0.17, 0.55, 6);
  upright(flame);
  flame.translate(0, 0, 0.28);
  paint(flame, (x, y, z, out) => {
    out.copy(FLAME_RED).lerp(FLAME_YELLOW, clamp01(z / 0.55));
  });
  parts.push(flame);

  const inner = new THREE.ConeGeometry(0.09, 0.34, 5);
  upright(inner);
  inner.translate(0, 0, 0.18);
  paint(inner, (x, y, z, out) => {
    out.copy(FLAME_YELLOW).lerp(WHITE, clamp01(z / 0.35) * 0.7);
  });
  parts.push(inner);

  const ember = new THREE.SphereGeometry(0.09, 6, 4);
  ember.translate(0, 0, 0.02);
  paint(ember, FLAME_RED);
  parts.push(ember);

  return merge(parts);
}

function buildVolcano(color: THREE.Color): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  const cone = new THREE.CylinderGeometry(0.13, 0.5, 0.45, 7);
  upright(cone);
  cone.translate(0, 0, 0.225);
  paint(cone, darken(color, 0.45));
  parts.push(cone);

  const lava = new THREE.CylinderGeometry(0.1, 0.13, 0.07, 7);
  upright(lava);
  lava.translate(0, 0, 0.46);
  paint(lava, LAVA);
  parts.push(lava);

  return merge(parts);
}

function buildStorm(color: THREE.Color): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Flat Archimedean-spiral ribbon facing up: the cyclone signature seen from
  // orbit. Built directly as an indexed triangle strip with a brightness fade.
  const segments = 96;
  const turns = 2.4;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const scratch = new THREE.Color();

  for (let index = 0; index <= segments; index += 1) {
    const t = index / segments;
    const theta = t * turns * Math.PI * 2;
    const radius = 0.1 + 0.4 * t;
    const width = 0.02 + 0.15 * (1 - 0.8 * t);
    const cx = Math.cos(theta) * radius;
    const cy = Math.sin(theta) * radius;
    const nx = Math.cos(theta);
    const ny = Math.sin(theta);
    const half = width / 2;
    positions.push(cx + nx * half, cy + ny * half, 0.03, cx - nx * half, cy - ny * half, 0.03);
    normals.push(0, 0, 1, 0, 0, 1);
    uvs.push(t, 1, t, 0);
    scratch.copy(color).multiplyScalar(0.3 + 0.7 * (1 - 0.75 * t));
    colors.push(scratch.r, scratch.g, scratch.b, scratch.r, scratch.g, scratch.b);
  }
  for (let index = 0; index < segments; index += 1) {
    const a = index * 2;
    const b = index * 2 + 1;
    const c = index * 2 + 2;
    const d = index * 2 + 3;
    indices.push(a, b, c, b, d, c);
  }

  const spiral = new THREE.BufferGeometry();
  spiral.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  spiral.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  spiral.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  spiral.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  spiral.setIndex(indices);
  spiral.computeVertexNormals();
  parts.push(spiral);

  const eye = new THREE.CylinderGeometry(0.07, 0.07, 0.05, 8);
  upright(eye);
  eye.translate(0, 0, 0.02);
  paint(eye, lighten(color, 0.5));
  parts.push(eye);

  return merge(parts);
}

function buildFlood(color: THREE.Color): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  const water = new THREE.CylinderGeometry(0.45, 0.45, 0.05, 6);
  upright(water);
  water.translate(0, 0, 0.025);
  paint(water, (x, y, _z, out) => {
    const radial = clamp01(Math.sqrt(x * x + y * y) / 0.45);
    out.copy(lighten(color, 0.4)).lerp(color, radial);
  });
  parts.push(water);

  // Rooftops breaking the surface — the classic flood-extent read.
  for (const [x, y] of [
    [0.12, 0.08],
    [-0.15, -0.06],
    [0.02, -0.18],
  ] as const) {
    const roof = new THREE.BoxGeometry(0.09, 0.09, 0.09);
    roof.translate(x, y, 0.09);
    paint(roof, darken(color, 0.55));
    parts.push(roof);
  }

  return merge(parts);
}

function buildLaunch(color: THREE.Color): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  const body = new THREE.CylinderGeometry(0.085, 0.105, 0.55, 7);
  upright(body);
  body.translate(0, 0, 0.32);
  paint(body, lighten(color, 0.55));
  parts.push(body);

  const stripe = new THREE.CylinderGeometry(0.088, 0.088, 0.09, 7);
  upright(stripe);
  stripe.translate(0, 0, 0.47);
  paint(stripe, color);
  parts.push(stripe);

  const nose = new THREE.ConeGeometry(0.085, 0.22, 7);
  upright(nose);
  nose.translate(0, 0, 0.7);
  paint(nose, darken(color, 0.15));
  parts.push(nose);

  for (let index = 0; index < 4; index += 1) {
    const fin = new THREE.BoxGeometry(0.17, 0.025, 0.24);
    fin.translate(0.15, 0, 0.13);
    fin.rotateZ((index * Math.PI) / 2);
    paint(fin, color);
    parts.push(fin);
  }

  const nozzle = new THREE.CylinderGeometry(0.05, 0.07, 0.09, 7);
  upright(nozzle);
  nozzle.translate(0, 0, 0.02);
  paint(nozzle, DARK);
  parts.push(nozzle);

  return merge(parts);
}

function buildSite(color: THREE.Color): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  const block = new THREE.BoxGeometry(0.42, 0.42, 0.22);
  block.translate(0, 0, 0.11);
  paint(block, color);
  parts.push(block);

  const roof = new THREE.ConeGeometry(0.32, 0.2, 4);
  upright(roof);
  roof.rotateZ(Math.PI / 4);
  roof.translate(0, 0, 0.32);
  paint(roof, lighten(color, 0.35));
  parts.push(roof);

  return merge(parts);
}

function buildQuake(color: THREE.Color): THREE.BufferGeometry {
  const octahedron = new THREE.OctahedronGeometry(0.32);
  octahedron.translate(0, 0, 0.3);
  paint(octahedron, (_x, _y, z, out) => {
    out.copy(darken(color, 0.55)).lerp(lighten(color, 0.4), clamp01(z / 0.62));
  });
  return merge([octahedron]);
}

const BUILDERS: Record<EntityKind, (color: THREE.Color) => THREE.BufferGeometry> = {
  iss: buildIss,
  aircraft: buildAircraft,
  military: buildAircraft,
  vessel: buildVessel,
  satellite: buildSatellite,
  quake: buildQuake,
  fire: buildFire,
  volcano: buildVolcano,
  storm: buildStorm,
  flood: buildFlood,
  webcam: buildWebcam,
  mapillary: buildMapillary,
  radio: buildRadio,
  launch: buildLaunch,
  site: buildSite,
};

/* ---------------- prototype cache ---------------- */

const PROTOTYPES = new Map<string, THREE.BufferGeometry>();

/**
 * The merged prototype for a (kind, colour) pair. The same geometry instance
 * backs every mesh of that pair — do not mutate or dispose it.
 */
export function prototypeFor(kind: EntityKind, color: string): THREE.BufferGeometry {
  const key = `${kind}|${color}`;
  let prototype = PROTOTYPES.get(key);
  if (!prototype) {
    prototype = BUILDERS[kind](new THREE.Color(color));
    PROTOTYPES.set(key, prototype);
  }
  return prototype;
}

/** Number of cached prototypes (tests + diagnostics). */
export function prototypeCacheSize(): number {
  return PROTOTYPES.size;
}

/**
 * Compass heading for an entity, in degrees clockwise from north, from the
 * feed metadata (aircraft `Heading`, vessel `Course`, Mapillary compass).
 * Returns null for entities without a meaningful heading.
 */
export function headingDegrees(entity: Entity): number | null {
  const raw = entity.kind === "vessel" ? entity.meta?.Course : entity.meta?.Heading;
  if (raw === null || raw === undefined) return null;
  const value = typeof raw === "number" ? raw : Number.parseFloat(String(raw));
  if (!Number.isFinite(value)) return null;
  return ((value % 360) + 360) % 360;
}
