import * as T from "three";
import { bakePocket } from "./pocket";
import { ease } from "./waves";

import {
  creaseFaces,
  foldPoint,
  sheetWidth as width,
  sheetHeight as height,
} from "./creases";
export function createPaper(texture: T.Texture, grain: T.Texture) {
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
  geom.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  geom.setAttribute("bary", new T.Float32BufferAttribute(bary, 3));
  geom.setAttribute("ink", new T.Float32BufferAttribute(ink, 1));
  geom.setAttribute("seam", new T.Float32BufferAttribute(seam, 1));
  // Coplanar facets share the ordering of the physical flap that owns them.
  // Sorting individual triangles here would expose scraps of the buried print.
  const layers = new T.Float32BufferAttribute(new Float32Array(flat.length), 1);
  layers.setUsage(T.DynamicDrawUsage);
  geom.setAttribute("layer", layers);
  const openPocket = bakePocket(flat, centers);
  const mat = new T.ShaderMaterial({
    side: T.DoubleSide,
    uniforms: {
      uPrint: { value: texture },
      uGrain: { value: grain },
      uFold: { value: 0 },
    },
    vertexShader: `attribute vec3 bary; attribute float ink,seam,layer;
    varying vec3 vBary,vWorld; varying vec2 vUv; varying float vInk,vSeam;
    void main(){vUv=uv;vInk=ink;vSeam=seam;vBary=bary;vec4 p=modelMatrix*vec4(position,1.);vWorld=p.xyz;gl_Position=projectionMatrix*viewMatrix*p; gl_Position.z-=layer*.0000014*gl_Position.w;}`,
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
  const current = new T.Vector3();
  let previous = -1;
  function fold(amount: number) {
    if (previous === amount) return;
    previous = amount;
    for (let i = 0; i < flat.length; i++) {
      if (amount <= 0.83) foldPoint(current, flat[i], centers[i], amount);
      else openPocket(current, i, ease(0.83, 1, amount));
      pos.setXYZ(i, current.x, current.y, current.z);
    }
    for (let i = 0; i < centers.length; i += 3) {
      const f = centers[i],
        x = Math.abs(f.x),
        y = Math.abs(f.y),
        a = width / 2;
      const back = f.y > 0;
      let rank = back ? 1 : 0;
      if (x > y && amount > 0.19) rank = 4 - rank;
      if (y > a && amount > 0.36) rank = (back ? -9 : 9) - rank;
      if (x + y > 2 * a && y > a && amount > 0.46)
        rank = (back ? 13 : -13) - rank;
      if (amount > 0.52 && amount < 0.83) {
        rank += Math.sign(f.x) * 24 * ease(0.58, 0.64, amount);
        if (x + y > a) rank += Math.sign(f.x) * 40 * ease(0.65, 0.71, amount);
      }
      for (let n = 0; n < 3; n++) layers.setX(i + n, rank);
    }
    layers.needsUpdate = true;
    mat.uniforms.uFold.value = amount;
    pos.needsUpdate = true;
  }
  return { mesh, fold, width, height };
}
