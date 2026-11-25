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
    spraySeeds(42),
    new T.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: `uniform vec3 origin,up,velocity; uniform float age,pixels,strength;
      varying float opacity,seed;
      void main(){
        seed=position.z;
        float emit=position.y*.11, t=max(0.,age-emit), a=position.x*6.28318;
        float jet=(1.-exp(-t*4.2))*(.79+.49*seed)*strength;
        vec3 p=origin+velocity*(emit+.085*(1.-exp(-t*9.)))+up*jet;
        p+=vec3(cos(a),.1,sin(a))*(.02+.45*t)*strength + vec3(.54,.24,-.1)*t;
        vec4 eye=viewMatrix*vec4(p,1.);
        gl_Position=projectionMatrix*eye;
        gl_PointSize=clamp(pixels*(.13+.49*t)*strength/-eye.z,1.,48.);
        opacity=smoothstep(0.,.05,t)*(1.-smoothstep(.13,.64,t))*.20;
      }`,
      fragmentShader: `varying float opacity,seed;
      void main(){vec2 q=(gl_PointCoord-.5)*2.;
        float edge=length(q)+.08*sin(7.*q.x+seed*12.)*sin(6.*q.y);
        gl_FragColor=vec4(.94,.92,.84,opacity*(1.-smoothstep(.14,1.,edge)));
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
