import * as T from "three";
import "./style.css";
import { portfolio, waitForPortfolioClick } from "./portfolio";
import grainUrl from "./assets/paper-grain.webp?url";
import skyUrl from "./assets/sunset-sky.webp?url";
import rippleUrl from "./assets/capillary-waves.webp?url";
import sandUrl from "./assets/seabed.webp?url";
import { createJellyfish } from "./jellyfish";
import { createDolphins } from "./dolphins";
import { createBowSpray } from "./bowSpray";
import { createSplash } from "./splash";
import { prepareSound } from "./sound";
import { createPaper } from "./paper";
import { createEnvironment } from "./environment";
import { createTether, createSeabedDetails } from "./tether";
import { wave, ease } from "./waves";

type Stage =
  | "intro"
  | "surface"
  | "descending"
  | "anchored"
  | "releasing"
  | "drift";
const canvas = document.querySelector<HTMLCanvasElement>("#ocean")!;
const button = document.querySelector<HTMLButtonElement>("#action")!;
const narration = document.querySelector<HTMLElement>("#narration")!;
const driftTitle = document.querySelector<HTMLHeadingElement>("#drift-title")!;
const motion = matchMedia("(prefers-reduced-motion: reduce)");

async function start() {
  const sound = prepareSound();
  const clicked = waitForPortfolioClick(sound.start);
  const renderer = new T.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setClearColor(0x000000, 0);
  const loader = new T.TextureLoader();
  const [sky, ripples, sand, grain] = await Promise.all(
    [skyUrl, rippleUrl, sandUrl, grainUrl].map((url) => loader.loadAsync(url)),
  );
  for (const texture of [ripples, sand, grain]) {
    texture.wrapS = texture.wrapT = T.RepeatWrapping;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  }
  const print = new T.CanvasTexture(await clicked);
  print.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const scene = new T.Scene(),
    camera = new T.PerspectiveCamera(39, 1, 0.07, 2600);
  const mirror = new T.PerspectiveCamera();
  const reflection = new T.WebGLRenderTarget(640, 360, {
    minFilter: T.LinearFilter,
    magFilter: T.LinearFilter,
  });
  const transmission = new T.WebGLRenderTarget(640, 360);
  const env = createEnvironment(
    sky,
    ripples,
    sand,
    camera,
    reflection,
    transmission,
  );
  scene.add(env.background, env.water);
  const paper = createPaper(print, grain),
    boat = new T.Group();
  boat.add(paper.mesh);
  scene.add(boat);
  paper.mesh.layers.enable(1);
  const splash = createSplash(scene);
  const bowSpray = createBowSpray(scene);
  let dolphins: Awaited<ReturnType<typeof createDolphins>> | undefined;
  createDolphins(scene, env.uniforms.uBreaches.value)
    .then((update) => {
      dolphins = update;
    })
    .catch((error) => {
      console.warn("The dolphin model could not be loaded.", error);
    });
  const jellyfish = createJellyfish(scene);
  paper.fold(1);
  const probe = new T.Raycaster(
    new T.Vector3(-2.12, 0.58, 4),
    new T.Vector3(0, 0, -1),
  );
  const surface = probe.intersectObject(paper.mesh)[0];
  const tether = createTether(scene, boat, surface, env.uniforms);
  paper.fold(0);
  const details = createSeabedDetails(scene);
  scene.add(new T.HemisphereLight(0xffe5c6, 0x679a98, 1.7));
  const sun = new T.DirectionalLight(0xffdbad, 2.7);
  sun.position.set(-4, 8, 1);
  scene.add(sun);
  const rim = new T.DirectionalLight(0x9cdbdc, 1.35);
  rim.position.set(5, 2, -4);
  scene.add(rim);
  scene.traverse((object) => {
    if (object instanceof T.Light) object.layers.enable(2);
  });
  env.uniforms.uAnchor.value.copy(tether.anchor.position);
  const look = new T.Vector3(),
    sheetPos = new T.Vector3();
  const onWater = new T.Vector3(),
    boatRotation = new T.Quaternion(),
    sheetRotation = new T.Quaternion();
  const rot = new T.Euler();
  let stage: Stage = "intro",
    age = 0,
    time = 0,
    last = 0,
    started = false,
    releaseElapsed = 0;
  let keyboardAction = false,
    reduced = motion.matches,
    breakDelay = 0.75;
  let releaseWaveTime = 0,
    atBreakX = 0,
    atBreakZ = 0;
  let stageDuration = 0;
  function setStage(s: Stage, duration = 0) {
    stage = s;
    age = 0;
    stageDuration = duration;
    canvas.dataset.stage = s;
    driftTitle.hidden = s !== "drift";
    button.hidden = button.disabled = !(s === "surface" || s === "anchored");
    if (s === "surface" || s === "anchored") {
      const below = s === "anchored";
      button.querySelector("span")!.textContent = below
        ? "Let go"
        : "Look beneath";
      document.querySelector("#ripple")!.toggleAttribute("hidden", below);
      document
        .querySelector("#release-icon")!
        .toggleAttribute("hidden", !below);
      if (keyboardAction) button.focus({ preventScroll: true });
    }
    const descriptions: Record<Stage, string> = {
      intro:
        "Niklas’s portfolio becomes a sheet of paper and folds into a boat.",
      surface: "The folded portfolio rocks on a chain in the sunset.",
      descending: "The view descends through the water.",
      anchored:
        "A chain joins the boat to an iron anchor resting on the sunlit sand.",
      releasing: "The boat pulls against its chain until the bow link snaps.",
      drift:
        "The boat rides the open swells, leaving a foamy wake as dolphins breach in the distance.",
    };
    canvas.setAttribute("aria-label", descriptions[s]);
    if (s !== "intro") narration.textContent = descriptions[s];
  }
  function activate(event: MouseEvent) {
    if (button.disabled) return;
    keyboardAction = event.detail === 0;
    if (stage === "surface") setStage("descending", reduced ? 0.85 : 3.55);
    else if (stage === "anchored") {
      breakDelay = reduced ? 0.96 : 2.25;
      sound.pullChain(breakDelay);
      releaseElapsed = 0;
      releaseWaveTime = 0;
      setStage("releasing", reduced ? 4.5 : 8.6);
    }
  }
  button.addEventListener("click", activate);
  button.addEventListener("keydown", (e) => {
    if (e.repeat && (e.key === "Enter" || e.key === " ")) e.preventDefault();
  });
  motion.addEventListener("change", (e) => {
    reduced = e.matches;
  });
  const cursor = new T.Vector2(),
    filteredCursor = new T.Vector2();
  window.addEventListener("pointermove", (e) => {
    if (e.pointerType === "mouse")
      cursor.set(
        (2 * e.clientX) / window.innerWidth - 1,
        1 - (2 * e.clientY) / window.innerHeight,
      );
  });
  document.addEventListener("pointerleave", () => cursor.set(0, 0));
  window.addEventListener("blur", () => cursor.set(0, 0));
  let w = 1,
    h = 1;
  function resize() {
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    renderer.setPixelRatio(
      Math.min(devicePixelRatio, 1.65, Math.sqrt(2450000 / (w * h))),
    );
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    reflection.setSize(
      Math.max(120, Math.round(w * 0.48)),
      Math.max(160, Math.round(h * 0.48)),
    );
    transmission.setSize(Math.round(w * 0.7), Math.round(h * 0.7));
  }
  new ResizeObserver(resize).observe(canvas);
  resize();
  const pullDuration = reduced ? 0.42 : 0.88;
  let landed = false,
    sinceImpact = 0;
  setStage("intro", (reduced ? 3 : 4.5) + pullDuration);
  function frame(stamp: number) {
    requestAnimationFrame(frame);
    if (document.hidden) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.12, (stamp - last) / 1000) : 0;
    last = stamp;
    if (started) age += dt;
    time += dt * (reduced ? 0.42 : 1);
    if (stage === "intro" && age >= stageDuration) setStage("surface");
    if (stage === "descending" && age >= stageDuration) setStage("anchored");
    if (stage === "releasing" && age >= stageDuration) setStage("drift");
    const released = stage === "releasing" || stage === "drift";
    if (released) releaseElapsed += dt;
    const freedFor = released ? releaseElapsed - breakDelay : -1;
    const pause = reduced ? 0.69 : 2.15,
      climb = reduced ? 0.89 : 2.8;
    let dive =
      stage === "descending"
        ? ease(0, stageDuration, age)
        : stage === "anchored"
          ? 1
          : 0;
    if (released) dive = 1 - ease(pause, pause + climb, freedFor);
    sound.setDepth(dive);
    const pull = stage === "intro" ? ease(0, pullDuration, age) : 1;
    const intro =
      stage === "intro"
        ? Math.max(0, age - pullDuration) / (stageDuration - pullDuration)
        : 1;
    // The fold is several metres from the lens. Reserve depth precision for
    // its thin layers, then restore close water rendering before touchdown.
    const nearClip = T.MathUtils.lerp(1.8, 0.07, ease(0.6, 0.71, intro));
    if (camera.near !== nearClip) {
      camera.near = nearClip;
      camera.updateProjectionMatrix();
    }
    const fold = Math.min(1, intro / 0.6);
    const duration = stage === "intro" ? stageDuration - pullDuration : 1,
      fallTime = reduced ? 0.36 : 0.62;
    const impactAge = landed
      ? sinceImpact + dt
      : (intro - 0.637) * duration - fallTime;
    sinceImpact = impactAge;
    const fall = Math.min(1, Math.max(0, 1 + impactAge / fallTime));
    const land = fall * fall;
    const tension = released ? ease(0, breakDelay * 0.81, releaseElapsed) : 0;
    const follow = released ? ease(0.3, reduced ? 2.0 : 4.7, freedFor) : 0;
    const swell = follow * (reduced ? 0.39 : 1);
    const aspect = camera.aspect,
      tan = Math.tan(T.MathUtils.degToRad(camera.fov * 0.5));
    const narrow = 1 - ease(0.7, 1.35, aspect);
    const surfaceZ = Math.max(9.85, 5.98 / (2 * tan * aspect));
    const splitZ = reduced
      ? Math.max(surfaceZ + 0.23, 6.34 / (2 * tan * aspect))
      : Math.max(11.8, 6.47 / (2 * tan * aspect));
    let bx = 1.93 + 0.065 * Math.sin(time * 0.51),
      bz = 0.045 * Math.sin(time * 0.76);
    bx -= tension * (reduced ? 0.54 : 1.0);
    bz -= tension * 0.46;
    if (freedFor >= 0) {
      if (!releaseWaveTime) {
        releaseWaveTime = time;
        sound.release();
        atBreakX = bx;
        atBreakZ = bz;
      }
      const distance =
        (reduced ? 1.15 : 2.85) *
        (freedFor - 0.65 * (1 - Math.exp(-freedFor / 0.65)));
      bx = atBreakX - 0.91 * distance;
      bz = atBreakZ - 0.42 * distance;
    }
    const baseCamX = T.MathUtils.lerp(
      T.MathUtils.lerp(-0.43, 1.36, narrow),
      T.MathUtils.lerp(-0.12, 1.14, narrow),
      dive,
    );
    const chaseZ = Math.max(10.6, 5.95 / (2 * tan * aspect));
    let cz = T.MathUtils.lerp(
      T.MathUtils.lerp(surfaceZ, splitZ, dive),
      bz + chaseZ,
      follow,
    );
    const centerH = wave(bx, bz, time, swell);
    let cy =
      T.MathUtils.lerp(
        1.46 + (1 - ease(0.64, 0.89, intro)) * 2.1,
        reduced ? 1.05 : 0.68,
        dive,
      ) *
        (1 - follow) +
      follow * (3.03 + centerH * 0.9);
    let cx = T.MathUtils.lerp(
      baseCamX,
      bx - chaseZ * tan * aspect * (0.31 - 0.12 * narrow),
      follow,
    );
    filteredCursor.lerp(cursor, 1 - Math.exp(-dt * 4));
    const motionWeight = reduced ? 0 : 1;
    const orbit = motionWeight * Math.sin(Math.PI * fold) * 0.96;
    const sway =
      motionWeight *
      (0.068 * Math.sin(time * 0.63) + 0.19 * follow * Math.sin(time * 0.83));
    const offsetX = orbit + sway + filteredCursor.x * 0.54 * motionWeight;
    const offsetY =
      motionWeight *
      (filteredCursor.y * 0.24 +
        0.1 * Math.sin(time * 0.84) +
        0.22 * Math.sin(Math.PI * fold));
    cx += offsetX;
    cy += offsetY;
    cz +=
      motionWeight *
      (0.18 * Math.sin(time * 0.51) * follow - 0.32 * Math.sin(Math.PI * fold));
    // Sightline above intervening crests keeps the hull readable in the trough.
    let clearance = 0;
    if (follow > 0) {
      for (let j = 1; j <= 6; j++) {
        const fraction = j / 6,
          target = centerH + 0.64;
        const crest = wave(
          bx + (cx - bx) * fraction,
          bz + (cz - bz) * fraction,
          time,
          swell,
        );
        clearance = Math.max(
          clearance,
          (crest + 0.22 - target) / fraction + target - cy,
        );
      }
    }
    clearance *= follow;
    cy += clearance;
    camera.position.set(cx, cy, cz);
    const pitch = T.MathUtils.lerp(
      T.MathUtils.lerp(0.037, T.MathUtils.lerp(-0.137, -0.072, narrow), dive),
      -0.092,
      follow,
    );
    look.set(
      camera.position.x - offsetX * 0.72,
      cy - offsetY * 0.65 + (Math.tan(pitch) - clearance / chaseZ) * 10,
      cz - 10,
    );
    camera.lookAt(look);
    camera.updateMatrixWorld();
    const yaw = 0.295 + 0.027 * Math.sin(time * 0.47) - follow * 0.71;
    const h0 = centerH;
    const roll = Math.atan2(
      wave(bx + 1.25, bz, time, swell) - wave(bx - 1.25, bz, time, swell),
      2.5,
    );
    const pitchHull = -Math.atan2(
      wave(bx, bz + 0.55, time, swell) - wave(bx, bz - 0.55, time, swell),
      1.1,
    );
    onWater.set(bx, h0 - 0.16, bz);
    boatRotation.setFromEuler(
      rot.set(
        pitchHull,
        yaw,
        roll - 0.09 * tension * (1 - ease(0, 0.65, freedFor)),
        "ZXY",
      ),
    );
    // Start in the folding shot. The paper has its final physical scale from frame one.
    const sheetZ = cz - Math.max(9.2, 7.0 / (2 * tan * aspect));
    sheetPos.set(
      baseCamX,
      3.58 + 1.16 * ease(0.04, 0.25, fold) - 1.15 * ease(0.83, 1, fold),
      sheetZ,
    );
    boat.position.copy(sheetPos);
    const placement = ease(0.51, 0.74, intro);
    boat.position.x = T.MathUtils.lerp(sheetPos.x, bx, placement);
    boat.position.z = T.MathUtils.lerp(sheetPos.z, bz, placement);
    boat.position.y = T.MathUtils.lerp(sheetPos.y, onWater.y, land);
    if (impactAge >= 0 && impactAge < 2.2)
      boat.position.y -=
        0.37 * Math.sin(impactAge * 10) * Math.exp(-impactAge * 3.1);
    if (intro >= 1) boat.position.copy(onWater);
    sheetRotation.setFromEuler(
      rot.set(
        -0.18,
        -0.27,
        (Math.PI / 2) * (1 - ease(0.03, 0.39, intro)) - 0.04,
      ),
    );
    // Present the face of each pocket as it turns through a right angle.
    const diamondTurn =
      (Math.PI / 2) * (ease(0.52, 0.64, fold) - ease(0.71, 0.81, fold));
    sheetRotation.multiply(
      new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), diamondTurn),
    );
    boat.quaternion
      .copy(sheetRotation)
      .slerp(boatRotation, ease(0.51, 0.63, intro));
    if (pull < 1) {
      const direction = camera.getWorldDirection(new T.Vector3());
      const start = camera.position.clone().addScaledVector(direction, 4.6);
      boat.position.lerp(start, 1 - pull);
      const parallel = camera.quaternion
        .clone()
        .multiply(
          new T.Quaternion().setFromAxisAngle(
            new T.Vector3(0, 0, 1),
            Math.PI / 2,
          ),
        );
      boat.quaternion.slerp(parallel, 1 - pull);
      const cover = Math.max(
        (2 * 4.6 * tan) / paper.width,
        (2 * 4.6 * tan * aspect) / paper.height,
      );
      boat.scale.setScalar(T.MathUtils.lerp(cover, 1, pull));
    } else boat.scale.setScalar(1);
    paper.fold(fold);
    sound.fold(fold, duration * 0.6);
    boat.updateMatrixWorld(true);
    tether.update(time, freedFor, impactAge >= 0, tension, reduced);
    splash(impactAge, onWater, reduced, canvas.height);
    if (!landed && impactAge >= 0) {
      landed = true;
      sound.land();
    }
    details.update(dive, time);
    jellyfish(dive, time);
    if (stage === "drift")
      dolphins?.(dt, time, camera, swell, reduced, canvas.height);
    bowSpray(dt, time, boat, follow, swell, reduced);
    const un = env.uniforms;
    un.uViewProjection.value.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    );
    un.uTime.value = time;
    un.uSwell.value = swell;
    un.uWake.value = ease(0, 2, freedFor);
    un.uImpact.value = impactAge;
    un.uDive.value = dive;
    un.uContact.value = land;
    un.uCamera.value.copy(camera.position);
    un.uBoat.value.copy(onWater);
    un.uAspect.value = aspect;
    un.uTan.value = tan;
    un.uCut.value =
      cz - T.MathUtils.lerp(0.12, splitZ * (reduced ? 0.68 : 0.65), dive);
    un.uSun.value
      .set(-Math.min(0.294, aspect * tan * 0.39), 0.054, -1)
      .normalize();
    if (land > 0.015) {
      mirror.copy(camera, false);
      mirror.layers.set(1);
      const mirrorHeight = centerH * follow;
      mirror.position.y = 2 * mirrorHeight - cy;
      mirror.lookAt(look.x, 2 * mirrorHeight - look.y, look.z);
      mirror.updateMatrixWorld();
      un.uReflectMatrix.value.multiplyMatrices(
        mirror.projectionMatrix,
        mirror.matrixWorldInverse,
      );
      renderer.setRenderTarget(reflection);
      renderer.render(scene, mirror);
      renderer.setRenderTarget(null);
    }
    if (dive > 0.001) {
      camera.layers.set(2);
      renderer.setRenderTarget(transmission);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      camera.layers.set(0);
    }
    renderer.render(scene, camera);
    if (!started) {
      portfolio.hidden = true;
      document.querySelector("main")!.removeAttribute("aria-hidden");
      canvas.tabIndex = -1;
      canvas.focus({ preventScroll: true });
    }
    started = true;
  }
  requestAnimationFrame(frame);
  document.addEventListener("visibilitychange", () => {
    last = 0;
  });
}
start().catch((error) => {
  console.error(error);
  const message = document.createElement("p");
  message.className = "error";
  message.textContent =
    "The ocean needs WebGL 2. Open this page in a browser with graphics acceleration enabled.";
  document.querySelector("main")!.append(message);
});
