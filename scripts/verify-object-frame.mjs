import * as THREE from "three";

/**
 * Golden-model check for the 3D entity objects frame.
 *
 * three-globe's objects layer (objectFacesSurface, default on) positions each
 * entity group with Euler(−lat, lng, 0, 'YXZ') at polar2Cartesian(lat, lng,
 * alt). This script pins, against three-globe's own polar2Cartesian, that in
 * that local frame:
 *
 *   - +Z is the surface normal (up)
 *   - +Y is north and +X is east
 *   - a mesh rotation of z = −heading (degrees) points a +Y-nosed model along
 *     the compass heading (0 = north, 90 = east)
 *
 * lib/entity-shapes.ts builds every prototype in that frame and GlobeView maps
 * meta.Heading / meta.Course onto rotation.z — if you change either, re-run:
 *
 *   npm run verify:frame
 */

// three-globe's own conversion (dist source):
const GLOBE_RADIUS = 100;
function polar2Cartesian(lat, lng, relAltitude = 0) {
  const phi = (90 - lat) * Math.PI / 180;
  const theta = (90 - lng) * Math.PI / 180;
  const r = GLOBE_RADIUS * (1 + relAltitude);
  const phiSin = Math.sin(phi);
  return new THREE.Vector3(r * phiSin * Math.cos(theta), r * Math.cos(phi), r * phiSin * Math.sin(theta));
}
const deg2rad = (d) => (d * Math.PI) / 180;

let failures = 0;
function check(label, cond, detail) {
  console.log(`${cond ? "✓" : "✗"} ${label}${cond ? "" : " — " + JSON.stringify(detail)}`);
  if (!cond) failures++;
}

for (const [lat, lng] of [[0, 0], [24, 6], [-33.9, 151.2], [51.5, -0.1], [-45, 179], [80, -120]]) {
  // The objects-layer group, exactly as three-globe positions it:
  const group = new THREE.Group();
  group.position.copy(polar2Cartesian(lat, lng, 0.01));
  group.setRotationFromEuler(new THREE.Euler(deg2rad(-lat), deg2rad(lng), 0, "YXZ"));
  group.updateMatrixWorld(true);

  const up = new THREE.Vector3(0, 0, 1).applyMatrix4(new THREE.Matrix4().extractRotation(group.matrixWorld));
  const north = new THREE.Vector3(0, 1, 0).applyMatrix4(new THREE.Matrix4().extractRotation(group.matrixWorld));
  const east = new THREE.Vector3(1, 0, 0).applyMatrix4(new THREE.Matrix4().extractRotation(group.matrixWorld));

  // Ground truth at (lat,lng): up = normalised position; north = d/dlat; east = d/dlng
  const truthUp = polar2Cartesian(lat, lng).normalize();
  const northPt = polar2Cartesian(Math.min(89.99, lat + 0.01), lng).sub(polar2Cartesian(Math.max(-89.99, lat - 0.01), lng)).normalize();
  const eastPt = polar2Cartesian(lat, lng === 180 ? 179.99 : lng + 0.01).sub(polar2Cartesian(lat, lng === -180 ? -179.99 : lng - 0.01)).normalize();

  const ang = (a, b) => Math.acos(Math.max(-1, Math.min(1, a.normalize().dot(b.normalize())))) * 180 / Math.PI;
  check(`(${lat},${lng}) local +Z = surface normal`, ang(up, truthUp) < 1e-6, ang(up, truthUp));
  check(`(${lat},${lng}) local +Y = north`, ang(north, northPt) < 1e-4, ang(north, northPt));
  check(`(${lat},${lng}) local +X = east`, ang(east, eastPt) < 1e-4, ang(east, eastPt));

  // Heading check: mesh rotation z = -heading must send the nose (+Y) toward
  // the compass heading direction (north at 0, east at 90).
  const heading = 90; // east
  const mesh = new THREE.Object3D();
  mesh.rotation.set(0, 0, deg2rad(-heading), "XYZ"); // three-globe: setRotationFromEuler(deg values, XYZ)
  mesh.updateMatrixWorld(true);
  const noseLocal = new THREE.Vector3(0, 1, 0).applyMatrix4(mesh.matrixWorld);
  const noseWorld = noseLocal.applyMatrix4(new THREE.Matrix4().extractRotation(group.matrixWorld));
  check(`(${lat},${lng}) heading 90° → nose points east`, ang(noseWorld, eastPt) < 1e-4, ang(noseWorld, eastPt));

  const heading0 = new THREE.Vector3(0, 1, 0).applyMatrix4(new THREE.Matrix4().extractRotation(group.matrixWorld));
  check(`(${lat},${lng}) heading 0° → nose points north`, ang(heading0, northPt) < 1e-4, ang(heading0, northPt));
}

console.log(failures === 0 ? "FRAME CHECK PASSED" : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
