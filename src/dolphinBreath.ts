import * as T from "three";
import { spraySeeds } from "./impactSpray";

export function createDolphinBreath(scene: T.Scene) {
  const uniforms = {
    origin: { value: new T.Vector3() },
    up: { value: new T.Vector3() },
    velocity: { value: new T.Vector3() },
    age: { value: 1 },
    pixels: { value: 1 },
    strength: { value: 1 },
  };
  const plume = new T.Points(
    spraySeeds(96),
    new T.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: `uniform vec3 origin,up,velocity; uniform float age,pixels,strength;
      varying float opacity,seed;
      void main(){
        seed=position.z;
        float emit=position.y*.12, t=max(0.,age-emit), a=position.x*6.28318;
        float jet=(1.-exp(-t*4.5))*(.75+.52*seed)*strength;
        vec3 p=origin+velocity*(emit+.08*(1.-exp(-t*9.)))+up*jet;
        p+=vec3(cos(a),.12,sin(a))*(.015+.36*t)*strength + vec3(.58,.22,-.08)*t;
        vec4 eye=viewMatrix*vec4(p,1.);
        gl_Position=projectionMatrix*eye;
        gl_PointSize=clamp(pixels*(.07+.34*t)*strength/max(.4,-eye.z),1.,28.);
        opacity=smoothstep(0.,.04,t)*(1.-smoothstep(.12,.62,t))*.13;
      }`,
      fragmentShader: `varying float opacity,seed;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){
        vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);
      }
      void main(){
        vec2 q=(gl_PointCoord-.5)*2.;
        float n=noise(q*2.4+vec2(seed*19.,seed*7.));
        float edge=length(q)+(n-.5)*.45;
        float a=opacity*(1.-smoothstep(.08,.95,edge))*(.65+.35*n);
        gl_FragColor=vec4(.95,.94,.89,a);
      }`,
    }),
  );
  plume.name = "Blowhole mist";
  plume.frustumCulled = plume.visible = false;
  scene.add(plume);
  return {
    exhale(
      dolphin: T.Mesh,
      blowhole: T.Vector3,
      speed: number,
      climb: number,
      reduced: boolean,
    ) {
      dolphin.localToWorld(uniforms.origin.value.copy(blowhole));
      uniforms.up.value
        .set(-0.16, 1, 0)
        .applyQuaternion(dolphin.quaternion)
        .normalize();
      uniforms.velocity.value.set(-speed, climb, -0.4);
      uniforms.strength.value = reduced ? 0.76 : 1;
      uniforms.age.value = 0;
    },
    update(dt: number, height: number) {
      uniforms.age.value += dt;
      uniforms.pixels.value = height * 1.4;
      plume.visible = uniforms.age.value < 0.76;
    },
  };
}
