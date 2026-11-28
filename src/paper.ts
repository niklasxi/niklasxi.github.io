import * as T from "three";
import { waveGLSL } from "./waves";
import { causticsGLSL } from "./environment";
import { createFoldPose } from "./pocket";

import {
  creaseFaces,
  sheetWidth as width,
  sheetHeight as height,
} from "./creases";
// Neighboring flaps turn about slightly different radii. Join their matching
// material edges with narrow strips so the paper stays closed at each crease.
function sheetIndices(flat: T.Vector2[]) {
  const indices = flat.map((_, i) => i);
  const vertexKeys = flat.map(
    (p) => Math.round(p.x * 1e6) + "," + Math.round(p.y * 1e6),
  );
  const edges = new Map<string, [number, number]>();
  for (let face = 0; face < flat.length; face += 3) {
    for (let edge = 0; edge < 3; edge++) {
      const a = face + edge,
        b = face + ((edge + 1) % 3);
      const reverse = vertexKeys[b] + ":" + vertexKeys[a];
      const neighbor = edges.get(reverse);
      if (neighbor) {
        const [c, d] = neighbor;
        indices.push(b, a, d, b, d, c);
        edges.delete(reverse);
      } else {
        edges.set(vertexKeys[a] + ":" + vertexKeys[b], [a, b]);
      }
    }
  }
  return indices;
}

function createPaperMaterial(grain: T.Texture) {
  const uniforms = {
    uPrint: { value: null as T.Texture | null },
    uGrain: { value: grain },
    uBackPrint: { value: null as T.Texture | null },
    uFlight: { value: 0 },
    uClearing: { value: 0 },
    uFold: { value: 0 },
    uAirLight: { value: 0 },
    uDive: { value: 0 }, uTime: { value: 0 }, uSwell: { value: 0 }, uTide: { value: 0 },
    uSun: { value: new T.Vector3() }, uSkyMotion: { value: 1 },
    uTransmissionPass: { value: false },
  };
  const material = new T.ShaderMaterial({
    side: T.DoubleSide,
    uniforms,
    vertexShader: `attribute vec3 bary; attribute float seam;
    varying vec3 vBary,vWorld,vCurvedNormal; varying vec2 vUv; varying float vSeam;
    void main(){vCurvedNormal=mat3(modelMatrix)*normal;vUv=uv;vSeam=seam;vBary=bary;vec4 p=modelMatrix*vec4(position,1.);vWorld=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}`,
    fragmentShader: `
    uniform float uTime,uDive,uClearing,uSkyMotion;
    uniform vec3 uSun;
    uniform bool uTransmissionPass;
    ${waveGLSL}
    ${causticsGLSL}
    uniform sampler2D uPrint,uGrain,uBackPrint; uniform float uFold,uAirLight,uFlight;
    varying vec3 vBary,vWorld,vCurvedNormal; varying vec2 vUv; varying float vSeam;
    void main(){
      // Turning the sheet over reverses its horizontal print axis.
      vec3 color=gl_FrontFacing ? texture2D(uPrint,vUv).rgb
        : texture2D(uBackPrint,vec2(1.-vUv.x,vUv.y)).rgb;
      vec3 n=normalize(cross(dFdx(vWorld),dFdy(vWorld)));
      if(uAirLight>.0001 && dot(vCurvedNormal,vCurvedNormal)>.0001)
        n=normalize(mix(n,normalize(gl_FrontFacing?vCurvedNormal:-vCurvedNormal),smoothstep(0.,.14,uAirLight)));
      float lit=dot(n,normalize(vec3(-.68,.59,.43)));
      float grain=texture2D(uGrain,vUv*vec2(2.8,2.1)).r-.5;
      float fiber=texture2D(uGrain,vUv.yx*vec2(.85,1.35)).r-.5;
      vec3 cream=mix(vec3(.76,.74,.72),vec3(1.,.975,.93),clamp(.52+lit*.51,0.,1.));
      float hem=step(.3293,abs(vUv.x-.5))*smoothstep(.53,.77,uFold);
      color=mix(color,color*vec3(.98,.975,.965),hem);
      float lip=1.-smoothstep(0.,.008,min(vUv.x,1.-vUv.x));
      color=mix(color,vec3(1.,.98,.94),hem*lip*.8);
      color*=mix(vec3(1.),vec3(.96,.955,.95)+max(0.,lit)*vec3(.07,.065,.055),smoothstep(.0,.65,uFold));
      // Raking sunset light makes the curl readable on the white printed face.
      color*=mix(vec3(1.),mix(vec3(.69,.73,.77),vec3(1.03,.98,.88),smoothstep(-.5,.85,lit)),uFlight);
      vec3 dist=vBary/max(fwidth(vBary),vec3(.00001));
      float crease=1.-smoothstep(.1,1.05,min(dist.x,min(dist.y,dist.z)));
      color=mix(color,cream*.72,crease*vSeam*.46*smoothstep(.015,.25,uFold));
      // Old keel, brim and diagonal folds catch grazing light even on the
      // opened sheet. Locate them in material coordinates across both patterns.
      vec2 stock=(vUv.yx-.5)*vec2(5.24,-7.04);
      vec2 q=abs(stock);
      float ridge=min(min(q.x,q.y),min(abs(q.y-2.62),abs(q.x-q.y)*.7071));
      float foot=max(fwidth(ridge),.006);
      float scar=1.-smoothstep(0.,foot+.012,ridge);
      float shoulder=1.-smoothstep(.009,.033+foot,abs(ridge-.025));
      color*=1.+uFlight*(.045*shoulder-.105*scar);
      color+=vec3(grain*.075+fiber*.045)*max(uFlight,smoothstep(.01,.45,uFold));
      color*=mix(vec3(1.),vec3(.80,.84,.88), (1.-uClearing)*smoothstep(0.,.35,uFold));
      if(uDive>.001){
        float depth=heightAt(vWorld.xz,uTime)-vWorld.y;
        if(uTransmissionPass && depth<0.) discard;
        float wet=uDive*smoothstep(-.025,.09,depth);
        float bands=caustic(lightEntry(vWorld,uSun,uTide),uTime*uSkyMotion,.15);
        vec3 submerged=color*vec3(.37,.69,.66)*(1.+.43*bands)+vec3(.02,.12,.11)*bands;
        color=mix(color,submerged,wet);
      }
      gl_FragColor=vec4(color,1.);
    }`,
  });
  Object.assign(material.defaultAttributeValues, { normal: [0, 0, 1] });
  return { material, uniforms };
}

