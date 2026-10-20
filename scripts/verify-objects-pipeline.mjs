/**
 * Golden-model check for the 3D entity objects pipeline.
 *
 * Runs the real three-globe (the same version globe.gl links against)
 * headlessly — no DOM beyond a stubbed rAF, no WebGL — and asserts the exact
 * contract components/GlobeView.tsx and lib/entity-shapes.ts rely on:
 *
 *   - objectsData + objectThreeObject produce one group + mesh per datum
 *   - groups are positioned at polar2Cartesian(lat, lng, altitude)
 *   - objectRotation (degrees) is applied to the inner mesh
 *   - mesh.scale set at creation is left alone by the update path
 *   - every mesh shares the prototype geometry + shared material
 *   - clearing the data removes the objects, and three-globe's `deallocate`
 *     (which disposes geometries/materials) cannot destroy the shared
 *     prototypes thanks to the no-op dispose guard
 *   - re-adding data after a clear reuses the same prototypes
 *
 *   npm run verify:objects
 */

// three-globe touches window.* and bare requestAnimationFrame at import and
// construction time — stub enough for a scene-graph-only run.
globalThis.window = globalThis.window ?? {};
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.window.requestAnimationFrame = globalThis.requestAnimationFrame;
globalThis.window.cancelAnimationFrame = globalThis.cancelAnimationFrame;

const THREE = await import("three");
const { default: ThreeGlobe } = await import("three-globe");

let passed = 0;
let failed = 0;
function ok(condition, label, detail) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
  }
}
const near = (a, b, eps = 1e-6) => Number.isFinite(a) && Math.abs(a - b) <= eps;

const tick = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms));

console.log("\n🧊  objects pipeline (three-globe golden model)");

// Shared prototype + material, with the same disposal guard as entity-shapes.
const geometry = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshLambertMaterial({ vertexColors: true });
for (const shared of [geometry, material]) {
  Object.defineProperty(shared, "dispose", {
    value: () => {},
    configurable: true,
    writable: true,
  });
}

const globe = new ThreeGlobe();
const datums = [
  { lat: 10, lng: 20, altitude: 0.01, rotation: { x: 0, y: 0, z: -90 } },
  { lat: -30, lng: -140, altitude: 0.02, rotation: { x: 0, y: 0, z: 0 } },
  { lat: 45, lng: 100, altitude: 0.005, rotation: { x: 0, y: 0, z: 45 } },
];

globe
  .objectsData(datums)
  .objectLat("lat")
  .objectLng("lng")
  .objectAltitude("altitude")
  .objectRotation("rotation")
  .objectThreeObject((datum) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.scale.setScalar(0.5);
    return mesh;
  });
await tick();

const groups = [];
globe.traverse((object) => {
  if (object.__globeObjType === "object") groups.push(object);
});
ok(groups.length === datums.length, "one object group per datum", groups.length);

for (const group of groups) {
  const datum = group.__data;
  const mesh = group.children[0];
  const radius = 100 * (1 + datum.altitude);
  const phi = ((90 - datum.lat) * Math.PI) / 180;
  const theta = ((90 - datum.lng) * Math.PI) / 180;
  const expected = [
    radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  ];
  ok(
    near(group.position.x, expected[0], 0.01) &&
      near(group.position.y, expected[1], 0.01) &&
      near(group.position.z, expected[2], 0.01),
    `group placed at polar2Cartesian(${datum.lat}, ${datum.lng}, ${datum.altitude})`,
    group.position.toArray()
  );
  ok(
    near((mesh.rotation.z * 180) / Math.PI, datum.rotation.z, 1e-6),
    "objectRotation (degrees) applied to the inner mesh",
    (mesh.rotation.z * 180) / Math.PI
  );
  ok(near(mesh.scale.x, 0.5), "mesh scale survives the update path", mesh.scale.x);
  ok(mesh.geometry === geometry && mesh.material === material, "mesh shares prototype + material");
}

// Clearing: objects are removed, and the deallocate pass must not be able to
// destroy the shared prototypes (their dispose is neutralised).
globe.objectsData([]);
await tick();
let remaining = 0;
globe.traverse((object) => {
  if (object.__globeObjType === "object") remaining += 1;
});
ok(remaining === 0, "clearing objectsData removes every object", remaining);
ok(
  geometry.getAttribute("position") !== undefined && material.vertexColors === true,
  "shared prototype + material survive the teardown deallocate"
);

// Re-adding after a clear reuses the same prototypes.
globe.objectsData(datums);
await tick();
const reborn = [];
globe.traverse((object) => {
  if (object.__globeObjType === "object") reborn.push(object);
});
ok(reborn.length === datums.length, "re-adding data rebuilds the objects", reborn.length);
ok(
  reborn.every((group) => group.children[0].geometry === geometry),
  "rebuilt meshes reuse the shared prototype"
);

console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed} passed, ${failed} failed`);
// The stubbed rAF keeps timers alive — exit explicitly.
process.exit(failed === 0 ? 0 : 1);
