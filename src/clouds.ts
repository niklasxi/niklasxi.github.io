import * as T from "three";

// Soft high-altitude sunset cloud layers drifting endlessly past the flying plane,
// positioned above, alongside, and below the flight path for parallax depth.
export function createClouds(scene: T.Scene) {
  const texture = cloudTexture();
  const clouds: {
    sprite: T.Sprite;
    relX: number;
    relY: number;
    z: number;
    scaleX: number;
    scaleY: number;
    opacity: number;
    drift: number;
    phase: number;
  }[] = [];

  let seed = 2027;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  for (let i = 0; i < 42; i++) {
    const lowerLayer = i < 20;
    const warmTint = i % 3 === 0 ? 0xffdfc2 : i % 3 === 1 ? 0xf5d6cc : 0xc5cde0;
    const material = new T.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      color: warmTint,
      opacity: 0,
    });
    const sprite = new T.Sprite(material);
    sprite.visible = false;
    sprite.renderOrder = -4;
    scene.add(sprite);
    const scaleX = lowerLayer ? 62 + rand() * 105 : 36 + rand() * 58;
    const scaleY = scaleX * (0.34 + rand() * 0.22);
    sprite.scale.set(scaleX, scaleY, 1);
    clouds.push({
      sprite,
      relX: (rand() - 0.5) * 320,
      relY: lowerLayer ? -8 - rand() * 34 : 2 + rand() * 34,
      z: -30 - rand() * 380,
      scaleX,
      scaleY,
      opacity: lowerLayer ? 0.14 + rand() * 0.18 : 0.12 + rand() * 0.18,
      drift: 0.9 + rand() * 1.7,
      phase: rand() * Math.PI * 2,
    });
  }

  function reset(planePos: T.Vector3) {
    for (let i = 0; i < clouds.length; i++) {
      clouds[i].z = planePos.z - 45 - ((i * 18.7) % 380);
    }
  }

  function shiftOrigin(dx: number, dz: number) {
    for (const c of clouds) {
      c.z += dz;
      c.sprite.position.x += dx;
      c.sprite.position.z += dz;
    }
  }

  function update(
    dt: number,
    time: number,
    flight: number,
    planePos: T.Vector3,
  ) {
    const active = flight > 0.01;
    for (const cloud of clouds) {
      cloud.sprite.visible = active;
      if (!active) continue;
      cloud.z += cloud.drift * dt;
      if (cloud.z > planePos.z + 55) {
        cloud.z -= 420;
      }
      const x = planePos.x + cloud.relX + Math.sin(time * 0.04 + cloud.phase) * 7;
      const y = planePos.y + cloud.relY + Math.cos(time * 0.05 + cloud.phase) * 1.4;
      cloud.sprite.position.set(x, y, cloud.z);
      const distAhead = planePos.z - cloud.z;
      const farFade = T.MathUtils.smoothstep(distAhead, 420, 260);
      const nearFade = T.MathUtils.smoothstep(distAhead, -35, 18);
      const pulse = 0.85 + 0.15 * Math.sin(time * 0.14 + cloud.phase);
      cloud.sprite.material.opacity =
        cloud.opacity * pulse * flight * farFade * nearFade;
    }
  }

  return { update, reset, shiftOrigin };
}

function cloudTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const puffs: [number, number, number, number][] = [
    [0.34, 0.56, 0.2, 0.72],
    [0.5, 0.47, 0.27, 0.85],
    [0.66, 0.55, 0.21, 0.74],
    [0.44, 0.6, 0.22, 0.68],
    [0.57, 0.59, 0.2, 0.64],
  ];
  for (const [x, y, r, a] of puffs) {
    const g = ctx.createRadialGradient(
      x * size,
      y * size,
      0,
      x * size,
      y * size,
      r * size,
    );
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(0.55, `rgba(255,255,255,${a * 0.35})`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  return new T.CanvasTexture(canvas);
}
