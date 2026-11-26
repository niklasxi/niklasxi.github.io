import * as T from "three";
import { createImpactSpray, spraySeeds } from "./impactSpray";
import { wave, waveGLSL } from "./waves";

// Each dolphin has an exit and an entry slot. Fixed world-space footprints
// let the pod move on while the foam spreads across the passing swell.
export function createBreachSplashes(scene: T.Scene, footprints: T.Vector4[],
  tide: T.IUniform<number> = { value: 0 }, label = "Dolphin", showCrown = true) {
  const sheet = new T.PlaneGeometry(1, 1, 112, 6);
  const droplets = spraySeeds(340);
  const slots = footprints.map((footprint, i) => {
    const uniforms = {
      contact: { value: footprint },
      uTime: { value: 0 },
      uSwell: { value: 0 },
      uTide: tide,

      phase: { value: i * 1.78 },
    };
    const crown = new T.Mesh(
      sheet,
      new T.ShaderMaterial({
        uniforms,
        transparent: true,
        side: T.DoubleSide,
        depthWrite: false,
        vertexShader: `uniform vec4 contact; uniform float phase; varying vec2 v; varying float vFingers;
        ${waveGLSL}
        uniform float uTime;
        void main() {
          v=uv; float age=contact.z, power=contact.w, a=uv.x*6.28318, top=uv.y;
          float fingers=.72+.20*sin(a*7.+phase)+.14*cos(a*11.-phase);
          vFingers=fingers;
          float radius=.14+age*1.55 + top*(.08+age*.9)*fingers;
          vec2 p=contact.xy+vec2(cos(a)*1.23,sin(a)*.9)*radius*power;
          p.x-=age*.52*power;
          float lip=max(0.,age*(5.6+fingers)-5.4*age*age)*power;
          float h=heightAt(p,uTime)-.12+top*lip*fingers*(.69-.21*cos(a));
          gl_Position=projectionMatrix*viewMatrix*vec4(p.x,h,p.y,1.);
        }`,
        fragmentShader: `uniform vec4 contact; uniform float phase; varying vec2 v; varying float vFingers;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float noise(vec2 p){
          vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
          return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);
        }
        float fbm(vec2 p){return .62*noise(p)+.28*noise(p*2.17+.4)+.10*noise(p*4.41+1.3);}
        void main(){
          float age=contact.z, rim=smoothstep(.58,.98,v.y);
          vec2 uv=vec2(v.x*22.+phase,v.y*3.4-age*3.1);
          float n=fbm(uv);
          float fine=fbm(uv*2.5+vec2(2.3,1.1));
        float tear=smoothstep(.42+.32*v.y,.78+.14*v.y,mix(n,fine,.5)+vFingers*.10);
        float alpha=(.06+.24*rim)*tear*(1.-smoothstep(.26,.78,age))*smoothstep(0.,.05,age);
          vec3 water=vec3(.09,.25,.28);
          vec3 foam=vec3(.88,.91,.88);
          vec3 sun=vec3(.98,.91,.76);
          vec3 col=mix(water,foam,clamp(rim*.65+fine*.45,0.,1.));
          col=mix(col,sun,rim*.5*fine);
          gl_FragColor=vec4(col,alpha);
        }`,
      }),
    );
    const spray = createImpactSpray(droplets, false);
    spray.material.uniforms.phase.value = i * 1.78;
    crown.frustumCulled = spray.frustumCulled = false;
    crown.visible = spray.visible = false;
    crown.name = label + " splash crown " + i;
    spray.name = label + " spray " + i;
    scene.add(crown, spray);
    return { crown, spray, uniforms };
  });
  return {
    strike(
      index: number,
      x: number,
      z: number,
      strength: number,
      time: number,
      swell: number,
    ) {
      footprints[index].set(x, z, 0, strength);
      const spray = slots[index].spray.material.uniforms;
      spray.origin.value.set(x, tide.value + wave(x, z, time, swell), z);
      spray.strength.value = strength;
    },
    clear() {
      for (let i = 0; i < slots.length; i++) {
        footprints[i].z = -1;
        slots[i].crown.visible = false;
        slots[i].spray.visible = false;
      }
    },
    update(dt: number, time: number, swell: number, height: number) {
      for (let i = 0; i < slots.length; i++) {
        const point = footprints[i],
          slot = slots[i];
        if (point.z < 0) continue;
        point.z += dt;
        slot.crown.visible = showCrown && point.z < 0.78;
        slot.spray.visible = point.z < 1.55;
        slot.uniforms.uTime.value = time;
        slot.uniforms.uSwell.value = swell;
        slot.spray.material.uniforms.age.value = point.z;
        slot.spray.material.uniforms.pixels.value = height * 1.4;
        if (point.z > 3.2) point.z = -1;
      }
    },
  };
}
