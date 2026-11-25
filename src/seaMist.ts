import * as T from "three";
import { wave, waveGLSL } from "./waves";

export function createSeaMist(scene: T.Scene) {
  const capacity = 80;
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
    uniforms: {
      elapsed: { value: 0 },
      density: { value: 1 },
      uTime: { value: 0 },
      uSwell: { value: 1 },
    },
    vertexShader: `
      attribute vec4 launch,gust;
      uniform float elapsed,uTime;
      varying vec2 patchUV; varying float age,seed,fade;
      ${waveGLSL}
      void main(){
        age=elapsed-launch.w; seed=gust.w; patchUV=uv;
        float impact=launch.y;
        float t=clamp(age/(.80+.24*seed+.12*impact),0.,1.);
        fade=smoothstep(0.,.15,t)*(1.-smoothstep(.28,1.,t))*(1.+.55*impact);
        if(fade<=0.) {gl_Position=vec4(2.,2.,2.,1.); return;}
        vec2 xz=launch.xz+gust.xz*t;
        float h=heightAt(xz,uTime)+.07+gust.y*sin(t*2.);
        vec4 eye=viewMatrix*vec4(xz.x,h,xz.y,1.);
        eye.xy+=position.xy*vec2(mix(1.1+1.4*t,.35+1.4*t,impact),.12+(.32+.52*impact)*t)*(.78+.42*seed);
        gl_Position=projectionMatrix*eye;
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
        gl_FragColor=vec4(mix(vec3(.63,.74,.75),vec3(.91,.90,.80),vapor),soft*vapor*fade*density*.44);
      }`,
  });
  const mist = new T.Mesh(geometry, material);
  mist.name = "Wave crest mist";
  mist.frustumCulled = mist.visible = false;
  scene.add(mist);

  let accumulated = 0,
    next = 0;
  const uniforms = material.uniforms;
  let lastEmission = -10;
  function emit(
    x: number,
    z: number,
    vx: number,
    lift: number,
    vz: number,
    impact: number,
    seed: number,
  ) {
    lastEmission = uniforms.elapsed.value;
    launches.setXYZW(next, x, impact, z, lastEmission);
    gusts.setXYZW(next, vx, lift, vz, seed);
    next = (next + 1) % capacity;
    launches.needsUpdate = true;
    gusts.needsUpdate = true;
    mist.visible = true;
  }
  return {
    impact(
      x: number,
      z: number,
      radiusX: number,
      radiusZ: number,
      yaw: number,
      strength: number,
    ) {
      const count = Math.ceil(15 * strength),
        cs = Math.cos(yaw),
        sn = Math.sin(yaw);
      for (let i = 0; i < count; i++) {
        const a = ((i + Math.random() * 0.75) * 2 * Math.PI) / count,
          dx = Math.cos(a),
          dz = Math.sin(a);
        const seed = Math.random(),
          ox = dx * radiusX,
          oz = dz * radiusZ;
        emit(
          x + cs * ox + sn * oz,
          z - sn * ox + cs * oz,
          0.38 + (cs * dx + sn * dz) * (0.55 + seed * 0.48) * strength,
          (0.32 + 0.48 * seed) * strength,
          (-sn * dx + cs * dz) * (0.6 + seed * 0.42) * strength,
          1,
          seed,
        );
      }
    },
    update(
      dt: number,
      time: number,
      boat: T.Object3D,
      swell: number,
      reduced: boolean,
      openWater: boolean,
    ) {
      uniforms.elapsed.value += dt;
      uniforms.uTime.value = time;
      uniforms.uSwell.value = swell;
      uniforms.density.value = reduced ? 0.65 : 1;
      mist.visible = uniforms.elapsed.value - lastEmission < 1.2;
      if (!openWater) return;
      // Sample open water beyond the hull. Only emit on convex, elevated
      // sections of swell, with a single wind direction across the whole sea.
      accumulated += dt * (reduced ? 24 : 48);
      while (accumulated >= 1) {
        accumulated--;
        const x = boat.position.x + (Math.random() - 0.54) * 26;
        const z = boat.position.z - 5 - Math.random() * 13;
        const h = wave(x, z, time, swell);
        if (h < 0.52 * swell) continue;
        const ahead = wave(x + 0.85, z + 1.25, time, swell);
        const behind = wave(x - 0.85, z - 1.25, time, swell);
        if (h - (ahead + behind) * 0.5 < 0.045 * swell) continue;
        const seed = Math.random();
        emit(x, z, 1.12 + 0.65 * seed, 0.12 + 0.14 * seed, -0.28, 0, seed);
      }
    },
  };
}
