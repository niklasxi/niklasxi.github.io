import * as T from "three";
import { wave, waveGLSL } from "./waves";

// Each dolphin has an exit and an entry slot. Fixed world-space footprints
// let the pod move on while the foam spreads across the passing swell.
export function createBreachSplashes(scene: T.Scene, footprints: T.Vector4[]) {
  const sheet = new T.PlaneGeometry(1, 1, 96, 5);
  const droplets = new T.BufferGeometry();
  const seeds = [];
  for (let i = 0; i < 80; i++) {
    seeds.push(i * 2.399963, (i * 0.618034) % 1, (i * 0.754878) % 1);
  }
  droplets.setAttribute("position", new T.Float32BufferAttribute(seeds, 3));

  const slots = footprints.map((footprint, i) => {
    const uniforms = {
      contact: { value: footprint },
      uTime: { value: 0 },
      uSwell: { value: 0 },
      bed: { value: 0 },
      phase: { value: i * 1.78 },
      pixels: { value: 1 },
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
    const spray = new T.Points(
      droplets,
      new T.ShaderMaterial({
        uniforms,
        depthWrite: false,
        transparent: true,
        vertexShader: `uniform vec4 contact; uniform float bed,phase,pixels; varying float fade;
        void main(){
          float a=position.x+phase, seed=position.y, age=max(0.,contact.z-position.z*.13);
          float speed=1.1+seed*2.8, rise=(3.2+position.z*3.1)*contact.w;
          vec2 offset=vec2(cos(a)*1.25,sin(a))*(.21+speed*age)*contact.w;
          offset.x-=age*.65;
          float h=rise*age-4.9*age*age;
          vec4 eye=viewMatrix*vec4(contact.x+offset.x,bed+h,contact.y+offset.y,1.);
          gl_Position=projectionMatrix*eye;
          gl_PointSize=clamp(pixels*(.034+.049*seed)*contact.w/-eye.z,1.,5.);
          fade=smoothstep(0.,.09,h)*(1.-smoothstep(.75,1.3,age));
        }`,
        fragmentShader: `varying float fade; void main(){
        float r=length(gl_PointCoord-.5)*2.;
        gl_FragColor=vec4(.92,.9,.8,fade*.9*(1.-smoothstep(.32,1.,r)));
      }`,
      }),
    );
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
      slots[index].uniforms.bed.value = wave(x, z, time, swell);
    },
    update(dt: number, time: number, swell: number, height: number) {
      for (let i = 0; i < slots.length; i++) {
        const point = footprints[i],
          slot = slots[i];
        if (point.z < 0) continue;
        point.z += dt;
        slot.crown.visible = point.z < 0.98;
        slot.spray.visible = point.z < 1.3;
        slot.uniforms.uTime.value = time;
        slot.uniforms.uSwell.value = swell;
        slot.uniforms.pixels.value = height * 1.4;
        if (point.z > 3.2) point.z = -1;
      }
    },
  };
}
