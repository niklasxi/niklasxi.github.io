import { Vector2, Vector3 } from "three";
import { foldPoint } from "./creases";
import { ease } from "./waves";

export function createFoldPose(flat: Vector2[], centers: Vector2[]) {
  const points = flat.map((uv, i) => {
    const face = centers[i];
    return {
      uv,
      face,
      packet: foldPoint(new Vector3(), uv, face, 0.83),
      hull: foldPoint(new Vector3(), uv, face, 1),
      current: new Vector3(),
    };
  });
  const vertices = points.map((point) => point.current);
  return (amount: number) => {
    const angle = Math.PI * 0.5 * ease(0.83, 1, amount);
    const spread = 1 - Math.cos(angle),
      open = Math.sin(angle);
    for (const { uv, face, packet, hull, current } of points) {
      if (amount <= 0.83) foldPoint(current, uv, face, amount);
      else {
        // Open the pocket in depth before pulling its tips out. All panels
        // follow the same opening angle, so adjacent pleats cannot flip apart.
        current.set(
          packet.x + (hull.x - packet.x) * spread,
          packet.y + (hull.y - packet.y) * spread,
          packet.z + (hull.z - packet.z) * open,
        );
      }
    }
    return vertices;
  };
}
