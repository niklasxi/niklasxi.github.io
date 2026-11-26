import * as T from "three";
import { seabed } from "./environment";
import { forgedSteel, makeAnchor, submerge, type WaterLight } from "./anchor";
import { ease } from "./waves";

// Long sides and semicircular ends give a welded mooring link its bearing surfaces.
function linkGeometry(start = 0, end = 1) {
  const radius = 0.083,
    straight = 0.127,
    quarter = (Math.PI * radius) / 2;
  const perimeter = 4 * quarter + 2 * straight;
  const points: T.Vector3[] = [];
  for (let i = 0; i <= 64; i++) {
    const s = (start + ((end - start) * i) / 64) * perimeter;
    let x: number, y: number;
    if (s < quarter) {
      x = radius * Math.sin(s / radius);
      y = -straight / 2 - radius * Math.cos(s / radius);
    } else if (s < quarter + straight) {
      x = radius;
      y = -straight / 2 + s - quarter;
    } else if (s < 3 * quarter + straight) {
      const angle = (s - quarter - straight) / radius;
      x = radius * Math.cos(angle);
      y = straight / 2 + radius * Math.sin(angle);
    } else if (s < 3 * quarter + 2 * straight) {
      x = -radius;
      y = straight / 2 - (s - 3 * quarter - straight);
    } else {
      const angle = (s - 3 * quarter - 2 * straight) / radius;
      x = -radius * Math.cos(angle);
      y = -straight / 2 - radius * Math.sin(angle);
    }
    points.push(new T.Vector3(x, y, 0));
  }
  return new T.TubeGeometry(
    new T.CatmullRomCurve3(points),
    48,
    0.034,
    12,
    false,
  );
}
export function createTether(
  scene: T.Scene,
  boat: T.Object3D,
  surface: T.Intersection,
  water: WaterLight,
) {
  const metal = forgedSteel();
  const bronze = new T.MeshStandardMaterial({
    color: 0x82755f,
    roughness: 0.38,
    metalness: 0.76,
    envMap: metal.envMap,
  });
  const { anchor, shackle } = makeAnchor(metal);
  anchor.position.set(0.84, seabed - 0.025, 0.58);
  anchor.rotation.set(0.13, -0.39, -0.28);
  scene.add(anchor);
  const v = (x: number, y: number, z = 0) => new T.Vector3(x, y, z);
  const bottom = shackle.localToWorld(v(0, 0.269));
  // A reinforced eyelet lies on the near face, just under the port gunwale.
  const normal = surface?.face?.normal.clone() ?? v(0, 0, 1);
  if (normal.z < 0) normal.negate();
  const lug = (surface?.point.clone() ?? v(-2.12, 0.58, 0.68)).addScaledVector(
    normal,
    0.07,
  );
  const eyelet = new T.Mesh(new T.TorusGeometry(0.087, 0.026, 10, 32), bronze);
  eyelet.position.copy(lug);
  eyelet.quaternion.setFromUnitVectors(v(0, 0, 1), normal);
  boat.add(eyelet);
  const topLocal = lug.clone().add(v(-0.024, -0.116, 0.082));
  const count = 15;
  const chain = new T.InstancedMesh(linkGeometry(), metal, count);
  const glintColor = new T.Color();
  // Allocate the per-link color attribute before its shader is compiled.
  chain.setColorAt(0, glintColor);
  chain.name = "Mooring chain";
  chain.layers.enable(2);
  chain.frustumCulled = false;
  scene.add(chain);
  const halves = [
    new T.Mesh(linkGeometry(0, 0.5), metal),
    new T.Mesh(linkGeometry(0.5, 1), metal),
  ];
  const fracture = new T.MeshStandardMaterial({
    color: 0xa3aaa6,
    roughness: 0.48,
    metalness: 0.74,
    envMap: metal.envMap,
    side: T.DoubleSide,
  });
  for (const material of [metal, bronze, fracture]) submerge(material, water);
  // The fracture faces are already uploaded while the link is closed. Its
  // two halves hide the faces until they separate.
  const cutFace = new T.CircleGeometry(0.034, 10);
  halves.forEach((half) => {
    half.layers.enable(2);
    for (const end of [-1, 1]) {
      const cap = new T.Mesh(cutFace, fracture);
      cap.rotation.y = Math.PI / 2;
      cap.position.y = end * 0.1465;
      cap.layers.enable(2);
      half.add(cap);
    }
  });
  scene.add(...halves);
  const top = new T.Vector3(),
    temp = new T.Object3D(),
    tangent = new T.Vector3();
  let broken = false;
  const points = Array.from({ length: count + 2 }, () => new T.Vector3());
  const saved = points.map(() => new T.Vector3());
  const pile = points.map((_, i) => {
    const t = i / (points.length - 1),
      a = 1.6 + t * Math.PI * 3.2,
      radius = 0.53 * (1 - t);
    return bottom
      .clone()
      .add(
        v(
          -0.35 * (1 - t) + radius * Math.cos(a),
          0,
          0.54 * Math.sin(a) * (1 - t),
        ),
      )
      .setY(
        seabed +
          0.075 +
          0.09 * (1 - t) +
          Math.pow(t, 3.5) * (bottom.y - seabed - 0.075),
      );
  });
  const arcLengths = new Float32Array(points.length);
  const centers = Array.from({ length: count + 1 }, () => new T.Vector3());
  const bearing = new T.Vector3(),
    hingeAxis = new T.Vector3();
  const orientation = new T.Matrix4(),
    depthAxis = new T.Vector3();
  function update(
    time: number,
    breakAge: number,
    visible: boolean,
    tension: number,
    reduced: boolean,
  ) {
    if (breakAge < 0) broken = false;
    chain.visible = eyelet.visible = visible;
    halves.forEach((h) => (h.visible = visible));
    if (!visible) return;
    top.copy(topLocal);
    boat.localToWorld(top);
    if (breakAge < 0 || !broken) {
      const slack =
        Math.sqrt(Math.max(0.04, 3.51 ** 2 - top.distanceToSquared(bottom))) *
        0.43;
      for (let i = 0; i < points.length; i++) {
        const f = i / (points.length - 1);
        points[i].copy(top).lerp(bottom, f);
        const bow = Math.sin(f * Math.PI);
        points[i].x -=
          bow * (1 - tension) * (slack + 0.025 * Math.sin(time * 0.61));
        points[i].y -= bow * (1 - tension) * slack * 0.18;
        points[i].z +=
          bow * (1 - tension) * (0.12 + 0.045 * Math.cos(time * 0.72));
      }
      if (breakAge >= 0) {
        for (let i = 0; i < points.length; i++) saved[i].copy(points[i]);
        broken = true;
      }
    }
    if (breakAge >= 0) {
      for (let i = 0; i < points.length; i++) {
        const t = i / (points.length - 1),
          p = ease(0.12 * t, 2.7 + 0.48 * t, breakAge);
        points[i].copy(saved[i]).lerp(pile[i], p);
        // The impulse travels down the chain after the upper link fails.
        const elapsed = Math.max(0, breakAge - 0.34 * t);
        const kick = Math.sin(Math.min(1, elapsed / 0.64) * Math.PI) * (1 - t);
        points[i].x -= 0.39 * kick;
        points[i].y -= 0.21 * kick;
        points[i].y = Math.max(seabed + 0.07, points[i].y);
      }
    }
    // Fix the inner end of the terminal link on the shackle crown. Its steel
    // passes through the hole even when the loose links fall below the eye.
    const lastPoint = points.length - 1;
    bearing.subVectors(points[lastPoint - 1], bottom).normalize();
    centers[count].copy(bottom).addScaledVector(bearing, 0.107);
    points[lastPoint].copy(centers[count]);
    for (let i = 1; i < points.length; i++) {
      arcLengths[i] = arcLengths[i - 1] + points[i].distanceTo(points[i - 1]);
    }
    let segment = 1;
    for (let i = 0; i < count; i++) {
      const distance = (arcLengths[lastPoint] * i) / count;
      while (segment < lastPoint && arcLengths[segment] < distance) segment++;
      centers[i]
        .copy(points[segment - 1])
        .lerp(
          points[segment],
          (distance - arcLengths[segment - 1]) /
            Math.max(0.00001, arcLengths[segment] - arcLengths[segment - 1]),
        );
    }
    // The shackle runs fore-aft. Make the terminal link face across it, then
    // alternate the following links by quarter turns around the chain tangent.
    hingeAxis.set(0, 0, 1).applyQuaternion(anchor.quaternion);
    for (let i = 1; i <= count; i++) {
      if (i === count) tangent.copy(bearing);
      else tangent.subVectors(centers[i - 1], centers[i + 1]).normalize();
      depthAxis
        .copy(hingeAxis)
        .addScaledVector(tangent, -hingeAxis.dot(tangent));
      if (depthAxis.lengthSq() < 0.001) depthAxis.set(1, 0, 0).cross(tangent);
      depthAxis.normalize();
      const across = temp.position.crossVectors(tangent, depthAxis);
      orientation.makeBasis(across, tangent, depthAxis);
      temp.quaternion.setFromRotationMatrix(orientation);
      const twist = ((count - i) * Math.PI) / 2 + (count - i) * 0.036;
      temp.rotateY(twist);
      temp.position.copy(centers[i]);
      temp.updateMatrix();
      chain.setMatrixAt(i - 1, temp.matrix);
      // Two bands of reflected light run down the links as slack runs out.
      const localStrain = tension - 0.12 * (i / count);
      const glint = reduced
        ? 0.22 * tension
        : 1 -
          ease(0, 0.12, Math.abs(localStrain - 0.52)) +
          (1 - ease(0, 0.1, Math.abs(localStrain - 0.88)));
      const light = breakAge < 0 ? glint : 0;
      glintColor.setRGB(1 + light * 1.15, 1 + light * 1.38, 1 + light * 1.47);
      chain.setColorAt(i - 1, glintColor);
    }
    chain.instanceColor!.needsUpdate = true;
    chain.instanceMatrix.needsUpdate = true;
    const crack = breakAge >= 0 ? ease(0, 0.28, breakAge) : 0;
    const recoil =
      crack *
      Math.exp(-Math.max(0, breakAge) * 5) *
      Math.sin(Math.max(0, breakAge) * 24);
    halves[0].position.copy(top);
    halves[0].position.x += 0.077 * crack;
    halves[0].rotation.set(0.06, 0.24, 0.82 * crack + 0.44 * recoil);
    halves[1].position.copy(points[0]);
    halves[1].position.x -= 0.077 * crack;
    halves[1].rotation.set(0.06, 0.24, -1.02 * crack - 0.46 * recoil);
  }
  return { update, anchor, attachment: top };
}

