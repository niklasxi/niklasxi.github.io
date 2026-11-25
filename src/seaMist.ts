import * as T from "three";
import { wave } from "./waves";

export function createSeaMist(scene: T.Scene) {
  const capacity = 48;
  const plane = new T.PlaneGeometry();
  const geometry = new T.InstancedBufferGeometry();
  geometry.index = plane.index;
  geometry.setAttribute("position", plane.getAttribute("position"));
  geometry.setAttribute("uv", plane.getAttribute("uv"));
  const launches = new T.InstancedBufferAttribute(
    new Float32Array(capacity * 4),
    4,
  );
  const gusts = new T.InstancedBufferAttribute(
    new Float32Array(capacity * 4),
    4,
  );
  launches.setUsage(T.DynamicDrawUsage);
  gusts.setUsage(T.DynamicDrawUsage);
  for (let i = 0; i < capacity; i++) launches.setW(i, -10);
  geometry.setAttribute("launch", launches);
  geometry.setAttribute("gust", gusts);
  geometry.instanceCount = capacity;

  const material = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { elapsed: { value: 0 }, density: { value: 1 } },
    vertexShader: `
      attribute vec4 launch,gust;
      uniform float elapsed;
      varying vec2 patchUV;
      varying float age,seed,fade;
      void main(){
        age=elapsed-launch.w; seed=gust.w; patchUV=uv;
        float t=clamp(age/(1.05+.4*seed),0.,1.);
        fade=smoothstep(0.,.13,t)*(1.-smoothstep(.25,1.,t));
        vec3 p=launch.xyz+gust.xyz*(1.-exp(-2.3*t)) + vec3(.65,.21,.07)*t*t;
        vec4 eye=viewMatrix*vec4(p,1.);
        eye.xy+=position.xy*vec2(1.5,1.02)*(.28+1.36*t+.2*seed);
        gl_Position=projectionMatrix*eye;
        if(fade<=0.) gl_Position=vec4(2.,2.,2.,1.);
      }`,
    fragmentShader: `
      uniform float density;
      varying vec2 patchUV;
      varying float age,seed,fade;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){
        vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);
      }
      void main(){
        vec2 p=patchUV*2.-1.;
        vec2 q=p*2.6+vec2(seed*31.-age*.42,age*.34);
        float vapor=.65*noise(q)+.35*noise(q*2.2);
        float soft=1.-smoothstep(.16,.97,length(p)+(vapor-.5)*.43);
        gl_FragColor=vec4(mix(vec3(.66,.76,.75),vec3(1.,.91,.75),vapor),soft*vapor*fade*density*.69);
      }`,
  });
  const mist = new T.Mesh(geometry, material);
  mist.name = "Windblown bow mist";
  mist.frustumCulled = mist.visible = false;
  scene.add(mist);

  let accumulated = 0,
    next = 0;
  const origin = new T.Vector3(),
    drift = new T.Vector3();
  return (
    dt: number,
    time: number,
    boat: T.Object3D,
    follow: number,
    swell: number,
    encounter: number,
    reduced: boolean,
  ) => {
    const clock = (material.uniforms.elapsed.value += dt);
    // Spindrift lifts as the swell steepens in front of the moving bow.
    origin.set(-2.55, 0, 0);
    boat.localToWorld(origin);
    const rise = wave(origin.x, origin.z, time, swell) - boat.position.y;
    const steep = T.MathUtils.smoothstep(Math.abs(rise), 0.07, 0.75);
    accumulated +=
      dt *
      follow *
      follow *
      (9 + 8 * encounter + 14 * steep) *
      (reduced ? 0.4 : 1);
    material.uniforms.density.value = reduced ? 0.58 : 1;
    while (accumulated >= 1) {
      accumulated--;
      const side = Math.random() < 0.5 ? -1 : 1,
        seed = Math.random();
      origin.set(-1.57 + seed * 0.56, 0, side * (0.51 + 0.36 * seed));
      boat.localToWorld(origin);
      origin.y = wave(origin.x, origin.z, time, swell) + 0.09;
      drift
        .set(0.3 + seed * 0.53, 0, side * (0.62 + seed * 0.68))
        .applyQuaternion(boat.quaternion);
      drift.y = (0.48 + steep * 0.60 + seed * 0.26) * (reduced ? 0.65 : 1);
      launches.setXYZW(next, origin.x, origin.y, origin.z, clock);
      gusts.setXYZW(next, drift.x, drift.y, drift.z, seed);
      next = (next + 1) % capacity;
      launches.needsUpdate = true;
      gusts.needsUpdate = true;
      mist.visible = true;
    }
  };
}
