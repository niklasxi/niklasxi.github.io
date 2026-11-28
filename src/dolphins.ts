import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import dolphinUrl from "./assets/dolphin.glb?url";
import type { createSeaMist } from "./seaMist";
import { createDolphinBreath } from "./dolphinBreath";
import { createBreachSplashes } from "./breachSplash";
import { ease, wave } from "./waves";

export async function createDolphins(
  scene: T.Scene,
  footprints: T.Vector4[],
  mist: ReturnType<typeof createSeaMist>,
  onExhale: (pan: number, distance: number) => void,
) {
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
  // Intersect the crown behind the beak to place the exhale on the skin.
  const ray = new T.Raycaster(
    new T.Vector3(0.6, 2, 0),
    new T.Vector3(0, -1, 0),
  );
  const blowhole = ray.intersectObject(new T.Mesh(geometry, material))[0].point;
  const breath = createDolphinBreath(scene);
  const projectedBreath = new T.Vector3();
  const splashes = createBreachSplashes(scene, footprints);
  const pod = Array.from({ length: 3 }, (_, i) => {
    const mesh = new T.Mesh(geometry, material);
    mesh.name = "Breaching dolphin " + (i + 1);
    mesh.layers.enable(1);
    mesh.visible = false;
    mesh.scale.setScalar([1.05, 0.89, 0.98][i]);
    scene.add(mesh);
    return { mesh, originX: 0, originZ: 0, airborne: false, previousPhase: -1 };
  });
  const horizonStart = new T.Vector3(), across = new T.Vector3(), forward = new T.Vector3();
  const course = new T.Vector3();
  let horizonAge = 0;
  let elapsed = 0,
    lastPass = -1;
  return (
    dt: number,
    time: number,
    camera: T.PerspectiveCamera,
    swell: number,
    reduced: boolean,
    bufferHeight: number,
    active = true,
    heading?: T.Vector3,
    oceanOrigin?: T.Vector2,
  ) => {
    if (heading && oceanOrigin) {
      if (horizonAge === 0) {
        // Set a course once in ocean coordinates, then let the pod swim away.
        camera.getWorldDirection(forward).setY(0).normalize();
        across.set(-heading.z, 0, heading.x);
        horizonStart.set(camera.position.x + oceanOrigin.x, 0, camera.position.z + oceanOrigin.y)
          .addScaledVector(forward, 44).addScaledVector(across, camera.aspect < 1 ? 2.6 : 7);
        // Swim diagonally into the distance so the breaches read in profile.
        const angle = T.MathUtils.lerp(.17, .34, ease(.55, 1.5, camera.aspect));
        course.copy(heading).addScaledVector(across, angle).normalize();
        across.set(-course.z, 0, course.x);
        splashes.clear();
        for (const dolphin of pod) dolphin.previousPhase = -1;
      }
      horizonAge += dt;
      const speed = reduced ? 4.4 : 8.5;
      const interval = reduced ? 6.4 : 5.2;
      const duration = reduced ? 1.55 : 1.49;
      const recoveryDuration = reduced ? .82 : 1;
      const yaw = Math.atan2(-course.z, course.x);
      for (let i = 0; i < pod.length; i++) {
        const dolphin = pod[i];
        const mesh = dolphin.mesh;
        const swimTime = horizonAge - i * .72;
        const cycle = T.MathUtils.euclideanModulo(swimTime, interval + .19 * i);
        const u = (cycle - .46) / duration;
        const airborne = swimTime >= 0 && u >= 0 && u <= 1;
        const lift = reduced ? 1.22 : 2.38;
        const liftHeight = airborne ? 4 * lift * u * (1 - u) : 0;
        const entrySpeed = 4 * lift / duration;
        const recovery = T.MathUtils.clamp((cycle - .46 - duration) / recoveryDuration, 0, 1);
        const diving = swimTime >= 0 && u > 1 && recovery < 1;
        // Carry the arc's downward velocity below the surface, then rise
        // back to swimming depth with zero vertical velocity.
        const remaining = 1 - recovery;
        const diveHeight = diving ? -entrySpeed * recoveryDuration * recovery * remaining ** 2 : 0;
        const verticalSpeed = airborne ? entrySpeed * (1 - 2 * u)
          : diving ? -entrySpeed * remaining * (1 - 3 * recovery) : 0;
        const breachPose = airborne ? ease(0, .14, u) : diving ? 1 - ease(.52, 1, recovery) : 0;
        const stroke = Math.sin(swimTime * 3.9 + i * .56);
        const lane = (i - 1) * 3.1 + .46 * Math.sin(swimTime * .76 + i);
        const distance = speed * horizonAge - i * 3.3;
        const position = mesh.position.copy(horizonStart)
          .addScaledVector(course, distance).addScaledVector(across, lane);
        const height = wave(position.x, position.z, time, swell);
        position.x -= oceanOrigin.x;
        position.z -= oceanOrigin.y;
        position.y = height - .46 + liftHeight + diveHeight + .22 * stroke * (1 - breachPose);
        mesh.visible = true;
        const pitch = Math.atan2(verticalSpeed, speed);
        mesh.rotation.set(0, yaw, T.MathUtils.lerp(.10 * stroke, pitch, breachPose), "YZX");
        mesh.morphTargetInfluences![0] = .5 + .45 * stroke;

        const previous = u < dolphin.previousPhase ? -1 : dolphin.previousPhase;
        if (swimTime >= 0) {
          for (const [contact, phase] of [0.10, 0.94].entries()) {
            if (previous >= phase || u < phase || u > 1.16) continue;
            const lead = contact ? .68 : .18;
            splashes.strike(i * 2 + contact, position.x + course.x * lead,
              position.z + course.z * lead, contact ? .93 : .62, time, swell);
          }
          if (i === 0 && previous < .29 && u >= .29 && u < .55) {
            const origin = breath.exhale(mesh, blowhole, speed, 1.1, reduced, course);
            projectedBreath.copy(origin).project(camera);
            if (projectedBreath.z < 1 && Math.abs(projectedBreath.x) < 1 && Math.abs(projectedBreath.y) < 1) {
              onExhale(projectedBreath.x, camera.position.distanceTo(origin));
            }
          }
        }
        dolphin.previousPhase = u;
      }
      splashes.update(dt, time, swell, bufferHeight);
      breath.update(dt, bufferHeight);
      return;
    }
    horizonAge = 0;
    if (!active) {
      for (const dolphin of pod) dolphin.mesh.visible = false;
      splashes.clear();
      breath.update(10, bufferHeight);
      return;
    }
    elapsed += dt;
    const pass = Math.floor(elapsed / 14);
    const age = elapsed % 14;
    const count = [2, 1, 3][pass % 3];
    if (pass !== lastPass) {
      for (const dolphin of pod) {
        dolphin.airborne = false;
        dolphin.previousPhase = -1;
      }
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
      // The tail clears the crest on ascent. On descent the beak meets it
      // first, just ahead of the body, while the rest is still above water.
      for (const [contact, phase] of [0.15, 0.86].entries()) {
        if (dolphin.previousPhase < phase && u >= phase) {
          const impactX =
            dolphin.originX - travel * phase + (contact ? -0.65 : 0.65);
          const impactZ = dolphin.originZ - phase * 0.8;
          const strength = dolphin.mesh.scale.x * (reduced ? 0.78 : 1);
          if (contact === 1)
            mist.impact(impactX, impactZ, 0.42, 0.25, 0, strength);
          splashes.strike(
            i * 2 + contact,
            impactX,
            impactZ,
            (contact ? 1 : 0.63) * strength,
            time,
            swell,
          );
        }
      }
      dolphin.mesh.position.set(x, y, z);
      dolphin.mesh.rotation.set(
        0,
        Math.PI - 0.09,
        Math.atan2(4 * lift * (1 - 2 * u), travel),
        "YZX",
      );
      if ((pass + i) % 3 === 0 && dolphin.previousPhase < 0.32 && u >= 0.32) {
        const origin = breath.exhale(
          dolphin.mesh,
          blowhole,
          travel / duration,
          (4 * lift * (1 - 2 * u)) / duration,
          reduced,
        );
        projectedBreath.copy(origin).project(camera);
        if (projectedBreath.z < 1 && Math.abs(projectedBreath.x) < 1.15 && Math.abs(projectedBreath.y) < 1.15) {
          onExhale(projectedBreath.x, camera.position.distanceTo(origin));
        }
      }
      dolphin.previousPhase = u;
      dolphin.mesh.morphTargetInfluences![0] =
        0.5 + 0.48 * Math.sin(u * 6.8 + i);
    }
    splashes.update(dt, time, swell, bufferHeight);
    breath.update(dt, bufferHeight);
  };
}