export function createPaper(grain: T.Texture) {
  const flat: T.Vector2[] = [],
    centers: T.Vector2[] = [],
    uv: number[] = [],
    bary: number[] = [],
    seam: number[] = [];
  for (const face of creaseFaces()) {
    const center = face
      .reduce((c, p) => c.add(p), new T.Vector2())
      .multiplyScalar(1 / 3);
    face.forEach((p, i) => {
      flat.push(p);
      centers.push(center);
      uv.push(0.5 - p.y / height, 0.5 + p.x / width);
      bary.push(+(i === 0), +(i === 1), +(i === 2));
      seam.push(0.56);
    });
  }
  const geom = new T.BufferGeometry();
  const pos = new T.Float32BufferAttribute(
    flat.flatMap((p) => [p.x, p.y, 0]),
    3,
  );
  pos.setUsage(T.DynamicDrawUsage);
  geom.setAttribute("position", pos);
  geom.setIndex(sheetIndices(flat));
  geom.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  geom.setAttribute("bary", new T.Float32BufferAttribute(bary, 3));
  geom.setAttribute("seam", new T.Float32BufferAttribute(seam, 1));
  const foldPose = createFoldPose(flat, centers);
  const { material: mat, uniforms } = createPaperMaterial(grain);
  const mesh = new T.Mesh(geom, mat);
  mesh.frustumCulled = false;
  let previous = -1;
  function fold(amount: number) {
    if (previous === amount) return;
    previous = amount;
    const pose = foldPose(amount);
    for (let i = 0; i < pose.length; i++) {
      const p = pose[i];
      pos.setXYZ(i, p.x, p.y, p.z);
    }
    uniforms.uFold.value = amount;
    pos.needsUpdate = true;
  }
  return { mesh, fold, width, height, uniforms };
}
