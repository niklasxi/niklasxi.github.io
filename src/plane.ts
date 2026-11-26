import * as T from "three";
import { sheetWidth as width, sheetHeight as height } from "./creases";
import { ease } from "./waves";

const a = width / 2;
const b = height / 2;
const wingAngle = Math.atan2(0.46, height);
const halfQuarter = Math.PI / 4;
const halfEighth = Math.PI / 8;
const keelAngle = (82 * Math.PI) / 180;
const wingOpenAngle = keelAngle - (4 * Math.PI) / 180;
const caliper = 0.0022;
const keelHingeZ = 6.5 * caliper;

function splitCreases() {
  let faces: T.Vector2[][] = [
    [
      new T.Vector2(-a, -b),
      new T.Vector2(a, -b),
      new T.Vector2(a, b),
      new T.Vector2(-a, b),
    ],
  ];
  const lines: [number, number, number][] = [[1, 0, 0]];
  const angles = [
    wingAngle,
    halfEighth,
    halfQuarter - wingAngle,
    halfQuarter,
    halfQuarter + wingAngle,
    3 * halfEighth,
  ];
  for (const s of [-1, 1]) {
    for (const theta of angles) {
      const nx = Math.cos(theta);
      const ny = -s * Math.sin(theta);
      const d = ny * -b;
      lines.push([nx, ny, d]);
    }
  }
  for (const [nx, ny, d] of lines) {
    faces = faces.flatMap((poly) => {
      const halves: T.Vector2[][] = [[], []];
      poly.forEach((p, i) => {
        const q = poly[(i + 1) % poly.length];
        const u = nx * p.x + ny * p.y - d;
        const v = nx * q.x + ny * q.y - d;
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

function sheetIndices(flat: T.Vector2[]) {
  const indices = flat.map((_, i) => i);
  const vertexKeys = flat.map(
    (p) => Math.round(p.x * 1e6) + "," + Math.round(p.y * 1e6),
  );
  const edges = new Map<string, [number, number]>();
  for (let face = 0; face < flat.length; face += 3) {
    for (let edge = 0; edge < 3; edge++) {
      const i0 = face + edge;
      const i1 = face + ((edge + 1) % 3);
      const reverse = vertexKeys[i1] + ":" + vertexKeys[i0];
      const neighbor = edges.get(reverse);
      if (neighbor) {
        const [c, d] = neighbor;
        indices.push(i1, i0, d, i1, d, c);
        edges.delete(reverse);
      } else {
        edges.set(vertexKeys[i0] + ":" + vertexKeys[i1], [i0, i1]);
      }
    }
  }
  return indices;
}

const axis45L = new T.Vector3(-Math.SQRT1_2, Math.SQRT1_2, 0);
const axis45R = new T.Vector3(Math.SQRT1_2, Math.SQRT1_2, 0);
const axis22L = new T.Vector3(-Math.sin(halfEighth), Math.cos(halfEighth), 0);
const axis22R = new T.Vector3(Math.sin(halfEighth), Math.cos(halfEighth), 0);
const yAxis = new T.Vector3(0, 1, 0);
const wingAxis = new T.Vector3();
const wingHingeOffset = new T.Vector3();

function turnAroundNose(
  out: T.Vector3,
  axis: T.Vector3,
  angle: number,
  pivotZ: number,
) {
  out.y += b;
  out.z -= pivotZ;
  out.applyAxisAngle(axis, angle);
  out.y -= b;
  out.z += pivotZ;
}

export function createPlane() {
  const flat: T.Vector2[] = [];
  const regions: { side: number; corner: boolean; nose: boolean; wing: boolean }[] = [];
  const uv: number[] = [];
  const bary: number[] = [];
  const ink: number[] = [];
  const seam: number[] = [];

  for (const face of splitCreases()) {
    const center = face
      .reduce((c, p) => c.add(p), new T.Vector2())
      .multiplyScalar(1 / 3);
    const theta0 = Math.atan2(Math.abs(center.x), Math.max(1e-6, center.y + b));
    const theta1 = theta0 > halfQuarter ? Math.PI / 2 - theta0 : theta0;
    const theta2 = theta1 > halfEighth ? halfQuarter - theta1 : theta1;
    const isWing = theta2 > wingAngle;
    const region = { side: center.x < 0 ? -1 : 1, corner: theta0 > halfQuarter, nose: theta1 > halfEighth, wing: isWing };
    face.forEach((p, i) => {
      flat.push(p);
      regions.push(region);
      uv.push(0.5 - p.y / height, 0.5 + p.x / width);
      bary.push(+(i === 0), +(i === 1), +(i === 2));
      // Keep the star-field print visible across the wings and fuselage.
      ink.push(isWing ? 0.86 : 0.65);
      seam.push(0.6);
    });
  }

  const geom = new T.BufferGeometry();
  const pos = new T.Float32BufferAttribute(
    flat.flatMap((p) => [p.x, p.y, 0]),
    3,
  );
  pos.setUsage(T.DynamicDrawUsage);
  geom.setAttribute("position", pos);
  geom.setIndex(sheetIndices(flat));
  geom.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  geom.setAttribute("bary", new T.Float32BufferAttribute(bary, 3));
  geom.setAttribute("ink", new T.Float32BufferAttribute(ink, 1));
  geom.setAttribute("seam", new T.Float32BufferAttribute(seam, 1));

  const out = new T.Vector3();
  let foldAmount = -1;
  const wingTips: { index: number; z: number; weight: number; side: number }[] = [];

  function apply() {
    const t1 = ease(0.0, 0.3, foldAmount);
    const t2 = ease(0.3, 0.62, foldAmount);
    const t3 = ease(0.62, 0.8, foldAmount);
    const nearWing = ease(0.74, 0.92, foldAmount);
    const farWing = ease(0.83, 1, foldAmount);

    for (let i = 0; i < flat.length; i++) {
      const p = flat[i];
      const region = regions[i];
      const s = region.side;
      out.set(p.x, p.y, 0);

      if (region.corner && t1 > 0) {
        turnAroundNose(
          out,
          s < 0 ? axis45L : axis45R,
          -s * Math.PI * t1,
          caliper,
        );
      }
      if (region.nose && t2 > 0) {
        turnAroundNose(
          out,
          s < 0 ? axis22L : axis22R,
          -s * Math.PI * t2,
          caliper * 3,
        );
      }
      const keelBend = -s * keelAngle * t3;
      if (t3 > 0) {
        // Bring the two printed faces together with the keel below the wings.
        out.z -= keelHingeZ;
        out.applyAxisAngle(yAxis, keelBend);
        out.z += keelHingeZ;
      }
      const t4 = s > 0 ? nearWing : farWing;
      if (region.wing && t4 > 0) {
        wingAxis
          .set(s * Math.sin(wingAngle), Math.cos(wingAngle), 0)
          .applyAxisAngle(yAxis, keelBend);
        // The wing hinge moves with the center fold, including the paper thickness.
        wingHingeOffset.set(0, 0, -keelHingeZ).applyAxisAngle(yAxis, keelBend);
        wingHingeOffset.z += keelHingeZ;
        out.sub(wingHingeOffset);
        turnAroundNose(out, wingAxis, s * wingOpenAngle * t4, 0);
        out.add(wingHingeOffset);
      }

      if (foldAmount === 1 && region.wing) {
        wingTips.push({ index: i, z: out.z, weight: (out.x / a) ** 2, side: s });
      }
      pos.setXYZ(i, out.x, out.y, out.z);
    }

    pos.needsUpdate = true;
  }

  return {
    geometry: geom,
    fold(amount: number) {
      if (amount === foldAmount) return;
      wingTips.length = 0;
      foldAmount = amount;
      apply();
    },
    flutter(amount: number, time: number) {
      if (!wingTips.length) return;
      const flex = (side: number) => amount * (0.11 * Math.sin(time * 2.9 + side * 0.4)
        + 0.055 * Math.sin(time * 5.1 - side * 1.1));
      const left = flex(-1), right = flex(1);
      for (const tip of wingTips) {
        pos.setZ(tip.index, tip.z + tip.weight * (tip.side < 0 ? left : right));
      }
      pos.needsUpdate = true;
    },
  };
}
