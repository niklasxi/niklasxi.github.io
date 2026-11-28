import * as T from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import modelUrl from "../origami_paper_crane_on_string.glb?url";

export async function createAboutCranes(dialog: HTMLDialogElement) {
  const canvas = dialog.querySelector("canvas")!;
  const { scene: model } = await new GLTFLoader().loadAsync(modelUrl);
  const renderer = new T.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new T.Scene();
  const hanging = new T.Group();
  scene.add(hanging, new T.HemisphereLight(0xfff8ed, 0xa6b4c3, 1.6));
  const key = new T.DirectionalLight(0xfff1de, 2.1);
  key.position.set(-3, 5, 4);
  scene.add(key);
  model.updateMatrixWorld(true);
  const bounds = new T.Box3().setFromObject(model);
  const center = bounds.getCenter(new T.Vector3());
  const size = bounds.getSize(new T.Vector3());
  // Keep the imported crane-and-string GLB intact. Pivot the complete rig at
  // its top so the birds remain visibly attached as the string swings.
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const top = bounds.max.y;
  model.position.y = -top;
  hanging.add(model);
  model.updateMatrixWorld(true);
  const stringBounds = new T.Box3().setFromObject(model.getObjectByName("pCylinder1")!);
  const string = stringBounds.getCenter(new T.Vector3());
  const cranes = Array.from({ length: 4 }, (_, bird) => {
    const panels = Array.from({ length: 12 }, (_, i) => model.getObjectByName("polySurface" + (12 * bird + i + 1))!);
    const bounds = new T.Box3();
    panels.forEach(panel => bounds.expandByObject(panel));
    const center = bounds.getCenter(new T.Vector3());
    const pivot = new T.Group();
    pivot.position.set(string.x, center.y, string.z);
    hanging.add(pivot);
    panels.forEach(panel => pivot.attach(panel));
    return pivot;
  });
  const startY = Math.max(size.y * 1.3, 1.4);
  hanging.position.y = top + (reduced.matches ? 0 : startY);
  let dropStart: number | undefined;
  const camera = new T.OrthographicCamera(-1, 1, 1, -1, .01, size.length() * 6);
  camera.position.copy(center);
  camera.position.z += size.length() * 2;
  camera.lookAt(center);
  let frame = 0, width = 0, height = 0;
  function draw(time: number) {
    cancelAnimationFrame(frame);
    if (!dialog.open) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    if (w !== width || h !== height) {
      renderer.setSize(w, h, false);
      width = w;
      height = h;
    }
    const half = Math.max(size.y * .5, Math.hypot(size.x,size.z) * .57 * h/w);
    camera.top = half;
    camera.bottom = -half;
    camera.right = half*w/h;
    camera.left = -camera.right;
    camera.updateProjectionMatrix();
    if (dropStart === undefined) dropStart = time;
    const elapsed = (time - dropStart) * .001;
    if (reduced.matches) hanging.position.y = top;
    else {
      const fall = Math.max(0, elapsed - .08);
      const decay = Math.exp(-3.1 * fall);
      const drop = startY * Math.exp(-4.2 * fall) +
        startY * .045 * decay * Math.sin(7.2 * fall);
      hanging.position.y = top + drop;
      const settle = 1 - Math.exp(-2.4 * Math.max(0, elapsed - .3));
      hanging.rotation.z = .105 * settle * Math.sin(elapsed * 1.35) * Math.exp(-.12 * Math.max(0, elapsed - 1));
      hanging.rotation.x = .042 * settle * Math.sin(elapsed * .92 + .7);
    }

    const sway = reduced.matches ? 0 : elapsed;
    cranes.forEach((crane, i) => {
      const phase = sway * (.34 + i * .025) + i * 1.53;
      crane.rotation.y = .38 * Math.sin(phase);
      crane.rotation.z = .055 * Math.sin(phase * .72 + .8);
    });
    renderer.render(scene, camera);
    if (!reduced.matches) frame = requestAnimationFrame(draw);
  }
  const refresh = () => draw(performance.now());
  new ResizeObserver(refresh).observe(canvas);
  reduced.addEventListener("change", refresh);
  return refresh;
}
