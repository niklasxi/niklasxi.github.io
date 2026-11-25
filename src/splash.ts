import * as T from "three";
import { createImpactSpray, spraySeeds } from "./impactSpray";

export function createSplash(scene: T.Scene) {
  const spray = createImpactSpray(spraySeeds(360), true);
  spray.name = "Impact droplets";
  scene.add(spray);
  // The impact first throws up a continuous lip of water. Its thinner
  // sections break up into droplets as the crown falls back into the swell.
  const crownGeo = new T.PlaneGeometry(1, 1, 112, 6);
  const crownMat = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    uniforms: { age: { value: 0 }, strength: { value: 1 } },
    vertexShader: `uniform float age,strength; varying vec2 v;
    void main(){
      v=uv;float a=uv.x*6.2831853;
      float lobes=.55+.20*sin(9.*a)+.13*sin(17.*a+1.)+.12*cos(23.*a);
      float h=max(0.,age*(2.7+lobes*1.5)-6.5*age*age)*lobes*strength;
      float r=.22+age*1.72+uv.y*(.12+age*.49);
      vec3 p=vec3((1.40+r)*cos(a),h*uv.y-.05,(.48+r)*sin(a));
      gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
    }`,
    fragmentShader: `uniform float age; varying vec2 v;
    void main(){
      float edge=smoothstep(.78,1.,v.y);
      float lace=sin(150.*v.x+6.*v.y)*cos(31.*v.y-47.*v.x);
      float alpha=(.075+.31*edge)*(1.-smoothstep(.22,.62,age));
      alpha*=smoothstep(-.28,.35,lace+.55-v.y);
      gl_FragColor=vec4(mix(vec3(.25,.47,.47),vec3(.98,.91,.73),edge),alpha);
    }`,
  });
  const crown = new T.Mesh(crownGeo, crownMat);
  crown.frustumCulled = false;
  scene.add(crown);
  const origin = new T.Vector3();
  let active = false;
  return (
    age: number,
    boat: T.Vector3,
    reduced: boolean,
    bufferHeight: number,
  ) => {
    spray.visible = age >= 0 && age < 1.65;
    crown.visible = spray.visible && age < 0.8;
    if (!spray.visible) {
      active = false;
      return;
    }
    if (!active) {
      origin.copy(boat);
      active = true;
    }
    crown.position.copy(origin);
    crown.position.y += 0.16;
    crownMat.uniforms.age.value = age;
    crownMat.uniforms.strength.value = reduced ? 0.46 : 1;
    const un = spray.material.uniforms;
    un.origin.value.copy(crown.position);
    un.age.value = age;
    un.strength.value = reduced ? 0.62 : 1;
    un.pixels.value = bufferHeight * 1.4;
  };
}
