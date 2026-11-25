import * as T from "three";
import { createImpactSpray, spraySeeds } from "./impactSpray";
import { wave, waveGLSL } from "./waves";

// Each dolphin has an exit and an entry slot. Fixed world-space footprints
// let the pod move on while the foam spreads across the passing swell.
export function createBreachSplashes(scene: T.Scene, footprints: T.Vector4[]) {
  const sheet = new T.PlaneGeometry(1, 1, 96, 5);
  const droplets = spraySeeds(150);
  const slots = footprints.map((footprint, i) => {
    const uniforms = {
      contact: { value: footprint },
      uTime: { value: 0 },
      uSwell: { value: 0 },

      phase: { value: i * 1.78 },
    };
    const crown = new T.Mesh(
      sheet,
      new T.ShaderMaterial({
        uniforms,
        transparent: true,
        side: T.DoubleSide,
        depthWrite: false,
        vertexShader: `uniform vec4 contact; uniform float phase; varying vec2 v;
        ${waveGLSL}
        uniform float uTime;
        void main() {
          v=uv; float age=contact.z, power=contact.w, a=uv.x*6.28318, top=uv.y;
          float fingers=.74+.19*sin(a*7.+phase)+.13*cos(a*11.-phase);
          float radius=.15+age*1.55 + top*(.08+age*.9)*fingers;
          vec2 p=contact.xy+vec2(cos(a)*1.23,sin(a)*.9)*radius*power;
          p.x-=age*.52*power;
          float lip=max(0.,age*(5.6+fingers)-5.4*age*age)*power;
          float h=heightAt(p,uTime)-.12+top*lip*fingers*(.69-.21*cos(a));
          gl_Position=projectionMatrix*viewMatrix*vec4(p.x,h,p.y,1.);
        }`,
        fragmentShader: `uniform vec4 contact; uniform float phase; varying vec2 v;
        void main(){
          float age=contact.z, rim=smoothstep(.66,.98,v.y);
          float holes=sin(v.x*176.+v.y*8.+phase)*sin(v.y*22.-v.x*65.);
          float alpha=(.19+.39*rim)*smoothstep(-.48,.17,holes+.68-v.y*.72)
                      *(1.-smoothstep(.35,.98,age))*smoothstep(0.,.06,age);
          gl_FragColor=vec4(mix(vec3(.32,.55,.56),vec3(.96,.9,.76),rim),alpha);
        }`,
      }),
    );
    const spray = createImpactSpray(droplets, false);
    spray.material.uniforms.phase.value = i * 1.78;
    crown.frustumCulled = spray.frustumCulled = false;
    crown.visible = spray.visible = false;
    crown.name = "Dolphin splash crown " + i;
    spray.name = "Dolphin spray " + i;
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
      spray.origin.value.set(x, wave(x, z, time, swell), z);
      spray.strength.value = strength;
    },
    update(dt: number, time: number, swell: number, height: number) {
      for (let i = 0; i < slots.length; i++) {
        const point = footprints[i],
          slot = slots[i];
        if (point.z < 0) continue;
        point.z += dt;
        slot.crown.visible = point.z < 0.98;
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
