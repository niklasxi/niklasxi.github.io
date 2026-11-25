// Open the flattened second pocket directly into its sailing shape. Rotating
// each triangle supplies the target edge directions. Shared sheet vertices
// are relaxed together so neighbouring panels cannot separate at a crease.
import { Matrix4, Quaternion, Vector2, Vector3 } from "three";
import { foldPoint } from "./creases";
export function bakePocket(flat: Vector2[], centers: Vector2[]) {
  const lookup = new Map<string, number>(),
    ids: number[] = [];
  const first: Vector3[] = [],
    last: Vector3[] = [];
  flat.forEach((p, i) => {
    const key = Math.round(p.x * 1e6) + "," + Math.round(p.y * 1e6);
    let id = lookup.get(key);
    if (id === undefined) {
      id = first.length;
      lookup.set(key, id);
      first.push(foldPoint(new Vector3(), p, centers[i], 0.83));
      last.push(foldPoint(new Vector3(), p, centers[i], 1));
    }
    ids.push(id);
  });
  function basis(a: Vector3, b: Vector3, c: Vector3) {
    const x = b.clone().sub(a).normalize(),
      z = c.clone().sub(a).cross(x).normalize();
    return new Quaternion().setFromRotationMatrix(
      new Matrix4().makeBasis(x, z.clone().cross(x), z),
    );
  }
  const edges: { a: number; b: number; delta: Vector3; turn: Quaternion }[] =
    [];
  for (let i = 0; i < ids.length; i += 3) {
    const [a, b, c] = ids.slice(i, i + 3);
    if (new Set([a, b, c]).size < 3) continue;
    const turn = basis(last[a], last[b], last[c]).multiply(
      basis(first[a], first[b], first[c]).invert(),
    );
    for (const [u, v] of [
      [a, b],
      [b, c],
      [c, a],
    ])
      edges.push({ a: u, b: v, delta: first[v].clone().sub(first[u]), turn });
  }
  const frames: Vector3[][] = [];
  const error = new Vector3(),
    rotation = new Quaternion();
  for (let k = 0; k <= 32; k++) {
    const f = k / 32,
      pose = first.map((p, i) => p.clone().lerp(last[i], f));
    if (k > 0 && k < 32) {
      const targets = edges.map((e) =>
        e.delta.clone().applyQuaternion(rotation.identity().slerp(e.turn, f)),
      );
      const guides = pose.map((p) => p.clone());
      for (let j = 0; j < 48; j++) {
        edges.forEach((e, i) => {
          error
            .subVectors(pose[e.b], pose[e.a])
            .sub(targets[i])
            .multiplyScalar(0.2);
          pose[e.a].add(error);
          pose[e.b].sub(error);
        });
        pose.forEach((p, i) => p.lerp(guides[i], 0.045));
      }
    }
    // Match both end poses with zero residual displacement at the endpoints.
    const envelope = Math.min(1, f / 0.14, (1 - f) / 0.14);
    if (envelope < 1)
      pose.forEach((p, i) =>
        p.lerp(first[i].clone().lerp(last[i], f), 1 - envelope),
      );
    frames.push(pose);
  }
  return (p: Vector3, i: number, t: number) => {
    const frame = Math.min(32, Math.max(0, t * 32)),
      lo = Math.floor(frame);
    return p
      .copy(frames[lo][ids[i]])
      .lerp(frames[Math.min(32, lo + 1)][ids[i]], frame - lo);
  };
}
