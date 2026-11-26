import * as T from "three";
import { sheetWidth, sheetHeight } from "./creases";
import { ease } from "./waves";

// All the creases meet at the nose. A fan from that point gives each
// independently rotating panel its own triangles and original page UVs.
export function createAirplaneFold() {
  const a = sheetWidth / 2,
    b = sheetHeight / 2;
  const nose = new T.Vector3(0, b, 0);
  const wing = 0.14;
  const vertices: T.Vector3[] = [];
  const sides: number[] = [];
  for (const side of [-1, 1]) {
    const rim = [
      0,
      wing,
      Math.atan(a / sheetHeight),
      Math.PI / 8,
      Math.PI / 4 - wing,
      Math.PI / 4,
      Math.PI / 4 + wing,
      (3 * Math.PI) / 8,
      Math.PI / 2 - wing,
      Math.PI / 2,
    ].map((angle) => {
      const length = Math.min(
        a / Math.sin(angle),
        sheetHeight / Math.cos(angle),
      );
      return new T.Vector3(
        side * length * Math.sin(angle),
        b - length * Math.cos(angle),
        0,
      );
    });
    for (let i = 1; i < rim.length; i++) {
      vertices.push(nose, rim[side > 0 ? i - 1 : i], rim[side > 0 ? i : i - 1]);
      sides.push(side, side, side);
    }
  }
  const geometry = new T.BufferGeometry();
  const position = new T.Float32BufferAttribute(vertices.length * 3, 3);
  geometry.setAttribute("position", position.setUsage(T.DynamicDrawUsage));
  geometry.setAttribute(
    "uv",
    new T.Float32BufferAttribute(
      vertices.flatMap((v) => [
        0.5 - v.y / sheetHeight,
        0.5 + v.x / sheetWidth,
      ]),
      2,
    ),
  );
  geometry.setAttribute(
    "bary",
    new T.Float32BufferAttribute(
      vertices.flatMap((_, i) => [
        +(i % 3 === 0),
        +(i % 3 === 1),
        +(i % 3 === 2),
      ]),
      3,
    ),
  );
  for (const [name, value] of [
    ["ink", 0.24],
    ["seam", 0.55],
  ] as const)
    geometry.setAttribute(
      name,
      new T.Float32BufferAttribute(
        vertices.map(() => value),
        1,
      ),
    );
  const p = new T.Vector3(),
    axis = new T.Vector3();
  let last = -1;
  function fold(amount: number) {
    if (amount === last) return;
    last = amount;
    vertices.forEach((v, i) => {
      const side = sides[i];
      p.copy(v).sub(nose);
      const angle = Math.atan2(Math.abs(p.x), -p.y);
      if (angle > Math.PI / 4)
        p.applyAxisAngle(
          axis.set(side, -1, 0).normalize(),
          side * 3.13 * ease(0, 0.33, amount),
        );
      const cornerAngle = Math.min(angle, Math.PI / 2 - angle);
      if (cornerAngle > Math.PI / 8)
        p.applyAxisAngle(
          axis.set(side * Math.sin(Math.PI / 8), -Math.cos(Math.PI / 8), 0),
          -side * 3.12 * ease(0.32, 0.63, amount),
        );
      if (Math.min(cornerAngle, Math.PI / 4 - cornerAngle) > wing)
        p.applyAxisAngle(
          axis.set(side * Math.sin(wing), -Math.cos(wing), 0),
          -side * 1.23 * ease(0.77, 1, amount),
        );
      p.applyAxisAngle(
        axis.set(0, -1, 0),
        side * 1.43 * ease(0.61, 0.85, amount),
      ).add(nose);
      position.setXYZ(i, p.x, p.y, p.z);
    });
    position.needsUpdate = true;
    geometry.computeBoundingSphere();
  }
  fold(0);
  return { geometry, fold };
}
