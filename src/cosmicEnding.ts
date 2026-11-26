import * as T from "three";
import { createBlackHoleSky } from "./blackHoleSky";
import type { loadTelevision } from "./television";
import { ease } from "./waves";

// Move from the tracking shot to a wider composition. The plane keeps flying
// on its existing trajectory as the camera lets it drift across the frame.
const viewDirection = new T.Vector3(), viewRight = new T.Vector3();
const widePosition = new T.Vector3(), wideLook = new T.Vector3();
function glideDistance(aspect: number, tan: number) {
  return Math.max(24, 14.2 / (2 * tan * aspect));
}

export function frameLastLight(position: T.Vector3, sun: T.Vector3, aspect: number, tan: number,
  blend: number, eye: T.Vector3, look: T.Vector3) {
  const sunOffset = T.MathUtils.lerp(0.13, 0.25, ease(0.6, 1.25, aspect));
  const yaw = Math.atan2(-sun.x, -sun.z) + Math.atan(sunOffset * tan * aspect);
  viewDirection.set(-Math.sin(yaw), -0.012, -Math.cos(yaw)).normalize();
  viewRight.set(Math.cos(yaw), 0, -Math.sin(yaw));
  const back = glideDistance(aspect, tan);
  widePosition.copy(position).addScaledVector(viewDirection, -back)
    .addScaledVector(viewRight, 0.28 * back * tan * aspect);
  widePosition.y += 0.36 * back * tan;
  wideLook.copy(widePosition).addScaledVector(viewDirection, back);
  eye.lerp(widePosition, blend);
  look.lerp(wideLook, blend);
}

type Television = Awaited<ReturnType<typeof loadTelevision>>;

export function createCosmicEnding(tv: Television) {
  const scene = new T.Scene();
  const sky = createBlackHoleSky();
  const camera = new T.PerspectiveCamera(36, 1, 0.012, 180);
  const tan = Math.tan(T.MathUtils.degToRad(camera.fov / 2));
  const feedAspect = tv.screenWidth / tv.screenHeight;
  const feed = new T.WebGLRenderTarget(768, Math.round(768 / feedAspect), {
    minFilter: T.LinearFilter, magFilter: T.LinearFilter, samples: 2,
  });
  const cabinet = tv.object;
  cabinet.visible = true;
  cabinet.scale.setScalar(1);
  const fill = new T.HemisphereLight(0xc5d0dc, 0x334354, 0.95);
  const key = new T.DirectionalLight(0xffc48a, 3.6);
  key.position.set(5, 4, -1);
  const bounce = new T.DirectionalLight(0xd4e1f0, 1.1);
  bounce.position.set(-3, 2, 4);
  scene.add(sky.mesh, cabinet, fill, key, bounce);

  // At the far end of the fall the cabinet crosses behind the shadow.
  // A depth-only sphere masks it while leaving the ray-traced light intact.
  const occultation = new T.Mesh(new T.SphereGeometry(1, 48, 32),
    new T.MeshBasicMaterial({ colorWrite: false }));
  occultation.renderOrder = -10;
  scene.add(occultation);
  const center = new T.Vector2();
  const offset = new T.Vector3();
  let lastFeed = -Infinity;

  return {
    feedAspect,
    capture(renderer: T.WebGLRenderer, ocean: T.Scene, oceanCamera: T.Camera, elapsed: number) {
      if (elapsed - lastFeed < 1 / 24) return;
      lastFeed = elapsed;
      renderer.setRenderTarget(feed);
      renderer.render(ocean, oceanCamera);
      renderer.setRenderTarget(null);
    },
    render(renderer: T.WebGLRenderer, elapsed: number, reduced: boolean, aspect: number) {
      if (camera.aspect !== aspect) {
        camera.aspect = aspect;
        camera.updateProjectionMatrix();
      }
      const rate = reduced ? 1.58 : 1;
      const t = elapsed * rate;
      const reveal = ease(1.06, 6.8, t);
      const drift = ease(5.4, 10.9, t);
      const fall = ease(10.3, 15.4, t);
      const motion = reduced ? 0.42 : 1;
      // Frame the curved glass edge-to-edge at the cut. Dolly back on an
      // exponential distance curve so the close and wide shots both linger.
      const near = 0.76 * Math.min(tv.screenWidth / aspect, tv.screenHeight) / (2 * tan);
      const wide = Math.max(9.6, 8.3 / (2 * tan * aspect));
      const distance = near * Math.pow(wide / near, reveal) + 1.2 * drift;
      const depth = distance + tv.screenCenter.z + 97 * fall * fall;
      center.set(0.5 + 0.16 * Math.min(1, aspect), 0.54);
      const ox = (2 * center.x - 1) * tan * aspect;
      const oy = (2 * center.y - 1) * tan;
      const shortSide = Math.min(1, aspect);
      const hangX = (-0.42 + 0.08 * drift) * tan * aspect;
      const hangY = (0.04 + 0.18 * drift) * tan;
      const arc = Math.sin(Math.PI * fall);
      cabinet.rotation.set(
        reveal * (0.12 + 0.07 * drift) + motion * 0.58 * fall,
        reveal * (0.48 + motion * (0.20 * drift + 0.06 * Math.sin(t * 0.65))) + motion * 2.75 * fall,
        reveal * (0.065 + motion * 0.08 * drift) - motion * 0.97 * fall,
      );
      offset.copy(tv.screenCenter).applyQuaternion(cabinet.quaternion);
      cabinet.position.set(
        depth * (reveal * T.MathUtils.lerp(hangX, ox, fall) - 0.045 * arc * shortSide) - offset.x * (1 - reveal),
        depth * (reveal * T.MathUtils.lerp(hangY, oy, fall) + 0.105 * arc * shortSide) - offset.y * (1 - reveal),
        -depth,
      );
      cabinet.visible = t < 15.4;
      const shadowDepth = 77;
      occultation.position.set(ox * shadowDepth, oy * shadowDepth, -shadowDepth);
      occultation.scale.setScalar(shadowDepth * tan * shortSide * 0.068);
      tv.setSignal(feed.texture, elapsed, 1 - ease(0.85, 1.85, t), reduced);
      sky.update(renderer, elapsed * (reduced ? 0.2 : 1), center);
      renderer.render(scene, camera);
      return t >= 16.4;
    },
    dispose() {
      scene.remove(cabinet);
      occultation.geometry.dispose();
      occultation.material.dispose();
      feed.dispose();
      sky.dispose();
    },
  };
}
