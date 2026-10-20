/**
 * Golden-model check for the navigational joystick math.
 *
 * Mirrors the orientation + pan code in components/GlobeView.tsx
 * (applyCameraOrientation / panBy). If you change one, change the other —
 * this script pins the intended geometry so sign errors cannot sneak in:
 *
 *   - orientation(0,0) is bit-identical to the native OrbitControls view
 *   - stick up pans north, stick right pans east, distance is preserved
 *   - heading rotates the pan basis (heading 90 + stick up = east)
 *   - tilt leans the view toward the top-of-screen horizon (elevation = tilt - 90°)
 *   - panning follows the tilted screen-up, so stick up always flies forward
 *   - the camera never crosses the polar gimbal zone and stays on its sphere
 *   - mouse look (right / ctrl drag): drag right spins the world right,
 *     drag down pulls the horizon in, tilt clamps 0–80°, heading wraps,
 *     and the pan basis keeps following the rotated screen-up
 *
 *   node scripts/verify-nav-math.mjs
 */

import * as THREE from "three";

const ORIGIN = new THREE.Vector3(0, 0, 0);
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const MAX_LAT_DEG = 85;
const MAX_TILT_DEG = 80;

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
const near = (a, b, eps) => Number.isFinite(a) && Math.abs(a - b) <= eps;

/* ---- mirror of GlobeView.applyCameraOrientation ---- */
function applyOrientation(camera, tilt, heading) {
  const matrix = new THREE.Matrix4().lookAt(camera.position, ORIGIN, WORLD_UP);
  camera.quaternion.setFromRotationMatrix(matrix);
  if (heading !== 0) camera.rotateZ(-THREE.MathUtils.degToRad(heading));
  if (tilt !== 0) camera.rotateX(THREE.MathUtils.degToRad(tilt));
}

/* ---- mirror of GlobeView.panBy (screen-basis + great-circle step) ---- */
function panBy(camera, sx, sy, deltaRad) {
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  const normal = camera.position.clone().normalize();
  up.addScaledVector(normal, -up.dot(normal));
  if (up.lengthSq() < 1e-6) return false;
  up.normalize();
  const right = new THREE.Vector3().crossVectors(up, normal).normalize();
  const direction = right.clone().multiplyScalar(sx).addScaledVector(up, sy);
  const magnitude = direction.length();
  if (magnitude < 1e-6) return false;
  direction.multiplyScalar(1 / magnitude);

  const position = normal
    .clone()
    .multiplyScalar(Math.cos(deltaRad))
    .addScaledVector(direction, Math.sin(deltaRad));
  const maxY = Math.sin(THREE.MathUtils.degToRad(MAX_LAT_DEG));
  if (Math.abs(position.y) > maxY) {
    position.y = Math.sign(position.y) * maxY;
    position.normalize();
  }
  const distance = camera.position.length();
  camera.position.copy(position).multiplyScalar(distance);
  return true;
}

function cameraAt(lat, lng, distance = 240) {
  const phi = THREE.MathUtils.degToRad(lat);
  const lambda = THREE.MathUtils.degToRad(lng);
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(
    distance * Math.cos(phi) * Math.sin(lambda),
    distance * Math.sin(phi),
    distance * Math.cos(phi) * Math.cos(lambda)
  );
  return camera;
}

function latLngOf(camera) {
  const p = camera.position.clone().normalize();
  return {
    lat: THREE.MathUtils.radToDeg(Math.asin(p.y)),
    lng: THREE.MathUtils.radToDeg(Math.atan2(p.x, p.z)),
  };
}

/** Elevation of the view direction above the local tangent plane, degrees. */
function viewElevationDeg(camera) {
  const normal = camera.position.clone().normalize();
  const view = new THREE.Vector3();
  camera.getWorldDirection(view);
  return THREE.MathUtils.radToDeg(Math.asin(view.dot(normal)));
}

/* ---- tests ---- */

console.log("\n🧭  navigational math (golden model)");

