import * as T from "three";
import "./style.css";
import { portfolio, waitForPortfolioClick } from "./portfolio";
import grainUrl from "./assets/paper-grain.webp?url";
import stormUrl from "./assets/storm-sky.webp?url";
import skyUrl from "./assets/sunset-sky.webp?url";
import rippleUrl from "./assets/capillary-waves.webp?url";
import sandUrl from "./assets/seabed.webp?url";
import swimUrl from "./assets/aurelia-swim.webp?url";
import { createJellyfish } from "./jellyfish";
import { createDolphins } from "./dolphins";
import { bakeHullMask } from "./hullMask";
import { createSeaMist } from "./seaMist";
import { createBreachSplashes } from "./breachSplash";
import { createBowSpray } from "./bowSpray";
import { createSplash } from "./splash";
import { prepareSound } from "./sound";
import { createPaper } from "./paper";
import { createPaperSprings, createFlexiblePaper } from "./paperFlex";
import { createPlane } from "./plane";
import { createPaperFlight, flightTiming } from "./paperFlight";
import starUrl from "../references/04-space.png?url";
import { createEnvironment } from "./environment";
import { createTether, createSeabedDetails } from "./tether";
import { wave, ease } from "./waves";

type Stage =
  | "intro"
  | "surface"
  | "descending"
  | "anchored"
  | "releasing"
  | "drift"
  | "transform"
  | "sheet"
  | "folding"
  | "flight";
const canvas = document.querySelector<HTMLCanvasElement>("#ocean")!;
const button = document.querySelector<HTMLButtonElement>("#action")!;
const narration = document.querySelector<HTMLElement>("#narration")!;
const driftHeadings =
  document.querySelectorAll<HTMLHeadingElement>(".drift-heading");
