import * as T from "three";

const rays = 2048;
const angles = 384;
const observerRadius = Math.hypot(17, 1.14);
const maximumSlope = 1.18;
const turn = 2 * Math.PI;
const maximumRadius = 24;

// A Schwarzschild ray stays in the plane of its launch direction and the
// center. Cache the path in that plane once, then resolve its intersections
// with the accretion disk from any viewing direction in the display shader.
let rayTables: { paths: T.DataTexture; escapes: T.DataTexture } | undefined;

export function blackHoleRayTables() {
  if (rayTables) return rayTables;
  const paths = new Uint16Array(rays * angles * 2);
  const escapes = new Uint8Array(rays * 4);
  const half = T.DataUtils.toHalfFloat;

  for (let ray = 0; ray < rays; ray++) {
    // Spend more samples on the tightly spaced rays near the shadow.
    const slope = maximumSlope * ((ray + 0.5) / rays) ** 2;
    let vx = slope / Math.hypot(1, slope), vz = -1 / Math.hypot(1, slope);
    let x = 0, z = observerRadius;
    let radius = observerRadius, angle = 0, rawAngle = 0;
    let radialSpeed = vz, row = 0;
    const momentum = observerRadius * vx;
    const gravity = -1.5 * momentum * momentum;
    const write = (r: number, speed: number) => {
      const i = 2 * (row++ * rays + ray);
      paths[i] = half(Math.min(1, r / maximumRadius));
      paths[i + 1] = half(T.MathUtils.clamp(speed, -1, 1));
    };
    let escaped = false;

    for (let step = 0; step < 540; step++) {
      if (radius <= 1) break;
      if (radius > 40 && radialSpeed > 0) {
        escaped = true;
        break;
      }
      const dt = T.MathUtils.clamp(0.062 * radius * radius / Math.max(0.01, momentum), 0.012, 1.05);
      const acceleration = gravity / radius ** 5;
      const nextX = x + dt * (vx + 0.5 * dt * acceleration * x);
      const nextZ = z + dt * (vz + 0.5 * dt * acceleration * z);
      const nextRadius = Math.hypot(nextX, nextZ);
      const nextAcceleration = gravity / Math.max(1, nextRadius) ** 5;
      vx += 0.5 * dt * (acceleration * x + nextAcceleration * nextX);
      vz += 0.5 * dt * (acceleration * z + nextAcceleration * nextZ);

      const nextRaw = Math.atan2(nextX, nextZ);
      const delta = nextRaw - rawAngle;
      const nextAngle = angle + (delta < -Math.PI ? delta + turn : Math.max(0, delta));
      const nextRadial = (vx * nextX + vz * nextZ) / Math.max(1e-5, nextRadius * Math.hypot(vx, vz));

      while (row < angles) {
        const sampleAngle = (row + 0.5) * turn / angles;
        if (sampleAngle > nextAngle) break;
        const progress = (sampleAngle - angle) / Math.max(1e-7, nextAngle - angle);
        write(T.MathUtils.lerp(radius, nextRadius, progress), T.MathUtils.lerp(radialSpeed, nextRadial, progress));
      }
      radius = nextRadius;
      x = nextX;
      z = nextZ;
      angle = nextAngle;
      rawAngle = nextRaw;
      radialSpeed = nextRadial;
    }

    while (row < angles) write(escaped ? maximumRadius : 0, escaped ? 1 : -1);
    const v = Math.hypot(vx, vz);
    escapes[ray * 4] = Math.round(127.5 * (1 + vz / v));
    escapes[ray * 4 + 1] = Math.round(127.5 * (1 + vx / v));
    escapes[ray * 4 + 3] = escaped ? 255 : 0;
  }

  const pathTexture = new T.DataTexture(paths, rays, angles, T.RGFormat, T.HalfFloatType);
  const escapeTexture = new T.DataTexture(escapes, rays, 1, T.RGBAFormat);
  for (const texture of [pathTexture, escapeTexture]) {
    texture.minFilter = texture.magFilter = T.LinearFilter;
    texture.needsUpdate = true;
  }

  rayTables = { paths: pathTexture, escapes: escapeTexture };
  return rayTables;
}
