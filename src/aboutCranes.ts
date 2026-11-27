import * as T from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import modelUrl from "../origami_paper_crane_on_string.glb?url";

export async function createAboutCranes(dialog: HTMLDialogElement) {
  const canvas = dialog.querySelector("canvas")!;
  const { scene: model } = await new GLTFLoader().loadAsync(modelUrl);
  const renderer = new T.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new T.Scene();
  scene.add(model, new T.HemisphereLight(0xfff8ed, 0xa6b4c3, 1.6));
  const key = new T.DirectionalLight(0xfff1de, 2.1);
  key.position.set(-3, 5, 4);
  scene.add(key);
  model.updateMatrixWorld(true);
  const bounds = new T.Box3().setFromObject(model);
  const center = bounds.getCenter(new T.Vector3());
  const size = bounds.getSize(new T.Vector3());
  const string = new T.Box3().setFromObject(model.getObjectByName("pCylinder1")!).getCenter(new T.Vector3());
  // The asset stores each bird as twelve folded surfaces on one shared thread.
  const pivots = Array.from({ length: 4 }, (_, bird) => {
    const panels = Array.from({ length: 12 }, (_, i) => model.getObjectByName("polySurface" + (12 * bird + i + 1))!);
    const box = new T.Box3();
    panels.forEach(panel => box.expandByObject(panel));
    const pivot = new T.Group();
    pivot.position.set(string.x, (box.min.y + box.max.y) / 2, string.z);
    scene.add(pivot);
    panels.forEach(panel => pivot.attach(panel));
    return pivot;
  });
  const camera = new T.OrthographicCamera(-1, 1, 1, -1, .01, size.length() * 6);
  camera.position.copy(center);
  camera.position.z += size.length() * 2;
  camera.lookAt(center);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
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
    pivots.forEach((pivot,i) => {
      const t = reduced.matches ? 0 : time * .001;
      pivot.rotation.y = (i % 2 ? -1 : 1) * .52 * Math.sin(t*(.39+.06*i)+i*1.7);
      pivot.rotation.z = .034 * Math.sin(t*.71+i*2.2);
    });
    renderer.render(scene, camera);
    if (!reduced.matches) frame = requestAnimationFrame(draw);
  }
  const refresh = () => draw(performance.now());
  new ResizeObserver(refresh).observe(canvas);
  reduced.addEventListener("change", refresh);
  return refresh;
}