const landingTitle = document.querySelector<HTMLHeadingElement>("#landing-title")!;
const chainTitle = document.querySelector<HTMLHeadingElement>("#chain-title")!;
const releaseTitle = document.querySelector<HTMLHeadingElement>("#release-title")!;
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
  const atlasReady = loader.loadAsync(swimUrl).catch(() => null);
  const [sky, storm, ripples, sand, grain, stars] = await Promise.all(
    [skyUrl, stormUrl, rippleUrl, sandUrl, grainUrl, starUrl].map((url) => loader.loadAsync(url)),
  );
  for (const texture of [ripples, sand, grain]) {
    texture.wrapS = texture.wrapT = T.RepeatWrapping;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  }
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
    storm,
    ripples,
    sand,
    camera,
    reflection,
    transmission,
  );
  scene.add(env.background, env.water);
  const paper = createPaper(grain),
    boat = new T.Group();
  boat.add(paper.mesh);
  scene.add(boat);
  paper.mesh.layers.enable(1);
  paper.mesh.layers.enable(2);
  for (const key of ["uTide", "uTime", "uDive", "uSwell", "uClearing"] as const) {
    paper.uniforms[key] = env.uniforms[key];
  }
  const boatGeometry = paper.mesh.geometry;
  paper.uniforms.uStars.value = stars;
  const plane = createPlane();
  const springs = createPaperSprings();
  const flexPlane = createFlexiblePaper(plane.geometry, 12);
  let planePattern = false, flexStrength = 0, flexWind = 0;
  const splash = createSplash(scene);
  const seaMist = createSeaMist(scene, env.uniforms.uTide);
  const bowSpray = createBowSpray(scene, env.uniforms.uTide);
  const snapSplash = createBreachSplashes(scene, [env.uniforms.uSnap.value], env.uniforms.uTide, "Bow release", false);
  let dolphins: Awaited<ReturnType<typeof createDolphins>> | undefined;
  const atlas = await atlasReady;
  const jellyfish = atlas && createJellyfish(scene, atlas);
  paper.fold(1);
  const mask = bakeHullMask(renderer, paper.mesh.geometry);
  env.uniforms.uHullMask.value = mask.texture;
  env.uniforms.uHullBounds.value.copy(mask.bounds);
  env.uniforms.uHullLevels.value.copy(mask.levels);
  const probe = new T.Raycaster(
    new T.Vector3(-2.12, 0.58, 4),
    new T.Vector3(0, 0, -1),
  );
  const surface = probe.intersectObject(paper.mesh)[0];
  const tether = createTether(scene, boat, surface, env.uniforms);
  paper.fold(0);
  const details = createSeabedDetails(scene);
  const skylight = new T.HemisphereLight(0xffe5c6, 0x679a98, 1.7);
  const stormLight = new T.Color(0xb5c5d1), sunsetLight = skylight.color.clone();
  scene.add(skylight);
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
  const up = new T.Vector3(0, 1, 0),
    surfaceNormal = new T.Vector3(),
    heading = new T.Quaternion();
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
  let headingIndex = 0,
    headingSince = 0;
  let findOutShown = false;
  let chainTitleAge = 0;

  // Sky flight state (reused vectors & quaternions, zero per-frame allocations).
  const transStartPos = new T.Vector3(),
    transStartQuat = new T.Quaternion(),
    transCamStartPos = new T.Vector3(),
    transCamStartLook = new T.Vector3();
  const flatSwapQuat = new T.Quaternion().setFromEuler(
    new T.Euler(-0.93, -0.22, Math.PI / 2 - 0.14, "YXZ"),
  );
  const flight = createPaperFlight();
  let timing = flightTiming(reduced);
  let airAge = 0, foldStartedAt = Infinity;
  let shedWater = false;
  const trackedPosition = new T.Vector3(), foldCenter = new T.Vector3();
  const airAttitude = new T.Quaternion(), airEuler = new T.Euler();
  const departureDirection = new T.Vector3();
  const flightPosition = new T.Vector3(),
    planeQuat = new T.Quaternion(),
    planeForward = new T.Vector3(),
    planeRight = new T.Vector3(),
    planeUpVec = new T.Vector3(),
    planeBasis = new T.Matrix4(),
    rollQuat = new T.Quaternion(),
    camGoalPos = new T.Vector3(),
    camGoalLook = new T.Vector3(),
    projected = new T.Vector3(),
    sunDir = new T.Vector3();

  // Orient plane.ts mesh: local -Y is nose (forward), +Z is dorsal (up), +X is left wing.
  function orientPlane(vx: number, vy: number, vz: number, bank: number) {
    planeForward.set(vx, vy, vz);
    if (planeForward.lengthSq() < 1e-6) planeForward.set(-0.22, 0, -1);
    planeForward.normalize();
    planeRight.crossVectors(planeForward, up);
    if (planeRight.lengthSq() < 1e-6) planeRight.set(1, 0, 0);
    planeRight.normalize();
    planeUpVec.crossVectors(planeRight, planeForward).normalize();
    planeRight.negate();
    planeForward.negate();
    planeBasis.makeBasis(planeRight, planeForward, planeUpVec);
    planeQuat.setFromRotationMatrix(planeBasis);
    if (bank !== 0) {
      planeForward.negate();
      rollQuat.setFromAxisAngle(planeForward, bank);
      planeQuat.premultiply(rollQuat);
    }
  }

  function reflectPaper(height: number) {
    const un = env.uniforms;
    un.uMirrorHeight.value = height;
    mirror.copy(camera, false);
    mirror.layers.set(1);
    mirror.position.y = 2 * height - camera.position.y;
    mirror.lookAt(look.x, 2 * height - look.y, look.z);
    mirror.updateMatrixWorld();
    un.uReflectMatrix.value.multiplyMatrices(mirror.projectionMatrix, mirror.matrixWorldInverse);
    renderer.setRenderTarget(reflection);
    renderer.render(scene, mirror);
    renderer.setRenderTarget(null);
  }

  function setStage(s: Stage, duration = 0) {
    stage = s;
    age = 0;
    stageDuration = duration;
    canvas.dataset.stage = s;
    if (s === "intro") {
      snapSplash.clear();
      landingTitle.hidden = true;
      landingTitle.style.opacity = "";
      chainTitle.hidden = true;
      chainTitle.style.opacity = "";
      releaseTitle.hidden = true;
      releaseTitle.style.opacity = "";
    }
    if (s === "drift") {
      driftHeadings[0].hidden = false;
      headingIndex = 0;
      headingSince = 0;
      sound.settleOcean();
      sound.cue("title");
    }
    if (s === "descending") {
      sound.cue("dive");
      landingTitle.hidden = true;
      landingTitle.style.opacity = "";
      chainTitle.hidden = false;
      chainTitle.style.opacity = "";
      chainTitleAge = 0;
    }
    if (s === "releasing") {
      chainTitle.hidden = true;
      chainTitle.style.opacity = "";
      releaseTitle.hidden = false;
      releaseTitle.style.opacity = "";
    }
    if (s === "surface") {
      sound.storm(reduced ? 0.7 : 2.4);
      landingTitle.hidden = false;
      landingTitle.style.opacity = "";
    }
    if (s === "surface" || s === "anchored") sound.cue("arrival");
    if (s === "transform") {
      airAge = 0;
      foldStartedAt = Infinity;
      transStartPos.copy(boat.position);
      transStartQuat.copy(boat.quaternion);
      transCamStartPos.copy(camera.position);
      transCamStartLook.copy(look);
      departureDirection.copy(sunDir).setY(0).normalize();
      const freedFor = Math.max(0, releaseElapsed - breakDelay);
      const entrySpeed = (reduced ? 1.15 : 2.85) * (1 - Math.exp(-freedFor / 0.65));
      flight.reset(boat.position, entrySpeed);
      trackedPosition.copy(boat.position);
      springs.reset();
      shedWater = false;
      sound.takeoff(duration);
    }
    const showAction = s === "surface" || s === "anchored" || s === "drift" || s === "sheet";
    button.hidden = button.disabled = !showAction;
    if (showAction) {
      const below = s === "anchored";
      const skipping = s === "drift";
      const readyToFold = s === "sheet";
      button.querySelector("span")!.textContent = skipping
        ? "Skip"
        : readyToFold ? "Fold into a plane" : below ? "Let go" : "Look beneath";
      document
        .querySelector("#ripple")!
        .toggleAttribute("hidden", below || skipping || readyToFold);
      document
        .querySelector("#release-icon")!
        .toggleAttribute("hidden", !below);
      document.querySelector("#findout-icon")!.toggleAttribute("hidden", !readyToFold);
      document.querySelector("#skip-icon")!.toggleAttribute("hidden", !skipping);
      if (keyboardAction && !skipping) button.focus({ preventScroll: true });
    }
    const descriptions: Record<Stage, string> = {
      intro:
        "Niklas’s portfolio becomes a sheet of paper and folds into a boat.",
      surface: "The folded portfolio rocks on a chain beneath low storm clouds.",
      descending: "The water rises around the bow as the chain draws taut.",
      anchored:
        "A taut chain holds the bow partly underwater above an iron anchor on the sand.",
      releasing: "The bow link snaps. The boat springs back through a splash as the loose chain sinks.",
      drift:
        "The boat rides the open swells, leaving a foamy wake as dolphins breach in the distance.",
      transform:
        "The boat jumps clear of the water and unfolds into a sheet of paper.",
      sheet: "The wind carries the loose sheet over the ocean.",
      folding: "The sheet folds into a paper airplane as it flies.",
      flight:
        "The paper airplane glides over the ocean toward the setting sun.",
    };
    canvas.setAttribute("aria-label", descriptions[s]);
    if (s !== "intro") narration.textContent = descriptions[s];
  }

  function showFindOut() {
    findOutShown = true;
    button.querySelector("span")!.textContent = "Find out";
    document.querySelector("#ripple")!.toggleAttribute("hidden", true);
    document.querySelector("#release-icon")!.toggleAttribute("hidden", true);
    document.querySelector("#skip-icon")!.toggleAttribute("hidden", true);
    document.querySelector("#findout-icon")!.toggleAttribute("hidden", false);
    button.hidden = button.disabled = false;
    if (keyboardAction) button.focus({ preventScroll: true });
  }

  function skipToWhatComesNext() {
    if (stage !== "drift" || headingIndex >= 7) return;
    button.disabled = true;
    button.hidden = true;
    driftHeadings.forEach((h, i) => {
      if (i < 7) {
        h.hidden = true;
        h.style.opacity = "";
      }
    });
    headingIndex = 7;
    headingSince = age;
    const next = driftHeadings[7];
    next.style.opacity = "";
    next.hidden = false;
    sound.cue("title", 7);
    narration.textContent = next.innerText.replace(/\s+/g, " ").trim();
  }

  function activate(event: MouseEvent) {
    if (button.disabled) return;
    if (stage !== "sheet") sound.click();
    keyboardAction = event.detail === 0;
    if (stage === "surface") setStage("descending", reduced ? 0.85 : 3.55);
    else if (stage === "anchored") {
      breakDelay = reduced ? 0.96 : 2.25;
      sound.pullChain(breakDelay);
      releaseElapsed = 0;
      releaseWaveTime = 0;
      setStage("releasing", reduced ? 4.5 : 8.6);
    } else if (stage === "drift" && headingIndex < 7) {
      skipToWhatComesNext();
    } else if (stage === "drift" && findOutShown) {
      timing = flightTiming(reduced);
      setStage("transform", timing.openEnd);
    } else if (stage === "sheet") {
      foldStartedAt = airAge;
      setStage("folding", timing.foldDuration);
    }
  }
  button.addEventListener("click", activate);
  button.addEventListener("pointerenter", () => {
    if (!button.disabled && stage !== "sheet") sound.cue("hover");
  });
  button.addEventListener("focus", () => {
    if (!button.disabled && stage !== "sheet") sound.cue("hover");
  });
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
  // Prepare the display, reflection and underwater variants while the HTML
  // portfolio covers the canvas. A one-pixel draw also uploads geometry and
  // textures that shader compilation alone would leave until first use.
  await renderer.compileAsync(scene, camera);
  const hidden: T.Object3D[] = [],
    culled: T.Object3D[] = [];
  scene.traverse((object) => {
    if (!object.visible) {
      hidden.push(object);
      object.visible = true;
    }
    if (object.frustumCulled) {
      culled.push(object);
      object.frustumCulled = false;
    }
  });
  function primePass(layer: number, target: T.WebGLRenderTarget | null) {
    camera.layers.set(layer);
    renderer.setRenderTarget(target);
    renderer.setScissor(0, 0, 1, 1);
    renderer.setScissorTest(true);
    renderer.render(scene, camera);
  }
  const scissor = renderer.getScissor(new T.Vector4());
  primePass(1, reflection);
  primePass(2, transmission);
  primePass(0, null);
  renderer.setScissorTest(false);
  renderer.setScissor(scissor);
  for (const object of hidden) object.visible = false;
  for (const object of culled) object.frustumCulled = true;

  const print = new T.CanvasTexture(await clicked);
  print.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  paper.mesh.material.uniforms.uPrint.value = print;
  createDolphins(scene, env.uniforms.uBreaches.value, seaMist)
    .then((update) => {
      dolphins = update;
    })
    .catch((error) => {
      console.warn("The dolphin model could not be loaded.", error);
    });
  const pullDuration = reduced ? 0.42 : 0.88;
  let landed = false,
    sinceImpact = 0;
  setStage("intro", (reduced ? 3 : 4.5) + pullDuration);
  let returning = false,
    returned = false,
    returnAge = 0;
  const returnPosition = new T.Vector3(),
    returnRotation = new T.Quaternion(),
    returnScale = new T.Vector3();
  let returnFold = 0, returnFlightLight = 0;
  const boatPicker = new T.Raycaster();
  const unfoldingScene = new T.Scene();
  const pointer = new T.Vector2();
  function hitsBoat(x: number, y: number) {
    const bounds = canvas.getBoundingClientRect();
    pointer.set(
      ((x - bounds.left) / bounds.width) * 2 - 1,
      1 - ((y - bounds.top) / bounds.height) * 2,
    );
    boatPicker.setFromCamera(pointer, camera);
    // The folding geometry moves every frame, so its cached bounds are stale.
    paper.mesh.geometry.computeBoundingSphere();
    if (boatPicker.intersectObject(paper.mesh).length) return true;
    if (!planePattern) return false;
    projected.copy(boat.position).project(camera);
    const sx = (projected.x * 0.5 + 0.5) * bounds.width + bounds.left;
    const sy = (-projected.y * 0.5 + 0.5) * bounds.height + bounds.top;
    return projected.z < 1 && Math.hypot(x - sx, y - sy) < 56;
  }
  function unfold() {
    if (!started || returning || returned) return;
    returning = true;
    canvas.dataset.stage = "unfolding";
    returnPosition.copy(boat.position);
    returnRotation.copy(boat.quaternion);
    returnScale.copy(boat.scale);
    returnFold = paper.uniforms.uFold.value;
    returnFlightLight = paper.uniforms.uFlight.value;
    button.hidden = button.disabled = true;
    driftHeadings.forEach((title) => {
      title.hidden = true;
    });
    sound.returnToPortfolio();
    sound.cue("paper");
    sound.unfold(returnFold, reduced ? 0.75 : 2.7);
    narration.textContent = "The paper opens into Niklas’s portfolio.";
    canvas.style.cursor = "default";
  }
  canvas.tabIndex = 0;
  canvas.setAttribute(
    "aria-description",
    "Click the paper, or press Enter here, to unfold the portfolio.",
  );
  canvas.addEventListener("click", (event) => {
    if (hitsBoat(event.clientX, event.clientY)) unfold();
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!returning && !returned)
      canvas.style.cursor = hitsBoat(event.clientX, event.clientY)
        ? "pointer"
        : "";
  });
  canvas.addEventListener("keydown", (event) => {
    if (!event.repeat && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      unfold();
    }
  });

  function frame(stamp: number) {
    if (returned) return;
    requestAnimationFrame(frame);
    if (document.hidden) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.12, (stamp - last) / 1000) : 0;
    last = stamp;
    if (returning) {
      returnAge += dt;
      const duration = reduced ? 0.75 : 2.7;
      const progress = Math.min(1, returnAge / duration);
      const lift = ease(0, 0.7, progress);
      const flatten = ease(0.15, 0.83, progress);
      const direction = camera.getWorldDirection(new T.Vector3());
      const destination = camera.position
        .clone()
        .addScaledVector(direction, 4.6);
      const parallel = camera.quaternion
        .clone()
        .multiply(
          new T.Quaternion().setFromAxisAngle(
            new T.Vector3(0, 0, 1),
            Math.PI / 2,
          ),
        );
      boat.position.copy(returnPosition).lerp(destination, lift);
      boat.quaternion.copy(returnRotation).slerp(parallel, lift);
      const tan = Math.tan(T.MathUtils.degToRad(camera.fov * 0.5));
      const cover = Math.max(
        (2 * 4.6 * tan) / paper.width,
        (2 * 4.6 * tan * camera.aspect) / paper.height,
      );
      boat.scale
        .copy(returnScale)
        .lerp(new T.Vector3(cover, cover, cover), ease(0.72, 1, progress));
      if (planePattern) {
        const amount = returnFold * (1 - flatten);
        plane.fold(amount);
        paper.uniforms.uFold.value = amount;
        paper.mesh.geometry = flexPlane(springs.bend, flexStrength * (1 - flatten), time, flexWind * (1 - flatten));
      } else paper.fold(returnFold * (1 - flatten));
      paper.uniforms.uAirLight.value = flexStrength * (1 - flatten);
      paper.uniforms.uFlight.value = returnFlightLight * (1 - flatten);
      boat.updateMatrixWorld(true);
      // Bring the sheet forward through the waterline without clipping its opening panels.
      camera.near = 0.07;
      camera.updateProjectionMatrix();
      renderer.clear();
      const autoClear = renderer.autoClear;
      renderer.autoClear = false;
      paper.mesh.visible = false;
      renderer.render(scene, camera);
      paper.mesh.visible = true;
      renderer.clearDepth();
      unfoldingScene.add(boat);
      renderer.render(unfoldingScene, camera);
      scene.add(boat);
      renderer.autoClear = autoClear;
      if (progress === 1) {
        returned = true;
        canvas.dataset.stage = "portfolio";
        portfolio.hidden = false;
        document.querySelector<HTMLElement>("main")!.hidden = true;
        portfolio
          .querySelector<HTMLAnchorElement>("a")
          ?.focus({ preventScroll: true });
        void waitForPortfolioClick(() => {
          sound.start();
          sound.click();
        }).then((image) => {
          const previousPrint = paper.mesh.material.uniforms.uPrint.value;
          const nextPrint = new T.CanvasTexture(image);
          nextPrint.anisotropy = print.anisotropy;
          paper.mesh.material.uniforms.uPrint.value = nextPrint;
          previousPrint?.dispose();
          returning = returned = false;
          planePattern = false;
          returnAge = 0;
          landed = false;
          sinceImpact = 0;
          releaseElapsed = releaseWaveTime = 0;
          headingIndex = headingSince = 0;
          findOutShown = false;
          paper.mesh.visible = true;
          flexStrength = flexWind = 0;
          paper.mesh.geometry = boatGeometry;
          paper.uniforms.uFlight.value = paper.uniforms.uAirLight.value = 0;
          plane.fold(0);
          driftHeadings.forEach((title) => {
            title.hidden = true;
            title.style.opacity = "";
          });
          started = false;
          last = 0;
          document.querySelector<HTMLElement>("main")!.hidden = false;
          resize();
          setStage("intro", (reduced ? 3 : 4.5) + pullDuration);
          requestAnimationFrame(frame);
        });
      }
      return;
    }
    if (started) age += dt;
    time += dt * (reduced ? 0.42 : 1);
    env.uniforms.uSkyMotion.value = reduced ? 0.15 : 1;
    const cloudTime = time * env.uniforms.uSkyMotion.value;
    sun.intensity =
      2.7 *
      (0.94 +
        0.04 * Math.sin(cloudTime * 0.083) +
        0.02 * Math.sin(cloudTime * 0.137 + 0.8));
    if (stage === "intro" && age >= stageDuration) setStage("surface");
    if (stage === "descending" && age >= stageDuration) setStage("anchored");
    if (stage === "releasing" && age >= stageDuration) setStage("drift");
    if (stage === "transform" && age >= stageDuration) setStage("sheet");
    if (stage === "folding" && age >= stageDuration) setStage("flight");

    if (!chainTitle.hidden) {
      if (stage === "descending" || stage === "anchored") {
        chainTitleAge += dt;
        const hold = reduced ? 2.4 : 5.4,
          fade = reduced ? 0.5 : 0.9;
        const progress = ease(hold, hold + fade, chainTitleAge);
        chainTitle.style.opacity = String(1 - progress);
        if (progress >= 1) chainTitle.hidden = true;
      } else {
        chainTitle.hidden = true;
        chainTitle.style.opacity = "";
      }
    }

    if (!landingTitle.hidden) {
      if (stage !== "surface") {
        landingTitle.hidden = true;
        landingTitle.style.opacity = "";
      } else {
        const hold = reduced ? 1.8 : 3.6,
          fade = reduced ? 0.45 : 0.8;
        const progress = ease(hold, hold + fade, age);
        landingTitle.style.opacity = String(1 - progress);
        if (progress >= 1) landingTitle.hidden = true;
      }
    }

    if (stage === "releasing" && !releaseTitle.hidden) {
      const hold = reduced ? 1.5 : 3.1,
        fade = reduced ? 0.45 : 0.75;
      const progress = ease(hold, hold + fade, age);
      releaseTitle.style.opacity = String(1 - progress);
      if (progress >= 1) releaseTitle.hidden = true;
    }

    if (stage === "drift" && headingIndex < 7 && age - headingSince >= 3.5) {
      const current = driftHeadings[headingIndex];
      const fade = reduced ? 1 : ease(3.5, 4, age - headingSince);
      current.style.opacity = String(1 - fade);
      if (fade === 1) {
        current.hidden = true;
        const next = driftHeadings[++headingIndex];
        next.hidden = false;
        headingSince = age;
        if (headingIndex === 7) {
          button.disabled = true;
          button.hidden = true;
        }
        if (next.textContent?.trim()) sound.cue("title", headingIndex);
        narration.textContent = next.innerText.replace(/\s+/g, " ").trim();
      }
    } else if (stage === "drift" && headingIndex === 7 && !findOutShown) {
      const hold = reduced ? 1.4 : 2.8;
      if (age - headingSince >= hold) {
        const current = driftHeadings[7];
        const fade = reduced ? 1 : ease(hold, hold + 0.5, age - headingSince);
        current.style.opacity = String(1 - fade);
        if (fade >= 1) {
          current.hidden = true;
          showFindOut();
        }
      }
    }

    const skyChapter = stage === "transform" || stage === "sheet" || stage === "folding" || stage === "flight";
    const aspect = camera.aspect,
      tan = Math.tan(T.MathUtils.degToRad(camera.fov * 0.5));
    const narrow = 1 - ease(0.7, 1.35, aspect);
    filteredCursor.lerp(cursor, 1 - Math.exp(-dt * 4));
    const motionWeight = reduced ? 0 : 1;
    // Align sun vector with the photographic sunset sun on the horizon.
    const sunX = -Math.min(0.294, aspect * tan * 0.39);
    sunDir.set(sunX, 0.054, -1).normalize();

    if (!skyChapter) {
      const released = stage === "releasing" || stage === "drift";
      if (released) releaseElapsed += dt;
      const freedFor = released ? releaseElapsed - breakDelay : -1;
      const clearing = ease(0, reduced ? 3 : 8, freedFor);
      env.uniforms.uClearing.value = clearing;
      skylight.color.lerpColors(stormLight, sunsetLight, clearing);
      sun.intensity *= T.MathUtils.lerp(0.28, 1, clearing);
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
      const tide = 0.76 * ease(0.04, 0.94, dive);
      env.uniforms.uTide.value = tide;
      const load = ease(0.12, 0.72, tide);
      const strain = released ? ease(0, breakDelay * 0.81, releaseElapsed) : 0;
      const tension = load * (0.9 + 0.1 * strain);
      // Buoyancy lifts the hull as the sea rises until the chain runs taut.
      // Once the link parts, the bow springs past equilibrium and rocks back.
      const damping = freedFor < 0 ? 1 : Math.exp(-3.25 * freedFor);
      const rebound = freedFor < 0 ? 0 : damping * Math.sin(8 * freedFor);
      const held = freedFor < 0 ? 1 : damping * Math.cos(8 * freedFor) + 0.40625 * rebound;
      const recoil = rebound * (reduced ? 0.48 : 1);
      const justBroke = freedFor >= 0 && !releaseWaveTime;
      const follow = released ? ease(0.3, reduced ? 2.0 : 4.7, freedFor) : 0;
      const swell = follow * (reduced ? 0.39 : 1);
      const surfaceZ = Math.max(9.85, 5.98 / (2 * tan * aspect));
      const splitZ = reduced
        ? Math.max(surfaceZ + 0.23, 6.34 / (2 * tan * aspect))
        : Math.max(11.8, 6.47 / (2 * tan * aspect));
      let bx = 1.93 + 0.065 * Math.sin(time * 0.51),
        bz = 0.045 * Math.sin(time * 0.76);
      bx += 0.22 * load - strain * (reduced ? 0.18 : 0.36);
      bz += 0.12 * load - strain * 0.18;
      if (freedFor >= 0) {
        if (justBroke) {
          releaseWaveTime = time;
          sound.release();
          sound.calmStorm(reduced ? 1.6 : 8.5);
          atBreakX = bx;
          atBreakZ = bz;
        }
        const distance =
          (reduced ? 1.15 : 2.85) *
          (freedFor - 0.65 * (1 - Math.exp(-freedFor / 0.65)));
        bx = atBreakX - 0.91 * distance - 0.65 * recoil;
        bz = atBreakZ - 0.42 * distance + 0.15 * recoil;
      }
      const baseCamX = T.MathUtils.lerp(
        T.MathUtils.lerp(-0.43, 1.36, narrow),
        T.MathUtils.lerp(-0.12, 1.14, narrow),
        dive,
      );
      const chaseZ = Math.max(10.6, 7.1 / (2 * tan * aspect));
      let cz = T.MathUtils.lerp(
        T.MathUtils.lerp(surfaceZ, splitZ, dive),
        bz + chaseZ,
        follow,
      );
      const centerH = tide + wave(bx, bz, time, swell);
      let cy =
        T.MathUtils.lerp(
          1.46 + (1 - ease(0.64, 0.89, intro)) * 2.1,
          reduced ? 1.05 : 0.68,
          dive,
        ) *
          (1 - follow) +
        follow * (3.03 + centerH * 0.9);
      cy += tide * 0.68 * (1 - follow);
      let cx = T.MathUtils.lerp(
        baseCamX,
        bx - chaseZ * tan * aspect * (0.31 - 0.25 * narrow),
        follow,
      );
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
        (0.18 * Math.sin(time * 0.51) * follow -
          0.32 * Math.sin(Math.PI * fold));
      // Sightline above intervening crests keeps the hull readable in the trough.
      let clearance = 0;
      if (follow > 0) {
        for (let j = 1; j <= 6; j++) {
          const fraction = j / 6,
            target = centerH + 0.64;
          const crest = tide + wave(
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
      surfaceNormal
        .set(
          (wave(bx - 1.25, bz, time, swell) -
            wave(bx + 1.25, bz, time, swell)) /
            2.5,
          1,
          (wave(bx, bz - 0.55, time, swell) -
            wave(bx, bz + 0.55, time, swell)) /
            1.1,
        )
        .normalize();
      onWater.set(bx, h0 - 0.16 - (0.42 * load + 0.08 * strain) * held, bz);
      heading.setFromEuler(
        rot.set(
          0,
          yaw,
          (0.085 * load + 0.035 * strain) * held - 0.13 * recoil,
          "YXZ",
        ),
      );
      boatRotation.setFromUnitVectors(up, surfaceNormal).multiply(heading);
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
      if (justBroke) {
        const { x, z } = tether.attachment;
        const strength = reduced ? 0.44 : 0.78;
        snapSplash.strike(0, x, z, strength, time, swell);
        seaMist.impact(x, z, 0.31, 0.20, yaw, strength);
      }
      snapSplash.update(justBroke ? freedFor : dt, time, swell, canvas.height);
      splash(impactAge, onWater, reduced, canvas.height);
      if (!landed && impactAge >= 0) {
        landed = true;
        seaMist.impact(
          onWater.x,
          onWater.z,
          2.18,
          1.02,
          yaw,
          reduced ? 0.68 : 1.15,
        );
        sound.land();
      }
      details.update(dive, time);
      jellyfish?.(dive, time);
      seaMist.update(
        dt,
        time,
        boat,
        swell,
        reduced,
        stage === "drift" || (stage === "releasing" && freedFor > 0.25),
      );
      if (stage === "drift") {
        dolphins?.(dt, time, camera, swell, reduced, canvas.height);
      }
      bowSpray(dt, time, boat, follow, swell, reduced);
      const un = env.uniforms;
      un.uOceanOrigin.value.set(0, 0);
      un.uOceanForward.value.set(0, -1);
      un.uWorldToHull.value.copy(boat.matrixWorld).invert();
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
      un.uSun.value.copy(sunDir);
      un.uReflectionStrength.value = land;
      if (land > 0.015) reflectPaper(tide + (centerH - tide) * follow);
      if (dive > 0.001) {
        camera.layers.set(2);
        paper.uniforms.uTransmissionPass.value = true;
        renderer.setRenderTarget(transmission);
        renderer.render(scene, camera);
        renderer.setRenderTarget(null);
        camera.layers.set(0);
        paper.uniforms.uTransmissionPass.value = false;
      }
    } else {
      const un = env.uniforms;
      if (camera.near !== 0.07) {
        camera.near = 0.07;
        camera.updateProjectionMatrix();
      }
      sound.setDepth(0);
      details.update(0, time);
      jellyfish?.(0, time);
      tether.update(time, 999, false, 0, reduced);

      airAge += dt;
      const elapsed = airAge;
      const foldAge = elapsed - foldStartedAt;
      const unfold = ease(timing.launchEnd, timing.openEnd, elapsed);
      const fold = T.MathUtils.clamp(foldAge / timing.foldDuration, 0, 1);
      const glideTime = Math.max(0, foldAge - timing.foldDuration);
      const motionScale = reduced ? 0.38 : 1;
      const air = flight.step(dt, elapsed, foldAge, time, departureDirection, timing, reduced);
      const { position, velocity } = flight;
      const swell = (reduced ? 0.39 : 1) * (1 - 0.76 * unfold);
      const seaLevel = wave(position.x, position.z, time, swell);
      const origin = un.uOceanOrigin.value;
      origin.set(Math.trunc(position.x / 2048) * 2048, Math.trunc(position.z / 2048) * 2048);
      flightPosition.set(position.x - origin.x, position.y, position.z - origin.y);
      boat.position.copy(flightPosition);

      const jumpPitch = motionScale * 0.35 * Math.sin(Math.PI * ease(0, timing.openEnd, elapsed));
      boat.quaternion.copy(transStartQuat).slerp(flatSwapQuat, unfold);
      boat.rotateZ(-jumpPitch);
      airEuler.set(air.pitch, -0.22 * air.roll, -air.roll, "YXZ");
      boat.quaternion.premultiply(airAttitude.setFromEuler(airEuler));
      const bank = motionScale * (0.19 * Math.sin(fold * Math.PI) + 0.10 * Math.sin(glideTime * 0.41));
      orientPlane(velocity.x, velocity.y, velocity.z, bank);
      boat.quaternion.slerp(planeQuat, ease(0.04, 1, fold));

      paper.uniforms.uFlight.value = ease(0, timing.launchEnd, elapsed);
      if (elapsed < timing.openEnd) {
        paper.fold(1 - unfold);
      } else {
        // Both crease patterns describe the same rectangle in identical UVs.
        // Retessellate it while flat, before the first wind bend develops.
        planePattern = true;
        plane.fold(fold);
        paper.uniforms.uFold.value = fold;
        flexStrength = ease(timing.openEnd, timing.openEnd + 0.85, elapsed)
          * (1 - ease(0, 0.62, fold)) * motionScale;
        flexWind = flexStrength * (1 - ease(0, 0.4, fold));
        if (flexStrength > 0) {
          const load = 0.38 * (air.gust - 0.43 * velocity.y);
          const twist = 0.36 * air.crosswind + 0.24 * air.rollRate;
          springs.step(dt, 0.25 + 0.65 * Math.tanh(load + twist),
            0.05 + 0.58 * Math.tanh(load - twist));
        }
        if (fold === 1) plane.flutter(0.35 * motionScale * ease(0, 1.4, glideTime), time);
        paper.mesh.geometry = flexPlane(springs.bend, flexStrength, time, flexWind);
      }
      paper.uniforms.uAirLight.value = flexStrength;
      boat.updateMatrixWorld(true);
      un.uWorldToHull.value.copy(boat.matrixWorld).invert();

      // Track in ocean coordinates so the camera and paper rebase together.
      foldCenter.copy(position);
      if (!planePattern) {
        boatGeometry.computeBoundingBox();
        boatGeometry.boundingBox!.getCenter(foldCenter).applyQuaternion(boat.quaternion).add(position);
      }
      trackedPosition.lerp(foldCenter, 1 - Math.exp(-dt * (reduced ? 8 : 5.2)));
      const back = Math.max(14.4, 10.4 / (2 * tan * aspect));
      const orbit = motionScale * (0.12 * unfold + 0.50 * ease(0, 1, fold));
      const elevation = 1.6 + 0.6 * unfold + 0.85 * ease(0.15, 1, fold);
      camGoalLook.set(trackedPosition.x - origin.x, trackedPosition.y + 0.10, trackedPosition.z - origin.y);
      camGoalPos.copy(camGoalLook);
      camGoalPos.x += Math.sin(orbit) * back + filteredCursor.x * motionWeight * 0.15;
      camGoalPos.y += elevation;
      camGoalPos.z += Math.cos(orbit) * back;
      const frameIn = ease(0, reduced ? 1.0 : 1.9, elapsed);
      camera.position.copy(transCamStartPos).add(flightPosition).sub(transStartPos).lerp(camGoalPos, frameIn);
      look.copy(transCamStartLook).add(flightPosition).sub(transStartPos).lerp(camGoalLook, frameIn);
      camera.lookAt(look);
      camera.updateMatrixWorld();
      un.uViewProjection.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);

      const view = camera.matrixWorld.elements;
      un.uOceanForward.value.set(-view[8], -view[10]).normalize();
      const contact = 1 - ease(0.06, timing.launchEnd, elapsed);
      seaMist.update(dt, time, boat, swell, reduced, elapsed < timing.launchEnd * 0.55);
      const drip = !shedWater && elapsed >= timing.launchEnd * 0.62;
      if (drip) shedWater = true;
      bowSpray(dt, time, boat, contact, swell, reduced, drip);
      dolphins?.(dt, time, camera, swell, reduced, canvas.height, elapsed < timing.launchEnd);
      un.uContact.value = contact;
      un.uWake.value = contact;
      un.uBoat.value.copy(flightPosition);
      un.uSwell.value = swell;
      un.uReflectionStrength.value = 1 - 0.66 * unfold;
      if (un.uReflectionStrength.value > 0.001) reflectPaper(seaLevel);
      un.uTime.value = time;
      un.uImpact.value = -1;
      un.uDive.value = 0;
      un.uCamera.value.copy(camera.position);
      un.uAspect.value = aspect;
      un.uTan.value = tan;
      un.uCut.value = camera.position.z - 0.12;
      un.uSun.value.copy(sunDir);
    }

    renderer.render(scene, camera);
    if (!started) {
      portfolio.hidden = true;
      document.querySelector("main")!.removeAttribute("aria-hidden");
      canvas.tabIndex = 0;
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
