import * as T from "three";
import { causticsGLSL } from "./environment";
import { waveGLSL } from "./waves";

export interface WaterLight {
  uTime: T.IUniform<number>;
  uSwell: T.IUniform<number>;
  uTide: T.IUniform<number>;
  uSun: T.IUniform<T.Vector3>;
  uSkyMotion: T.IUniform<number>;
}

// Evaluate the same water surface as the hull. The optical path begins at
// the wave surface and ends at the actual fragment, including instanced links.
export function submerge(material: T.MeshStandardMaterial, water: WaterLight, stableLighting = false) {
  const prepare = material.onBeforeCompile.bind(material);
  const baseKey = material.customProgramCacheKey();
  material.customProgramCacheKey = () => baseKey + (stableLighting ? "-underwater-steady" : "-underwater");
  material.onBeforeCompile = (shader, renderer) => {
    prepare(shader, renderer);
    shader.uniforms.uTime = water.uTime;
    shader.uniforms.uSwell = water.uSwell;
    shader.uniforms.uTide = water.uTide;
    shader.uniforms.uSun = water.uSun;
    shader.uniforms.uSkyMotion = water.uSkyMotion;
    shader.vertexShader =
      "varying vec3 vWaterWorld;\n" +
      shader.vertexShader.replace(
        "#include <project_vertex>",
        `#include <project_vertex>
      vec4 hardwarePosition = vec4(transformed, 1.);
      #ifdef USE_INSTANCING
        hardwarePosition = instanceMatrix * hardwarePosition;
      #endif
      vWaterWorld = (modelMatrix * hardwarePosition).xyz;`,
      );
    shader.fragmentShader =
      `varying vec3 vWaterWorld;
      uniform float uTime,uSkyMotion;
      uniform vec3 uSun;
      ${waveGLSL}
      ${causticsGLSL}
    ` +
      shader.fragmentShader.replace(
        "#include <opaque_fragment>",
        `
      float depth = ${stableLighting ? "uTide" : "heightAt(vWaterWorld.xz,uTime)"} - vWaterWorld.y;
      float wet = smoothstep(-.012,.055,depth);
      float path = length(vWaterWorld-cameraPosition) *
        clamp(depth/max(.08,cameraPosition.y-vWaterWorld.y),0.,1.);
      vec3 extinction = exp(-vec3(.21,.082,.063)*path);
      vec3 filtered = outgoingLight * exp(-max(depth,0.)*vec3(.26,.075,.058));
      ${stableLighting ? "" : `
      vec2 entry = lightEntry(vWaterWorld,uSun,uTide);
      float lightBands = caustic(entry,uTime*uSkyMotion,.18);
      filtered *= 1. + lightBands * .68;
      `}
      vec3 scatter = vec3(.004,.084,.087);
      outgoingLight = mix(outgoingLight,filtered*extinction + scatter*(1.-extinction),wet);
      #include <opaque_fragment>`,
      );
  };
}

const v = (x: number, y: number, z = 0) => new T.Vector3(x, y, z);

// A small environment for the steel to reflect: muted sky over green water,
// with a narrow band of warm light along the horizon.
function coastalReflection() {
  const width = 192,
    height = 96;
  const pixels = new Float32Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const latitude = ((y + 0.5) / height - 0.5) * Math.PI;
    const sky = T.MathUtils.smoothstep(latitude, -0.12, 0.38);
    for (let x = 0; x < width; x++) {
      const longitude = ((x + 0.5) / width) * 2 * Math.PI;
      const sun =
        Math.exp(-((latitude - 0.15) ** 2) * 18) *
        Math.pow(Math.max(0, Math.cos(longitude - 1.9)), 8);
      pixels.set(
        [
          0.045 + 0.49 * sky + sun * 3.1,
          0.12 + 0.5 * sky + sun * 2.0,
          0.11 + 0.51 * sky + sun,
          1,
        ],
        4 * (y * width + x),
      );
    }
  }
  const map = new T.DataTexture(
    pixels,
    width,
    height,
    T.RGBAFormat,
    T.FloatType,
  );
  map.mapping = T.EquirectangularReflectionMapping;
  map.needsUpdate = true;
  return map;
}

