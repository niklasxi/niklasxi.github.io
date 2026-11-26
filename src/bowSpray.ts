import * as T from "three";
import { wave } from "./waves";

export function createBowSpray(scene: T.Scene, tide: T.IUniform<number>) {
  const capacity = 260;
  const pool = Array.from({ length: capacity }, () => ({
    position: new T.Vector3(),
    velocity: new T.Vector3(),
    age: Infinity,
    lifetime: 0,
    size: 0,
    seed: 0,
  }));

  const positions = new Float32Array(capacity * 3);
  const velocities = new Float32Array(capacity * 3);
  const meta = new Float32Array(capacity * 4); // size, lifeFrac, seed, unused

  const geometry = new T.BufferGeometry();
  const posAttr = new T.BufferAttribute(positions, 3);
  const velAttr = new T.BufferAttribute(velocities, 3);
  const metaAttr = new T.BufferAttribute(meta, 4);
  posAttr.setUsage(T.DynamicDrawUsage);
  velAttr.setUsage(T.DynamicDrawUsage);
  metaAttr.setUsage(T.DynamicDrawUsage);
  geometry.setAttribute("position", posAttr);
  geometry.setAttribute("aVel", velAttr);
  geometry.setAttribute("aMeta", metaAttr);
  geometry.setDrawRange(0, 0);

  const uniforms = {
    uPixels: { value: 900 },
  };

  const material = new T.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: `
      attribute vec3 aVel;
      attribute vec4 aMeta;
      uniform float uPixels;
      varying vec2 vAxis;
      varying float vStretch, vAlpha, vGlint, vMist;
      void main() {
        float size = aMeta.x;
        float life = aMeta.y;
        float seed = aMeta.z;
        vMist = 1.0 - smoothstep(0.0, 0.45, seed);
        vec4 eye = viewMatrix * vec4(position, 1.0);
        vec3 velEye = mat3(viewMatrix) * aVel;
        vec2 projected = velEye.xy - eye.xy * velEye.z / min(eye.z, -0.05);
        vAxis = normalize(projected + vec2(0.0001));
        float dist = max(0.35, -eye.z);
        float radius = size * (1.0 - smoothstep(0.45, 1.0, life)) * (1.0 + vMist * 1.3 * life);
        float widthPx = max(1.0, uPixels * radius / dist);
        float lenPx = uPixels * length(projected) * 0.014 / dist;
        vStretch = mix(clamp(1.0 + lenPx / widthPx, 1.0, 4.8), 1.35, vMist);
        gl_PointSize = clamp(widthPx * vStretch, 1.1, 22.0);
        gl_Position = projectionMatrix * eye;
        float fadeIn = smoothstep(0.0, 0.08, life);
        float fadeOut = 1.0 - smoothstep(0.42, 1.0, life);
        vAlpha = fadeIn * fadeOut * mix(0.68, 0.22, vMist);
        vGlint = clamp(0.45 + 0.55 * sin(seed * 41.0 + aVel.x * 0.7), 0.0, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vAxis;
      varying float vStretch, vAlpha, vGlint, vMist;
      void main() {
        vec2 q = (gl_PointCoord - 0.5) * 2.0;
        q.y = -q.y;
        vec2 coord = vec2(dot(q, vec2(-vAxis.y, vAxis.x)) * vStretch, dot(q, vAxis));
        float r = length(coord);
        if (r > 1.0) discard;
        float dropEdge = 1.0 - smoothstep(0.28, 0.98, r);
        float mistEdge = pow(max(0.0, 1.0 - r), 1.85);
        float edge = mix(dropEdge, mistEdge, vMist);
        float spec = exp(-9.0 * length(coord - vec2(-0.28, 0.22)));
        float fresnel = smoothstep(0.25, 0.9, r) * (1.0 - vMist);
        vec3 shadowWater = vec3(0.22, 0.36, 0.39);
        vec3 skyWater = vec3(0.76, 0.84, 0.85);
        vec3 sunGlint = vec3(1.0, 0.93, 0.78);
        vec3 col = mix(shadowWater, skyWater, 0.42 + 0.45 * vGlint + 0.28 * fresnel);
        col = mix(col, sunGlint, clamp(spec * 0.85 + vGlint * 0.35, 0.0, 1.0));
        gl_FragColor = vec4(col, vAlpha * edge);
      }
    `,
  });

  const points = new T.Points(geometry, material);
  points.name = "Bow spray";
  points.frustumCulled = false;
  scene.add(points);

  let next = 0,
    pending = 0;
  const contact = new T.Vector3();

  return (
    dt: number,
    time: number,
    boat: T.Object3D,
    follow: number,
    swell: number,
    reduced: boolean,
    drip = false,
  ) => {
    points.visible = follow > 0.01 || geometry.drawRange.count > 0 || drip;
    if (!points.visible) return;
    uniforms.uPixels.value = (window.innerHeight || 900) * 1.4;

    contact.set(-1.55, 0.14, 0);
    boat.localToWorld(contact);
    const crest = tide.value + wave(contact.x, contact.z, time, swell);
    // Water rising against the angled bow throws a wider fan of fine spray on the next crest.
    const encounter = T.MathUtils.clamp((crest - contact.y + 0.1) * 2.8, 0, 1);
    pending += dt * follow * (18 + 185 * encounter) * (reduced ? 0.32 : 1);
    while (pending >= 1) {
      pending--;
      const drop = pool[next];
      next = (next + 1) % pool.length;
      const side = Math.random() < 0.5 ? -1 : 1,
        spread = Math.random(),
        seed = Math.random();
      const x = -1.65 + Math.random() * 0.92;
      drop.position.set(x, 0.12, side * (0.24 + 0.54 * (x + 1.65)));
      boat.localToWorld(drop.position);
      drop.position.y =
        tide.value + wave(drop.position.x, drop.position.z, time, swell) + 0.025;
      drop.velocity
        .set(
          0.32 + 0.78 * spread,
          0.9 + (0.85 + encounter) * Math.random(),
          side * (0.55 + spread * 1.05),
        )
        .applyQuaternion(boat.quaternion);
      drop.age = 0;
      drop.lifetime = 0.32 + spread * 0.42;
      drop.seed = seed;
      // Finer mist particles are slightly wider and softer; droplets are tiny & crisp.
      drop.size = seed < 0.45 ? 0.012 + Math.random() * 0.022 : 0.004 + Math.random() * 0.010;
    }

    if (drip) {
      for (let i = 0; i < (reduced ? 6 : 16); i++) {
        const drop = pool[next];
        next = (next + 1) % pool.length;
        drop.position.set((Math.random() - 0.5) * 2.7, 0.06, (i % 2 ? 1 : -1) * 0.55);
        boat.localToWorld(drop.position);
        drop.velocity.set(-0.48 + (Math.random() - 0.5) * 0.3, 0.14 + Math.random() * 0.55, -0.2 + (Math.random() - 0.5) * 0.3);
        drop.age = 0;
        drop.lifetime = 0.75 + Math.random() * 0.35;
        drop.seed = 0.5 + Math.random() * 0.5;
        drop.size = 0.006 + 0.008 * Math.random();
      }
    }

    let count = 0;
    for (const drop of pool) {
      if (drop.age >= drop.lifetime) continue;
      drop.age += dt;
      const isMist = drop.seed < 0.45;
      const drag = Math.exp(-(isMist ? 2.4 : 0.65) * dt);
      drop.velocity.multiplyScalar(drag);
      drop.velocity.y -= (isMist ? 3.2 : 7.4) * dt;
      drop.position.addScaledVector(drop.velocity, dt);
      if (
        drop.position.y <
        tide.value + wave(drop.position.x, drop.position.z, time, swell) - 0.015
      ) {
        drop.age = Infinity;
        continue;
      }
      const i3 = count * 3;
      const i4 = count * 4;
      positions[i3] = drop.position.x;
      positions[i3 + 1] = drop.position.y;
      positions[i3 + 2] = drop.position.z;
      velocities[i3] = drop.velocity.x;
      velocities[i3 + 1] = drop.velocity.y;
      velocities[i3 + 2] = drop.velocity.z;
      meta[i4] = drop.size;
      meta[i4 + 1] = drop.age / drop.lifetime;
      meta[i4 + 2] = drop.seed;
      meta[i4 + 3] = 0;
      count++;
    }

    geometry.setDrawRange(0, count);
    posAttr.needsUpdate = true;
    velAttr.needsUpdate = true;
    metaAttr.needsUpdate = true;
  };
}