// 1. Zero tilt/heading is exactly the native view.
const native = cameraAt(40, -8);
native.lookAt(ORIGIN);
const zero = cameraAt(40, -8);
applyOrientation(zero, 0, 0);
ok(native.quaternion.angleTo(zero.quaternion) < 1e-6, "orientation(0,0) equals the native lookAt view", native.quaternion.angleTo(zero.quaternion));

// 2. Stick up pans north; stick right pans east; distance preserved.
let cam = cameraAt(40, -8);
applyOrientation(cam, 0, 0);
const before = latLngOf(cam);
panBy(cam, 0, 1, THREE.MathUtils.degToRad(5));
const afterUp = latLngOf(cam);
ok(afterUp.lat > before.lat + 4 && near(afterUp.lng, before.lng, 0.5), "stick up pans north", { before, afterUp });
ok(near(cam.position.length(), 240, 1e-6), "pan preserves camera distance");

cam = cameraAt(40, -8);
applyOrientation(cam, 0, 0);
panBy(cam, 1, 0, THREE.MathUtils.degToRad(5));
const afterRight = latLngOf(cam);
ok(afterRight.lng > before.lng + 3, "stick right pans east", { before, afterRight });

// 3. Heading rotates the pan basis: heading 90° + stick up = east.
cam = cameraAt(40, -8);
applyOrientation(cam, 0, 90);
panBy(cam, 0, 1, THREE.MathUtils.degToRad(5));
const afterHeading = latLngOf(cam);
ok(afterHeading.lng > before.lng + 3 && near(afterHeading.lat, before.lat, 0.5), "heading 90° + stick up pans east", { before, afterHeading });

// 4. Heading −90° + stick up = west.
cam = cameraAt(40, -8);
applyOrientation(cam, 0, -90);
panBy(cam, 0, 1, THREE.MathUtils.degToRad(5));
const afterWest = latLngOf(cam);
ok(afterWest.lng < before.lng - 3, "heading -90° + stick up pans west", { before, afterWest });

// 5. Tilt leans the view toward the top-of-screen horizon.
cam = cameraAt(40, -8);
applyOrientation(cam, 45, 0);
ok(near(viewElevationDeg(cam), -45, 0.5), "tilt 45° → view 45° above nadir", viewElevationDeg(cam));
cam = cameraAt(40, -8);
applyOrientation(cam, 80, 0);
ok(near(viewElevationDeg(cam), -10, 0.5), "tilt 80° → view 10° above the horizon", viewElevationDeg(cam));

// 6. Tilted stick-up still flies forward (north at heading 0).
cam = cameraAt(40, -8);
applyOrientation(cam, 60, 0);
panBy(cam, 0, 1, THREE.MathUtils.degToRad(5));
const afterTilt = latLngOf(cam);
ok(afterTilt.lat > before.lat + 4, "tilt 60° + stick up still pans north (forward)", { before, afterTilt });

// 7. Heading + tilt compose: heading 180° + stick up pans south.
cam = cameraAt(40, -8);
applyOrientation(cam, 30, 180);
panBy(cam, 0, 1, THREE.MathUtils.degToRad(5));
const afterSouth = latLngOf(cam);
ok(afterSouth.lat < before.lat - 4, "heading 180° + stick up pans south", { before, afterSouth });

// 8. Polar clamp: repeated north panning stops at 85° and stays on the sphere.
cam = cameraAt(83, 20);
applyOrientation(cam, 0, 0);
for (let i = 0; i < 60; i += 1) panBy(cam, 0, 1, THREE.MathUtils.degToRad(2));
const polar = latLngOf(cam);
ok(polar.lat <= 85 + 1e-6, "latitude clamps at 85°", polar.lat);
ok(near(cam.position.length(), 240, 1e-6), "camera stays on its sphere after clamping");