export function forgedSteel() {
  const material = new T.MeshStandardMaterial({
    color: 0x646c6a,
    roughness: 0.38,
    metalness: 0.78,
    envMap: coastalReflection(),
    envMapIntensity: 0.92,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      "varying vec3 vSteel;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
      vSteel = position;
      #ifdef USE_INSTANCING
        vSteel.x += float(gl_InstanceID) * 1.74;
      #endif`,
      );
    shader.fragmentShader =
      `varying vec3 vSteel;
      float grainHash(vec3 p) {
        p = fract(p * .1031); p += dot(p, p.yzx + 33.33);
        return fract((p.x + p.y) * p.z);
      }
      float grain(vec3 p) {
        vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(mix(grainHash(i),grainHash(i+vec3(1,0,0)),f.x),
                       mix(grainHash(i+vec3(0,1,0)),grainHash(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(grainHash(i+vec3(0,0,1)),grainHash(i+vec3(1,0,1)),f.x),
                       mix(grainHash(i+vec3(0,1,1)),grainHash(i+vec3(1)),f.x),f.y),f.z);
      }
    ` +
      shader.fragmentShader
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
      float crust = smoothstep(.45,.76,grain(vSteel*8.)*.65+grain(vSteel*31.)*.35);
      diffuseColor.rgb = mix(diffuseColor.rgb,vec3(.102,.055,.028),crust*.78);
    `,
        )
        .replace(
          "#include <roughnessmap_fragment>",
          `#include <roughnessmap_fragment>
      roughnessFactor += crust*.41;`,
        );
  };
  return material;
}

// Sweep a bevelled rectangular cross-section along the profile of a forging.
// Each station gives x, y, half-width in the profile plane, and half-depth.
function forging(stations: number[][], material: T.Material) {
  const bevel = [
    [1, 0.6],
    [0.65, 1],
    [-0.65, 1],
    [-1, 0.6],
    [-1, -0.6],
    [-0.65, -1],
    [0.65, -1],
    [1, -0.6],
  ];
  const positions: number[] = [],
    indices: number[] = [];
  stations.forEach(([x, y, w, d], i) => {
    const prev = stations[Math.max(i - 1, 0)],
      next = stations[Math.min(i + 1, stations.length - 1)];
    const dx = next[0] - prev[0],
      dy = next[1] - prev[1],
      length = Math.hypot(dx, dy);
    for (const [across, depth] of bevel)
      positions.push(
        x - (dy / length) * w * across,
        y + (dx / length) * w * across,
        d * depth,
      );
    if (i === 0) return;
    for (let j = 0; j < 8; j++) {
      const a = (i - 1) * 8 + j,
        b = (i - 1) * 8 + ((j + 1) % 8);
      indices.push(a, b, a + 8, b, b + 8, a + 8);
    }
  });
  const last = (stations.length - 1) * 8;
  for (let i = 1; i < 7; i++)
    indices.push(0, i + 1, i, last, last + i, last + i + 1);
  const geom = new T.BufferGeometry();
  geom.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return new T.Mesh(geom, material);
}

function bar(
  a: T.Vector3,
  b: T.Vector3,
  radius: number,
  endRadius: number,
  material: T.Material,
  sides = 16,
) {
  const mesh = new T.Mesh(
    new T.CylinderGeometry(endRadius, radius, a.distanceTo(b), sides),
    material,
  );
  mesh.position.copy(a).lerp(b, 0.5);
  mesh.quaternion.setFromUnitVectors(v(0, 1), b.clone().sub(a).normalize());
  return mesh;
}

export function makeAnchor(metal: T.MeshStandardMaterial) {
  const anchor = new T.Group();
  anchor.add(
    forging(
      [
        [0, -0.07, 0.085, 0.08],
        [0, 0.07, 0.137, 0.113],
        [0, 0.23, 0.109, 0.091],
        [0, 0.86, 0.063, 0.059],
        [0, 1.13, 0.062, 0.058],
        [0, 1.29, 0.083, 0.06],
      ],
      metal,
    ),
  );
  for (const side of [-1, 1]) {
    // Broad palms widen across the blade, then taper inward to a sharp bill.
    const arm = [
      [0, 0.02, 0.101, 0.105],
      [0.19, 0.048, 0.1, 0.094],
      [0.39, 0.14, 0.085, 0.09],
      [0.545, 0.285, 0.07, 0.094],
      [0.635, 0.445, 0.057, 0.123],
      [0.667, 0.498, 0.091, 0.196],
      [0.67, 0.616, 0.066, 0.157],
      [0.623, 0.795, 0.008, 0.014],
    ];
    anchor.add(
      forging(
        arm.map(([x, y, w, d]) => [side * x, y, w, d]),
        metal,
      ),
    );
  }
  const stock = new T.Group();
  stock.position.y = 1.035;
  stock.rotation.y = 0.94;
  for (const s of [-1, 1]) {
    const a = v(s * 0.045, 0),
      b = v(s * 0.69, -0.046);
    stock.add(bar(a, b, 0.076, 0.045, metal));
    const stop = new T.Mesh(new T.SphereGeometry(0.063, 16, 10), metal);
    stop.position.copy(b);
    stock.add(stop);
  }
  stock.add(bar(v(-0.13, 0), v(0.13, 0), 0.101, 0.101, metal, 8));
  anchor.add(stock);

  const eye = new T.Mesh(new T.TorusGeometry(0.106, 0.048, 14, 40), metal);
  eye.position.y = 1.35;
  anchor.add(eye);
  // A transverse pin passes through the eye and both ears of the bow shackle.
  const shackle = new T.Group();
  shackle.name = "Pinned anchor shackle";
  shackle.rotation.z = .78;
  shackle.position.copy(eye.position);
  const bow = new T.CatmullRomCurve3([
    v(0, 0, -0.092),
    v(0, 0.1, -0.092),
    v(0, 0.19, -0.105),
    v(0, 0.245, -0.077),
    v(0, 0.269),
    v(0, 0.245, 0.077),
    v(0, 0.19, 0.105),
    v(0, 0.1, 0.092),
    v(0, 0, 0.092),
  ]);
  shackle.add(new T.Mesh(new T.TubeGeometry(bow, 36, 0.031, 12, false), metal));
  for (const s of [-1, 1])
    shackle.add(
      bar(v(0, 0, s * 0.067), v(0, 0, s * 0.119), 0.052, 0.052, metal),
    );
  shackle.add(
    bar(v(0, 0, -0.145), v(0, 0, 0.147), 0.031, 0.031, metal),
    bar(v(0, 0, 0.114), v(0, 0, 0.157), 0.05, 0.05, metal, 6),
  );
  anchor.add(shackle);
  return { anchor, shackle };
}