export function createSeabedDetails(scene: T.Scene) {
  let seed = 382;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const group = new T.Group();
  scene.add(group);
  const pebbles = new T.InstancedMesh(
    new T.IcosahedronGeometry(1, 1),
    new T.MeshStandardMaterial({ color: 0x4b756b, roughness: 1 }),
    64,
  );
  const dummy = new T.Object3D();
  for (let i = 0; i < pebbles.count; i++) {
    const x = (rand() - 0.5) * 30,
      z = 3 - rand() * 22;
    const size = 0.034 + Math.pow(rand(), 4) * 0.15;
    dummy.position.set(x, seabed + 0.002, z);
    dummy.scale.set(size * 1.6, size * 0.59, size);
    dummy.rotation.set(rand(), rand() * 6, rand() * 0.4);
    dummy.updateMatrix();
    pebbles.setMatrixAt(i, dummy.matrix);
  }
  group.add(pebbles);
  const blades: number[] = [],
    colors: number[] = [];
  const grass = new T.BufferGeometry();
  for (let tuft = 0; tuft < 32; tuft++) {
    const cx = (rand() - 0.5) * 22,
      cz = 2 - rand() * 14;
    for (let blade = 0; blade < 9; blade++) {
      const x = cx + (rand() - 0.5) * 0.35,
        z = cz + (rand() - 0.5) * 0.35;
      const height = 0.07 + rand() * 0.22,
        lean = (rand() - 0.36) * 0.16,
        wide = 0.005 + rand() * 0.01;
      const root = [x, seabed, z],
        left = [x - wide, seabed + height * 0.45, z + 0.026];
      const right = [x + wide, seabed + height * 0.46, z + 0.026],
        tip = [x + lean, seabed + height, z + 0.055];
      blades.push(...root, ...left, ...right, ...left, ...tip, ...right);
      const tone = rand();
      for (let i = 0; i < 6; i++)
        colors.push(
          0.045 + tone * 0.055,
          0.15 + tone * 0.1,
          0.11 + tone * 0.06,
        );
    }
  }
  grass.setAttribute("position", new T.Float32BufferAttribute(blades, 3));
  grass.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
  group.add(
    new T.Mesh(
      grass,
      new T.MeshBasicMaterial({ vertexColors: true, side: T.DoubleSide }),
    ),
  );
  const loc = [];
  for (let i = 0; i < 195; i++)
    loc.push((rand() - 0.5) * 22, seabed + rand() * 3.4, 3 - rand() * 17);
  const geom = new T.BufferGeometry();
  geom.setAttribute("position", new T.Float32BufferAttribute(loc, 3));
  const dust = new T.Points(
    geom,
    new T.PointsMaterial({
      size: 0.019,
      color: 0xb4e3ca,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    }),
  );
  group.add(dust);
  return {
    update(dive: number, t: number) {
      group.visible = dive > 0.02;
      dust.position.set(
        0.21 * Math.sin(t * 0.19),
        0.15 * Math.sin(t * 0.22),
        0,
      );
    },
  };
}
