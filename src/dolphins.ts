import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import dolphinUrl from "./assets/dolphin.glb?url";
import { wave } from "./waves";

export async function createDolphins(scene: T.Scene) {
  const gltf = await new GLTFLoader().loadAsync(dolphinUrl);
  const source = gltf.scene.getObjectByProperty("isMesh", true) as T.Mesh<
    T.BufferGeometry,
    T.MeshBasicMaterial
  >;
  const geometry = source.geometry;
  // The source has a raised beak and downturned flukes. Level its spine
  // on the flight axis while keeping the original sculpt and texture.
  geometry.applyMatrix4(
    new T.Matrix4().makeBasis(
      new T.Vector3(0, 0, -1),
      new T.Vector3(-1, 0, 0),
      new T.Vector3(0, 1, 0),
    ),
  );
  geometry.rotateZ(-0.42);
  geometry.scale(2.6, 2.6, 2.6);
  geometry.center();
  const positions = geometry.getAttribute("position");
  const tailStroke = new T.Float32BufferAttribute(
    new Float32Array(positions.count * 3),
    3,
  );
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    tailStroke.setXYZ(
      i,
      x,
      positions.getY(i) + 0.25 * T.MathUtils.smoothstep(-x, 0.25, 1.35),
      positions.getZ(i),
    );
  }
  geometry.morphAttributes.position = [tailStroke];
  const material = new T.MeshPhongMaterial({
    map: source.material.map,
    color: 0xb6c7ca,
    specular: 0x718788,
    shininess: 46,
  });
  const pod = Array.from({ length: 3 }, (_, i) => {
    const mesh = new T.Mesh(geometry, material);
    mesh.name = "Breaching dolphin " + (i + 1);
    mesh.layers.enable(1);
    mesh.visible = false;
    mesh.scale.setScalar([1.05, 0.89, 0.98][i]);
    scene.add(mesh);
    return { mesh, originX: 0, originZ: 0, airborne: false };
  });
  let elapsed = 0,
    lastPass = -1;
  return (
    dt: number,
    time: number,
    camera: T.PerspectiveCamera,
    swell: number,
    reduced: boolean,
  ) => {
    elapsed += dt;
    const pass = Math.floor(elapsed / 14);
    const age = elapsed % 14;
    const count = [2, 1, 3][pass % 3];
    if (pass !== lastPass) {
      for (const dolphin of pod) dolphin.airborne = false;
      lastPass = pass;
    }
    for (let i = 0; i < pod.length; i++) {
      const dolphin = pod[i];
      const duration = reduced ? 2.55 : 1.95;
      const u = (age - 1.3 - i * 0.61) / duration;
      dolphin.mesh.visible = i < count && u >= 0 && u <= 1;
      if (!dolphin.mesh.visible) continue;
      const travel = reduced ? 5.6 : 8.8;
      if (!dolphin.airborne) {
        // Choose a distant crest near the projected apex. Each leap then
        // follows a fixed world-space course independent of camera movement.
        const depth = 34 + i * 1.5;
        const halfWidth =
          depth *
          Math.tan(T.MathUtils.degToRad(camera.fov / 2)) *
          camera.aspect;
        dolphin.originX =
          camera.position.x + halfWidth * (0.36 - 0.16 * (pass % 3)) + i * 1.65;
        dolphin.originZ = camera.position.z - depth;
        let best = -Infinity;
        for (let k = -3; k <= 3; k++) {
          const z = camera.position.z - depth + k * 1.4;
          const h = wave(
            dolphin.originX - travel * 0.5,
            z,
            time + duration * 0.5 * (reduced ? 0.42 : 1),
            swell,
          );
          if (h > best) {
            best = h;
            dolphin.originZ = z;
          }
        }
        dolphin.airborne = true;
      }
      const x = dolphin.originX - travel * u,
        z = dolphin.originZ - u * 0.8;
      const lift = reduced ? 3.65 : 4.3;
      const y = wave(x, z, time, swell) - 1.35 + 4 * lift * u * (1 - u);
      dolphin.mesh.position.set(x, y, z);
      dolphin.mesh.rotation.set(
        0,
        Math.PI - 0.09,
        Math.atan2(4 * lift * (1 - 2 * u), travel),
        "YZX",
      );
      dolphin.mesh.morphTargetInfluences![0] =
        0.5 + 0.48 * Math.sin(u * 6.8 + i);
    }
  };
}
