import * as T from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import televisionUrl from "./assets/crt-tv.glb?url";

// CRT TV by Timothy Ahene (Sketchfab Standard license). The screen mesh is
// driven by a live render of the ocean scene.
export async function loadTelevision() {
  const { scene: object } = await new GLTFLoader().loadAsync(televisionUrl);
  let glass: T.Mesh | undefined;
  object.traverse((child) => {
    if (glass || !(child instanceof T.Mesh)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    if (materials.some((material) => material.name === "TVScreen")) glass = child;
  });
  if (!glass) {
    const screenNode = object.getObjectByName("Screen");
    screenNode?.traverse((child) => {
      if (!glass && child instanceof T.Mesh) glass = child;
    });
  }
  if (!glass) throw new Error("Television model is missing its screen");
  const screen = glass;

  // This Sketchfab model faces -Z and is authored at a tiny scale. Turn its
  // screen toward +Z and normalize the cabinet to the old prop's footprint.
  object.rotation.y = Math.PI;
  object.updateMatrixWorld(true);
  const size = new T.Box3().setFromObject(object).getSize(new T.Vector3());
  object.scale.setScalar(3 / size.x);
  object.updateMatrixWorld(true);
  const screenBox = new T.Box3().setFromObject(screen);
  const screenSize = screenBox.getSize(new T.Vector3());
  object.position.copy(screenBox.getCenter(new T.Vector3())).multiplyScalar(-1);
  object.updateMatrixWorld(true);

  // The source UV island does not fill the texture. Normalize it so the live
  // feed uses the whole CRT face.
  const uv = screen.geometry.getAttribute("uv") as T.BufferAttribute | undefined;
  if (uv) {
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (let i = 0; i < uv.count; i++) {
      minU = Math.min(minU, uv.getX(i));
      maxU = Math.max(maxU, uv.getX(i));
      minV = Math.min(minV, uv.getY(i));
      maxV = Math.max(maxV, uv.getY(i));
    }
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i,
        (uv.getX(i) - minU) / (maxU - minU),
        (uv.getY(i) - minV) / (maxV - minV));
    }
    uv.needsUpdate = true;
  }

  const root = new T.Group();
  root.add(object);

  const uniforms = {
    uSignal: { value: null as T.Texture | null },
    uTime: { value: 0 },
    uStatic: { value: 1 },
    uReduced: { value: false },
    uLinearSample: { value: false },
  };
  const tube = new T.ShaderMaterial({
    uniforms, toneMapped: false,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D uSignal;
      uniform float uTime, uStatic;
      uniform bool uReduced, uLinearSample;
      varying vec2 vUv;
      #include <common>
      float noise(vec2 cell) {
        vec3 p = fract(cell.xyx * vec3(.1031, .1030, .0973));
        p += dot(p, p.yzx + 33.33);
        return fract((p.x + p.y) * p.z);
      }
      void main() {
        vec2 centered = 2.0 * vUv - 1.0;
        vec2 cell = floor(vUv * vec2(560.0, 360.0));
        float frame = floor(uTime * (uReduced ? 5.0 : 24.0));
        float row = noise(vec2(cell.y, frame));
        float grain = noise(cell + vec2(frame * 29.0, 7.0 * frame));
        float band = sin(29.0 * vUv.y - uTime * 8.0);
        float snow = 0.09 + 0.60 * grain + 0.14 * row + 0.035 * band;
        if (uReduced) snow = mix(.34, snow, .38);
        // Average unresolved grain and scanlines as the television recedes.
        float pixelsPerSample = 1.0 / max(fwidth(vUv.y) * 360.0, .0001);
        snow = mix(.40, snow, smoothstep(.35, 1.2, pixelsPerSample));
        vec2 sampleUv = clamp(vUv + vec2((row - .5) * uStatic * .017, 0.), 0.0, 1.0);
        vec3 signal = texture2D(uSignal, sampleUv).rgb;
        if (uLinearSample) signal = sRGBTransferOETF(vec4(signal, 1.0)).rgb;
        float luma = dot(signal, vec3(.2126, .7152, .0722));
        signal = mix(vec3(luma), signal, .90);
        float line = .5 + .5 * cos(6.283185 * vUv.y * 360.);
        vec3 phosphor = mix(signal, vec3(.93, .98, 1.) * snow, uStatic);
        phosphor *= 1.0 - .09 * line * smoothstep(1.4, 4., pixelsPerSample);
        float edge = smoothstep(.53, 1.35, dot(centered, centered) * .65);
        phosphor *= 1.0 - .23 * edge;
        gl_FragColor = vec4(phosphor * .94 + vec3(.009, .012, .013), 1.0);
      }
    `,
  });
  const original = screen.material;
  screen.material = tube;
  for (const mat of Array.isArray(original) ? original : [original]) mat.dispose();
  const screenCenter = new T.Vector3();
  return {
    object: root, screenCenter, screenWidth: screenSize.x, screenHeight: screenSize.y,
    setSignal(texture: T.Texture, time: number, staticAmount: number, reduced: boolean) {
      uniforms.uSignal.value = texture;
      uniforms.uTime.value = time;
      uniforms.uStatic.value = staticAmount;
      uniforms.uReduced.value = reduced;
      uniforms.uLinearSample.value = texture.colorSpace === T.SRGBColorSpace;
    },
  };
}
