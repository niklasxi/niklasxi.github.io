import * as T from "three";
import { sheetHeight, sheetWidth } from "./creases";

// Two bending modes share a load but have different inertia. The exposed edge
// catches a gust first and the trailing edge rings briefly as the load changes.
export function createPaperSprings() {
  const bend = new T.Vector2();
  const speed = new T.Vector2();
  return {
    bend,
    reset() {
      bend.set(0, 0);
      speed.set(0, 0);
    },
    step(dt: number, leadingLoad: number, trailingLoad: number) {
      const steps = Math.ceil(dt * 120);
      for (let i = 0; i < steps; i++) {
        const h = dt / steps;
        speed.x += ((leadingLoad - bend.x) * 86 - speed.x * 8.4) * h;
        speed.y += ((trailingLoad - bend.y) * 48 - speed.y * 5.8) * h;
        bend.addScaledVector(speed, h);
      }
    },
  };
}

// Interpolate the existing rigid origami panels before bending them. The
// interpolated barycentric attribute keeps only the original crease lines.
export function createFlexiblePaper(base: T.BufferGeometry, divisions: number) {
  const geometry = new T.BufferGeometry();
  const corners: number[] = [];
  const weights: number[] = [];
  const indices: number[] = [];
  const faces = base.getIndex()!;
  for (let tri = 0; tri < faces.count; tri += 3) {
    for (let row = 0; row <= divisions; row++) {
      const cols = divisions - row;
      for (let col = 0; col <= cols; col++) {
        const v = corners.length / 3;
        corners.push(faces.getX(tri), faces.getX(tri + 1), faces.getX(tri + 2));
        weights.push(1 - (row + col) / divisions, col / divisions, row / divisions);
        if (col < cols) indices.push(v, v + 1, v + cols + 1);
        if (col + 1 < cols) indices.push(v + 1, v + cols + 2, v + cols + 1);
      }
    }
  }
  geometry.setIndex(indices);
  for (const [name, attribute] of Object.entries(base.attributes)) {
    const data = new Float32Array((corners.length / 3) * attribute.itemSize);
    for (let v = 0; v < data.length / attribute.itemSize; v++) {
      for (let c = 0; c < attribute.itemSize; c++) {
        for (let j = 0; j < 3; j++) {
          data[v * attribute.itemSize + c] +=
            attribute.getComponent(corners[v * 3 + j], c) * weights[v * 3 + j];
        }
      }
    }
    geometry.setAttribute(name, new T.BufferAttribute(data, attribute.itemSize));
  }
  const pos = geometry.getAttribute("position") as T.BufferAttribute;
  pos.setUsage(T.DynamicDrawUsage);
  const normals = new T.BufferAttribute(new Float32Array(pos.count * 3), 3);
  geometry.setAttribute("normal", normals.setUsage(T.DynamicDrawUsage));
  const original = base.getAttribute("position").array;
  const faceSize = (divisions + 1) * (divisions + 2) / 2;
  const faceNormal = new T.Vector3(), edge = new T.Vector3(), origin = new T.Vector3();
  const sourceIndex = Int32Array.from(corners, i => i * 3);

  return (bend: T.Vector2, strength: number, time = 0, wind = 0) => {
    if (strength <= 0.0001 && wind <= 0.0001) {
      return base;
    }
    // Smooth, low-frequency transverse cupping and gentle diagonal twist so the
    // whole sheet flexes like real paper without triangle aliasing or Z-fighting.
    const cupAmp = wind * (0.16 + 0.08 * Math.sin(time * 1.45 + 0.4));
    const crossTwist = wind * 0.14 * Math.sin(time * 1.25);
    const flutterPhase = 4.1 * time;
    for (let v = 0; v < pos.count; v++) {
      if (v % faceSize === 0) {
        const j = 3 * v;
        origin.fromArray(original, sourceIndex[j]);
        faceNormal.fromArray(original, sourceIndex[j + 1]).sub(origin);
        edge.fromArray(original, sourceIndex[j + 2]).sub(origin);
        faceNormal.cross(edge);
        const lenSq = faceNormal.lengthSq();
        if (lenSq > 1e-10) faceNormal.multiplyScalar(1 / Math.sqrt(lenSq));
        else faceNormal.set(0, 0, 1);
      }
      let x = 0, y = 0, z = 0;
      for (let j = 3 * v; j < 3 * v + 3; j++) {
        const i = sourceIndex[j], w = weights[j];
        x += w * original[i];
        y += w * original[i + 1];
        z += w * original[i + 2];
      }
      // Curl each longitudinal strip along a circular arc, preserving its
      // length. Different curvature across the width gives the sheet torsion.
      const side = T.MathUtils.clamp(0.5 + x / sheetWidth, 0, 1);
      const curvature = strength * T.MathUtils.lerp(bend.x, bend.y, side) / (sheetHeight / 2);
      const angle = curvature * y;
      const sn = Math.sin(angle), cs = Math.cos(angle);
      const arcY = Math.abs(angle) < 0.0001 ? y : sn / curvature;
      const arcZ = arcY * Math.tan(angle / 2);

      const nx = x / (sheetWidth * 0.5);
      const ny = y / (sheetHeight * 0.5);
      const rippleAngle = flutterPhase - ny * 3.4 + nx * 1.6;
      const ripple = 0.09 * wind * Math.sin(rippleAngle);
      const edgeLoad = nx * nx * ny * ny;
      const cup = cupAmp * (1 - nx * nx) + crossTwist * nx * ny + edgeLoad * ripple;
      pos.setXYZ(v, x, arcY - z * sn, arcZ + z * cs + cup);

      // Transform the panel normal by the bend and transverse cup slope, then normalize.
      const dk = strength * (bend.y - bend.x) / (sheetWidth * sheetHeight / 2);
      const dydk = Math.abs(angle) < 0.001 ? -y * y * angle / 3 : (y * cs - arcY) / curvature;
      const dzdk = Math.abs(angle) < 0.001 ? y * y / 2 : (y * sn - arcZ) / curvature;
      const nyN = faceNormal.y / Math.max(0.15, 1 - curvature * z);
      const bentY = nyN * cs - faceNormal.z * sn;
      const bentZ = nyN * sn + faceNormal.z * cs;
      const slope = 0.09 * wind * Math.cos(rippleAngle) * edgeLoad;
      const dzdx = (-2 * cupAmp * nx + crossTwist * ny + 2 * nx * ny * ny * ripple + 1.6 * slope) / (sheetWidth * 0.5);
      const dzdy = (crossTwist * nx + 2 * ny * nx * nx * ripple - 3.4 * slope) / (sheetHeight * 0.5);
      const outX = faceNormal.x - dk * ((dydk - z * y * cs) * bentY
        + (dzdk - z * y * sn) * bentZ) - dzdx * bentZ;
      const outY = bentY - dzdy * bentZ;
      const outZ = bentZ;
      const invLen = 1 / Math.max(0.0001, Math.hypot(outX, outY, outZ));
      normals.setXYZ(v, outX * invLen, outY * invLen, outZ * invLen);
    }
    pos.needsUpdate = normals.needsUpdate = true;
    geometry.boundingSphere = null;
    return geometry;
  };
}
