// Triangulate the sheet along its actual fold lines. Splitting before animation
// lets every face rotate rigidly, including the small triangles at the gunwales.
import { Vector2, Vector3 } from "three";
import { ease } from "./waves";

const a = 2.62,
  b = 3.52;
const keel = 1.86;
export const sheetWidth = 2 * a,
  sheetHeight = 2 * b;
export function creaseFaces() {
  let faces = [
    [
      new Vector2(-a, -b),
      new Vector2(a, -b),
      new Vector2(a, b),
      new Vector2(-a, b),
    ],
  ];
  for (const [nx, ny, d] of [
    [1, 0, 0],
    ...[keel, -keel, 2 * a - keel, keel - 2 * a].flatMap((k) => [
      [1, 0, k],
      [0, 1, k],
    ]),
    ...[a, -a, 3 * a, -3 * a].flatMap((k) => [
      [1, 1, k],
      [1, -1, k],
    ]),
    [0, 1, 0],
    [0, 1, a],
    [0, 1, -a],
    [1, 1, 0],
    [1, -1, 0],
    [1, 1, 2 * a],
    [1, -1, 2 * a],
    [-1, 1, 2 * a],
    [-1, -1, 2 * a],
  ]) {
    faces = faces.flatMap((poly) => {
      const halves: Vector2[][] = [[], []];
      poly.forEach((p, i) => {
        const q = poly[(i + 1) % poly.length],
          u = nx * p.x + ny * p.y - d,
          v = nx * q.x + ny * q.y - d;
        if (u >= -1e-8) halves[0].push(p);
        if (u <= 1e-8) halves[1].push(p);
        if (u * v < -1e-14) {
          const cut = p.clone().lerp(q, u / (u - v));
          halves.forEach((h) => h.push(cut));
        }
      });
      return halves.filter((h) => h.length >= 3);
    });
  }
  return faces.flatMap((p) =>
    p.slice(1, -1).map((v, i) => [p[0], v, p[i + 2]]),
  );
}
const axis = new Vector3();
const xAxis = new Vector3(1, 0, 0);
// Each hinge turns around the outside of the stack folded so far.
const caliper = 0.0015;
function turn(v: Vector3, axis: Vector3, angle: number, pivotZ: number) {
  v.z -= pivotZ;
  v.applyAxisAngle(axis, angle);
  v.z += pivotZ;
}
// A triangular pocket opens around four rigid right triangles. At a quarter
// turn its two ends meet, leaving the flattened diamond seen in the film.
function pocket(
  v: Vector3,
  x: number,
  depth: number,
  side: number,
  angle: number,
  thickness: number,
  clearance: number,
  wing: number,
) {
  const sn = Math.sin(angle),
    den = Math.sqrt(1 + sn * sn),
    edge = Math.abs(x),
    cs = Math.cos(angle);
  v.set(
    x * cs + wing * sn * (thickness * side + clearance * sn),
    -edge * den - (depth - edge) / den + (thickness * side * sn * cs) / den,
    (side * (depth - edge) * sn + thickness * cs) / den,
  );
}
export function foldPoint(out: Vector3, p: Vector2, face: Vector2, t: number) {
  const s = face.x < 0 ? -1 : 1,
    back = face.y > 0;
  const corner = Math.abs(face.x) > Math.abs(face.y),
    brim = Math.abs(face.y) > a;
  out.set(p.x, p.y, 0);
  if (back) turn(out, xAxis, Math.PI * ease(0, 0.18, t), caliper * 0.5);
  if (corner) {
    const angle =
      s * Math.PI * ease(s < 0 ? 0.19 : 0.23, s < 0 ? 0.32 : 0.36, t);
    turn(out, axis.set(s, -1, 0).normalize(), angle, caliper * 1.5);
  }
  if (brim) {
    const direction = back ? 1 : -1;
    out.y += a;
    turn(
      out,
      xAxis,
      direction * Math.PI * ease(0.36, 0.46, t),
      -direction * caliper * 3,
    );
    out.y -= a;
    if (Math.abs(face.x) + Math.abs(face.y) > 2 * a) {
      turn(
        out,
        axis.set(s, -1, 0).normalize(),
        s * direction * Math.PI * ease(0.46, 0.52, t),
        direction * caliper * 5,
      );
    }
  }
  if (t <= 0.52) return out;
  const x = out.x,
    d = -out.y,
    side = corner || !back ? 1 : -1;
  if (t < 1) {
    const q = Math.min(0.83, t);
    pocket(
      out,
      x,
      d,
      side,
      Math.PI * 0.5 * ease(0.52, 0.64, q),
      out.z,
      caliper * 10,
      s,
    );
    if (q > 0.64) {
      const mid = -a / Math.SQRT2;
      // Classify the entire flap in the flattened diamond's coordinates.
      const foldedY = brim ? 2 * a - Math.abs(face.y) : Math.abs(face.y);
      const belowCrease = Math.abs(face.x) + foldedY > a;
      if (belowCrease) {
        out.y -= mid;
        out.x -= s * caliper * 17;
        out.applyAxisAngle(
          axis.set(0, 0, 1),
          s * Math.PI * ease(0.64, 0.71, q),
        );
        out.y += mid;
        out.x += s * caliper * 17;
      }
      if (q > 0.71) {
        const u = out.z,
          v = -out.y;
        pocket(
          out,
          u,
          v,
          s,
          Math.PI * 0.5 * ease(0.71, 0.81, q),
          out.x,
          caliper * 31,
          side,
        );
        const swap = out.z;
        out.z = out.x;
        out.x = swap;
      }
    }
    return out;
  }
  // Open both layers of the packet around the central ridge. At x = ±d
  // their separation is zero, so the two gunwales share a bow and stern.
  const sideSign = back ? -1 : 1;
  const span = Math.max(0, d - Math.abs(x));
  const hull = Math.min(1, Math.max(0, (d - keel) / (a - keel)));
  const breadth = span / Math.max(0.0001, d);
  const height =
    d < keel ? keel - d : 0.66 * hull + 0.47 * hull * (1 - breadth);
  const halfBeam =
    d < keel ? (0.37 * span) / keel : breadth * (0.37 + 0.72 * hull);
  // The doubled corner flaps return through the interior; the original
  // centre crease remains joined even where the outer walls are far apart.
  const interior = corner
    ? Math.min(1, Math.abs(x) / Math.max(0.0001, d)) * 0.47
    : 1;
  const hemInset = brim ? 0.045 * Math.min(1, Math.abs(p.y) - a) : 0;
  return out.set(
    x,
    height + 0.08 - (corner ? 0.16 * hull * breadth : 0) + out.z * 0.3,
    sideSign * (halfBeam * interior * (1 - hemInset) + out.z * 0.7),
  );
}
