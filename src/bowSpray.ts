import * as T from "three";
import { createSeaMist } from "./seaMist";
import { wave } from "./waves";

export function createBowSpray(scene: T.Scene) {
  const seaMist = createSeaMist(scene);
  const pool = Array.from({ length: 96 }, () => ({
    position: new T.Vector3(),
    velocity: new T.Vector3(),
    age: Infinity,
    lifetime: 0,
    size: 0,
  }));
  const mesh = new T.InstancedMesh(
    new T.SphereGeometry(1, 6, 4),
    new T.MeshPhongMaterial({
      color: 0xc1d0c8,
      specular: 0xffe9bd,
      shininess: 105,
      transparent: true,
      opacity: 0.76,
      depthWrite: false,
    }),
    pool.length,
  );
  mesh.name = "Bow spray";
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
  scene.add(mesh);
  let next = 0,
    pending = 0;
  const transform = new T.Object3D(),
    contact = new T.Vector3(),
    up = new T.Vector3(0, 1, 0),
    direction = new T.Vector3();
  return (
    dt: number,
    time: number,
    boat: T.Object3D,
    follow: number,
    swell: number,
    reduced: boolean,
  ) => {
    mesh.visible = follow > 0.01;
    if (!mesh.visible) return;
    contact.set(-1.55, 0.14, 0);
    boat.localToWorld(contact);
    const crest = wave(contact.x, contact.z, time, swell);
    // Water rising against the angled bow throws a wider fan on the next crest.
    const encounter = T.MathUtils.clamp((crest - contact.y + 0.1) * 2.8, 0, 1);
    seaMist(dt, time, boat, follow, swell, encounter, reduced);
    pending += dt * follow * (8 + 80 * encounter) * (reduced ? 0.32 : 1);
    while (pending >= 1) {
      pending--;
      const drop = pool[next];
      next = (next + 1) % pool.length;
      const side = Math.random() < 0.5 ? -1 : 1,
        spread = Math.random();
      const x = -1.65 + Math.random() * 0.92;
      drop.position.set(x, 0.12, side * (0.26 + 0.54 * (x + 1.65)));
      boat.localToWorld(drop.position);
      drop.position.y =
        wave(drop.position.x, drop.position.z, time, swell) + 0.027;
      drop.velocity
        .set(
          0.4 + 0.68 * spread,
          1.0 + (0.7 + encounter) * Math.random(),
          side * (0.63 + spread * 0.93),
        )
        .applyQuaternion(boat.quaternion);
      drop.age = 0;
      drop.lifetime = 0.34 + spread * 0.33;
      drop.size = 0.011 + Math.random() * 0.024;
    }
    let count = 0;
    for (const drop of pool) {
      if (drop.age >= drop.lifetime) continue;
      drop.age += dt;
      drop.velocity.y -= 6.4 * dt;
      drop.position.addScaledVector(drop.velocity, dt);
      if (
        drop.position.y <
        wave(drop.position.x, drop.position.z, time, swell) - 0.018
      ) {
        drop.age = Infinity;
        continue;
      }
      const radius =
        drop.size *
        (1 - T.MathUtils.smoothstep(drop.age / drop.lifetime, 0.55, 1));
      transform.position.copy(drop.position);
      const speed = drop.velocity.length();
      transform.quaternion.setFromUnitVectors(
        up,
        direction.copy(drop.velocity).normalize(),
      );
      transform.scale.set(
        radius,
        (1 + Math.min(speed * 0.34, 1.45)) * radius,
        radius,
      );
      transform.updateMatrix();
      mesh.setMatrixAt(count++, transform.matrix);
    }
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
  };
}
