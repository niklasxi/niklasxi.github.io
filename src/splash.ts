import * as T from "three";
import { createImpactSpray, spraySeeds } from "./impactSpray";

export function createSplash(scene: T.Scene) {
  const spray = createImpactSpray(spraySeeds(850), true);
  spray.name = "Impact droplets";
  scene.add(spray);
  // The impact first throws up a continuous water sheet that tears into
  // irregular ligaments and aerated spray as it peaks and falls back.
  const crownGeo = new T.PlaneGeometry(1, 1, 128, 8);
  const crownMat = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    uniforms: { age: { value: 0 }, strength: { value: 1 } },
    vertexShader: `uniform float age,strength; varying vec2 v; varying float vLobe;
    void main(){
      v=uv;float a=uv.x*6.2831853;
      float lobes=.52+.22*sin(7.*a+.4)+.14*sin(13.*a+1.2)+.12*cos(21.*a-.6);
      vLobe=lobes;
      float h=max(0.,age*(2.75+lobes*1.55)-6.6*age*age)*lobes*strength;
      float r=.20+age*1.75+uv.y*(.10+age*.52);
      vec3 p=vec3((1.38+r)*cos(a),h*uv.y-.05,(.46+r)*sin(a));
      gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
    }`,
    fragmentShader: `uniform float age; varying vec2 v; varying float vLobe;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float noise(vec2 p){
      vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
      return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);
    }
    float fbm(vec2 p){return .62*noise(p)+.28*noise(p*2.17+.4)+.10*noise(p*4.41+1.3);}
    void main(){
      vec2 uv=vec2(v.x*24.,v.y*3.2-age*2.8);
      float n=fbm(uv);
      float fine=fbm(uv*2.6+vec2(3.1,1.7));
      float breakup=mix(n,fine,.45);
      float rim=smoothstep(.65,1.,v.y);
      float tear=smoothstep(.40+.34*v.y,.78+.14*v.y,breakup+vLobe*.12);
      float foam=smoothstep(.48,.88,fine+rim*.35);
      float alpha=(.02+.22*rim)*(1.-smoothstep(.18,.56,age))*tear;
      vec3 deepWater=vec3(.07,.21,.24);
      vec3 aerated=vec3(.88,.91,.89);
      vec3 sunRim=vec3(1.,.92,.76);
      vec3 col=mix(deepWater,aerated,clamp(foam*.75+rim*.35,0.,1.));
      col=mix(col,sunRim,rim*.55*foam);
      gl_FragColor=vec4(col,alpha);
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
    crown.visible = spray.visible && age < 0.72;
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