// 9. Orientation is idempotent (safe to re-apply every frame).
cam = cameraAt(-15, 130);
applyOrientation(cam, 55, 137);
const once = cam.quaternion.clone();
applyOrientation(cam, 55, 137);
ok(once.angleTo(cam.quaternion) < 1e-6, "re-applying the same orientation is a no-op (no drift: it rebuilds from the base matrix)");

// 10. Degenerate pan basis near the pole is rejected, not NaN.
cam = cameraAt(89.99, 0);
applyOrientation(cam, 0, 0);
const moved = panBy(cam, 1, 0, THREE.MathUtils.degToRad(1));
ok(Number.isFinite(cam.position.x + cam.position.y + cam.position.z), "no NaN near the pole", moved);

/* ---- mirror of GlobeView mouse-look (right / ctrl drag) ---- */

const LOOK_HEADING_DEG_PER_PX = 0.3;
const LOOK_TILT_DEG_PER_PX = 0.25;

function lookDelta(heading, tilt, dxPx, dyPx) {
  return {
    heading: ((heading - dxPx * LOOK_HEADING_DEG_PER_PX + 540) % 360) - 180,
    tilt: Math.min(MAX_TILT_DEG, Math.max(0, tilt + dyPx * LOOK_TILT_DEG_PER_PX)),
  };
}

console.log("\n🖱  mouse look (right / ctrl drag)");

// 11. Grab feel: drag right spins the world right → heading falls.
let look = lookDelta(0, 0, 100, 0);
ok(look.heading < 0 && near(look.heading, -30, 1e-9), "drag right decreases heading (scene follows cursor)", look.heading);

// 12. Drag down pulls the horizon into view → tilt rises from nadir.
look = lookDelta(0, 0, 0, 100);
ok(look.tilt > 0 && near(look.tilt, 25, 1e-9), "drag down tilts toward the horizon", look.tilt);

// 13. Tilt clamps at both ends (nadir and the 80° horizon guard).
ok(lookDelta(0, 10, 0, -1000).tilt === 0, "tilt clamps at 0° (straight down)");
ok(lookDelta(0, 70, 0, 1000).tilt === MAX_TILT_DEG, "tilt clamps at the horizon guard (80°)");

// 14. Heading wraps at the antimeridian instead of running away.
look = lookDelta(170, 0, 200, 0); // 170 - 60 = 110 → no wrap needed yet
ok(near(look.heading, 110, 1e-9), "heading arithmetic is exact mid-range", look.heading);
look = lookDelta(-170, 0, 200, 0); // -170 - 60 = -230 → wraps to +130
ok(near(look.heading, 130, 1e-9), "heading wraps at ±180°", look.heading);

// 15. A look drag leaves tilt/heading usable by the pan basis: after a
// look-drag orientation, stick-up still pans along the rotated screen-up.
// (Bearing is measured against the local east/north tangent basis — raw
// lat/lng deltas would distort it by cos(latitude).)
cam = cameraAt(40, -8);
const looked = lookDelta(0, 0, 100, 200); // heading -30, tilt 50
applyOrientation(cam, looked.tilt, looked.heading);
{
  const sub = cam.position.clone().normalize();
  const phi = Math.asin(sub.y);
  const lambda = Math.atan2(sub.x, sub.z);
  const north = new THREE.Vector3(-Math.sin(phi) * Math.sin(lambda), Math.cos(phi), -Math.sin(phi) * Math.cos(lambda));
  const east = new THREE.Vector3(Math.cos(lambda), 0, -Math.sin(lambda));
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
  up.addScaledVector(sub, -up.dot(sub)).normalize();
  const screenUpBearing = THREE.MathUtils.radToDeg(Math.atan2(up.dot(east), up.dot(north)));
  ok(
    Math.abs(screenUpBearing - looked.heading) < 0.01,
    "after a look drag, stick-up pans along the rotated screen-up (bearing = heading)",
    { heading: looked.heading, screenUpBearing }
  );
}

console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed} passed, ${failed} failed`);
process.exitCode = failed === 0 ? 0 : 1;
