import * as T from "three";
import { ease } from "./waves";

// Stock position and the original shader attributes travel together through
// every cut. Interpolating the old barycentrics preserves the printed creases.
type Vertex = number[];
const stripAt = (v: Vertex) => v[0] + 0.085 * v[1];
const lengthAt = (v: Vertex) => v[1];

function splitPolygon(poly: Vertex[], coordinate: (v: Vertex) => number, at: number) {
  const near: Vertex[] = [], far: Vertex[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const da = coordinate(a) - at, db = coordinate(b) - at;
    if (da <= 0) near.push(a);
    if (da >= 0) far.push(a);
    if (da * db < 0) {
      const weight = da / (da - db);
      const cut = a.map((value, k) => T.MathUtils.lerp(value, b[k], weight));
      near.push(cut);
      far.push(cut);
    }
  }
  return [near, far];
}

export function createTearingPlane(folded: T.BufferGeometry, material: T.ShaderMaterial) {
  const pos = folded.getAttribute("position"), uv = folded.getAttribute("uv");
  const bary = folded.getAttribute("bary");
  const ink = folded.getAttribute("ink"), seam = folded.getAttribute("seam");
  const vertices = Array.from({length: pos.count}, (_, i) => [
    pos.getX(i), pos.getY(i), pos.getZ(i), uv.getX(i), uv.getY(i),
    bary.getX(i), bary.getY(i), bary.getZ(i), ink.getX(i), seam.getX(i),
  ]);

  const left = Math.min(...vertices.map(stripAt)), right = Math.max(...vertices.map(stripAt));
  const nose = Math.min(...vertices.map(lengthAt)), tail = Math.max(...vertices.map(lengthAt));
  const strips = 10, width = (right - left) / strips;
  const rest: number[] = [], uvs: number[] = [], creases: number[] = [];
  const inks: number[] = [], seams: number[] = [], stripIds: number[] = [], indices: number[] = [];
  function addFace(poly: Vertex[], strip: number) {
    const start = stripIds.length;
    for (const [x, y, z, u, v, b0, b1, b2, density, crease] of poly) {
      rest.push(x, y, z);
      uvs.push(u, v);
      creases.push(b0, b1, b2);
      inks.push(density);
      seams.push(crease);
      stripIds.push(strip);
    }
    for (let j = 1; j + 1 < poly.length; j++) indices.push(start, start + j, start + j + 1);
  }

  const source = folded.index;
  const count = source ? source.count : pos.count;
  for (let i = 0; i < count; i += 3) {
    let remaining = [0, 1, 2].map(j => vertices[source ? source.getX(i + j) : i + j]);
    for (let s = 0; s < strips && remaining.length >= 3; s++) {
      let ribbon: Vertex[];
      [ribbon, remaining] = splitPolygon(remaining, stripAt, left + (s + 1) * width + (s === strips - 1 ? 1e-5 : 0));
      if (ribbon.length < 3) continue;
      // Give each ribbon enough sections to curl its free edge while the
      // rest of the same strip is still joined to the wing.
      for (let row = 1; row < 14 && ribbon.length >= 3; row++) {
        let section: Vertex[];
        [section, ribbon] = splitPolygon(ribbon, lengthAt, nose + (tail - nose) * row / 14);
        if (section.length >= 3) addFace(section, s);
      }
      if (ribbon.length >= 3) addFace(ribbon, s);
    }
  }

  const geometry = new T.BufferGeometry();
  const moving = new T.Float32BufferAttribute(rest, 3).setUsage(T.DynamicDrawUsage);
  geometry.setIndex(indices);
  geometry.setAttribute("position", moving);
  geometry.setAttribute("uv", new T.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("bary", new T.Float32BufferAttribute(creases, 3));
  geometry.setAttribute("ink", new T.Float32BufferAttribute(inks, 1));
  geometry.setAttribute("seam", new T.Float32BufferAttribute(seams, 1));
  const mesh = new T.Mesh(geometry, material);
  mesh.name = "Tearing paper airplane";
  mesh.frustumCulled = false;
  const inward = new T.Vector3(), tangent = new T.Vector3(), normal = new T.Vector3();
  const delays = stripIds.map((s, i) => {
    const fromTrailingEdge = (tail - rest[i * 3 + 1]) / (tail - nose);
    return 0.18 + 0.30 * (1 - s / (strips - 1)) + 0.08 * fromTrailingEdge;
  });

  function update(progress: number, targetLocal: T.Vector3, reduced: boolean) {
    mesh.visible = progress < 1;
    if (!mesh.visible) return;
    inward.copy(targetLocal).normalize();
    tangent.set(-inward.y, inward.x, 0);
    if (tangent.lengthSq() < 0.001) tangent.set(1, 0, 0);
    tangent.normalize();
    normal.crossVectors(inward, tangent).normalize();
    const buckle = ease(0.06, 0.22, progress) * (reduced ? 0.60 : 1.13);
    const tremble = reduced ? 0 : ease(0.01, 0.08, progress) * (1 - ease(0.14, 0.30, progress));
    const bow = T.MathUtils.clamp(0.14 * targetLocal.length(), 0.8, 2.6) * (reduced ? 0.32 : 1);
    for (let i = 0; i < stripIds.length; i++) {
      const x = rest[3 * i], y = rest[3 * i + 1], z = rest[3 * i + 2];
      const band = stripIds[i], phase = 1.85 * band;
      const hinge = Math.max(0, x - 0.13);
      const bend = buckle * (0.68 + 0.32 * (y - nose) / (tail - nose));
      const bx = x + hinge * (Math.cos(bend) - 1);
      const bz = z + hinge * Math.sin(bend)
        + tremble * (0.05 + 0.055 * Math.abs(x)) * Math.sin(125 * progress + 0.7 * y + x);
      const peel = T.MathUtils.clamp((progress - delays[i]) / 0.31, 0, 1);
      const travel = ease(0.06, 0.82, peel);
      const across = x + 0.085 * y - (left + (band + 0.5) * width);
      const twist = (reduced ? 1.3 : 3.5) * ease(0, 0.78, peel) * Math.sin(phase + 0.54 * y);
      const curlX = across * (Math.cos(twist) - 1);
      const curlZ = across * Math.sin(twist) + 0.49 * Math.sin(Math.PI * peel);
      const arc = Math.sin(Math.PI * travel) * bow;
      const angle = phase * 0.37 + travel * (reduced ? 0.7 : 2.55);
      const side = arc * Math.cos(angle), lift = arc * Math.sin(angle);
      moving.setXYZ(i,
        T.MathUtils.lerp(bx + curlX, targetLocal.x, travel) + tangent.x * side + normal.x * lift,
        T.MathUtils.lerp(y, targetLocal.y, travel) + tangent.y * side + normal.y * lift,
        T.MathUtils.lerp(bz + curlZ, targetLocal.z, travel) + tangent.z * side + normal.z * lift,
      );
    }
    moving.needsUpdate = true;
  }

  return { mesh, update, dispose: () => geometry.dispose() };
}
