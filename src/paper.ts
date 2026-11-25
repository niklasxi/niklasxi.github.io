import * as T from "three";
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

export function createPaper(grain: T.Texture) {
  const flat: T.Vector2[] = [],
    centers: T.Vector2[] = [],
    uv: number[] = [],
    bary: number[] = [],
    ink: number[] = [],
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
      ink.push(Math.abs(center.y) > 2.16 ? 0.055 : center.x < 0 ? 0.18 : 0.095);
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
  geom.setAttribute("ink", new T.Float32BufferAttribute(ink, 1));
  geom.setAttribute("seam", new T.Float32BufferAttribute(seam, 1));
  const foldPose = createFoldPose(flat, centers);
  const mat = new T.ShaderMaterial({
    side: T.DoubleSide,
    uniforms: {
      uPrint: { value: null as T.Texture | null },
      uGrain: { value: grain },
      uFold: { value: 0 },
    },
    vertexShader: `attribute vec3 bary; attribute float ink,seam;
    varying vec3 vBary,vWorld; varying vec2 vUv; varying float vInk,vSeam;
    void main(){vUv=uv;vInk=ink;vSeam=seam;vBary=bary;vec4 p=modelMatrix*vec4(position,1.);vWorld=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}`,
    fragmentShader: `
    uniform sampler2D uPrint,uGrain; uniform float uFold;
    varying vec3 vBary,vWorld; varying vec2 vUv; varying float vInk,vSeam;
    float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
    void main(){
      vec3 image=texture2D(uPrint,vUv).rgb;
      vec3 n=normalize(cross(dFdx(vWorld),dFdy(vWorld)));
      float lit=dot(n,normalize(vec3(-.68,.59,.43)));
      float grain=texture2D(uGrain,vUv*vec2(2.8,2.1)).r-.5;
      float fiber=texture2D(uGrain,vUv.yx*vec2(.85,1.35)).r-.5;
      vec3 cream=mix(vec3(.66,.605,.57),vec3(1.,.93,.79),clamp(.52+lit*.51,0.,1.));
      float printAmount=mix(gl_FrontFacing?1.:.025,vInk,smoothstep(.82,1.,uFold));
      vec3 printed=mix(image,vec3(.66,.66,.65)+image*.25,smoothstep(.78,1.,uFold)*.29);
      vec3 color=mix(cream,printed,printAmount);
      float hem=step(.3293,abs(vUv.x-.5))*smoothstep(.53,.77,uFold);
      color=mix(color,color*vec3(.98,.97,.952),hem);
      float lip=1.-smoothstep(0.,.008,min(vUv.x,1.-vUv.x));
      color=mix(color,vec3(1.,.946,.83),hem*lip*.8);
      color*=mix(vec3(1.),vec3(.94,.92,.90)+max(0.,lit)*vec3(.10,.09,.065),smoothstep(.0,.65,uFold));
      vec3 dist=vBary/max(fwidth(vBary),vec3(.00001));
      float crease=1.-smoothstep(.1,1.05,min(dist.x,min(dist.y,dist.z)));
      color=mix(color,cream*.72,crease*vSeam*.46*smoothstep(.015,.25,uFold));
      color+=vec3(grain*.14+fiber*.10)*smoothstep(.01,.45,uFold);
      gl_FragColor=vec4(color,1.);
    }`,
  });
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
    mat.uniforms.uFold.value = amount;
    pos.needsUpdate = true;
  }
  return { mesh, fold, width, height };
}
