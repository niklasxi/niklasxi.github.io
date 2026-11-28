import * as T from "three";
import { ease, waveGLSL } from "./waves";

type RainWater = {
  uTime: T.IUniform<number>;
  uSwell: T.IUniform<number>;
  uTide: T.IUniform<number>;
  uCut: T.IUniform<number>;
};

const streakVertex = /* glsl */ `
  attribute vec4 drop;
  uniform float uRainTime,uTime;
  varying vec3 vWorld;
  varying vec2 vStreak;
  varying float vLight;
  ${waveGLSL}
  void main() {
    float speed=mix(6.8,10.5,drop.w);
    float age=fract((uRainTime*speed+drop.z)/14.);
    float gust=sin(uRainTime*.83+drop.y*.12)*.36;
    vec3 velocity=vec3(2.35+gust,-speed,-.82);
    vec3 head=vec3(drop.x+velocity.x*age*14./speed,7.8-age*14.,
      drop.y+velocity.z*age*14./speed);
    float depth=length(cameraPosition-head);
    float shutter=mix(.012,.024,drop.w);
    vec3 point=head-velocity*shutter*uv.y;
    vec3 side=cross(velocity, cameraPosition-point);
    side/=max(.001,length(side));
    float width=(.0045+.005*drop.w)*max(1.,depth*.12);
    vWorld=point+side*position.x*width;
    vStreak=uv;
    vLight=smoothstep(.8,2.9,depth)*(1.-smoothstep(17.,38.,depth))
      *smoothstep(0.,.04,age)*(1.-smoothstep(.94,1.,age))
      *mix(.45,1.,drop.w);
    gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);
  }
`;

const streakFragment = /* glsl */ `
  uniform float uTime,uCut,uStrength;
  varying vec3 vWorld;
  varying vec2 vStreak;
  varying float vLight;
  ${waveGLSL}
  void main() {
    float above=vWorld.y-heightAt(vWorld.xz,uTime);
    if(above<0.) discard;
    // Use the same split-level waterline as the sky and seabed pass.
    vec3 ray=vWorld-cameraPosition;
    float atCut=(uCut-cameraPosition.z)/min(-.001,ray.z);
    vec3 edge=cameraPosition+ray*atCut;
    float clear=1.;
    if(atCut>0. && atCut<1.)
      clear=smoothstep(-.01,.055,edge.y-heightAt(edge.xz,uTime));
    float core=1.-smoothstep(.04,.5,abs(vStreak.x-.5));
    float trail=(1.-smoothstep(.1,1.,vStreak.y))*smoothstep(0.,.09,vStreak.y);
    float opacity=core*trail*vLight*clear*smoothstep(0.,.075,above)*uStrength;
    gl_FragColor=vec4(vec3(.77,.85,.90),opacity);
  }
`;

const rippleVertex = /* glsl */ `
  attribute vec4 drop;
  uniform float uRainTime,uTime;
  varying vec2 vLocal;
  varying vec3 vSurfacePoint;
  varying float vAge,vLight;
  ${waveGLSL}
  void main() {
    float cycle=uRainTime*mix(1.45,2.1,drop.w)+drop.z;
    vAge=fract(cycle)*1.3;
    vec2 center=drop.xy+vec2(.27,-.18)*sin(floor(cycle)*2.4+drop.z);
    float radius=mix(.085,.19,drop.w);
    vLocal=position.xy*2.;
    vec2 point=center+vLocal*radius;
    float surface=heightAt(point,uTime);
    vSurfacePoint=vec3(point.x,surface+.016,point.y);
    vec3 toEye=cameraPosition-vSurfacePoint;
    float distance=length(toEye);
    vLight=smoothstep(0.,.16,toEye.y)*(1.-smoothstep(11.,28.,distance));
    gl_Position=projectionMatrix*viewMatrix*vec4(vSurfacePoint,1.);
  }
`;

const rippleFragment = /* glsl */ `
  uniform float uStrength,uCut,uTime;
  varying vec2 vLocal;
  varying vec3 vSurfacePoint;
  varying float vAge,vLight;
  ${waveGLSL}
  void main() {
    if(vAge>=1. || vSurfacePoint.z>uCut) discard;
    vec3 ray=vSurfacePoint-cameraPosition;
    vec3 edge=cameraPosition+ray*(uCut-cameraPosition.z)/min(-.001,ray.z);
    float clear=smoothstep(.015,.09,edge.y-heightAt(edge.xz,uTime));
    if(clear<.004) discard;
    float r=length(vLocal);
    float ring=1.-smoothstep(.022,.10,abs(r-(.12+.77*vAge)));
    float rebound=1.-smoothstep(.025,.08,abs(r-(.05+.52*vAge)));
    float glint=.18+.82*smoothstep(-.25,.77,-vLocal.x+vLocal.y);
    float splash=(1.-smoothstep(.03,.19,r))*(1.-smoothstep(.025,.20,vAge));
    float decay=(1.-smoothstep(.12,1.,vAge))*smoothstep(0.,.035,vAge);
    float opacity=((ring+.25*rebound)*glint*decay+.8*splash)*vLight*uStrength*clear;
    gl_FragColor=vec4(vec3(.66,.81,.84),opacity);
  }
`;

export function createOceanRain(scene: T.Scene, water: RainWater) {
  let seed = 5417;
  const sample = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  function makeLayer(name: string, count: number, radius: number, layerDepth: number,
    vertexShader: string, fragmentShader: string) {
    const quad = new T.PlaneGeometry(1, 1);
    const geometry = new T.InstancedBufferGeometry();
    geometry.setIndex(quad.index);
    geometry.setAttribute("position", quad.attributes.position);
    geometry.setAttribute("uv", quad.attributes.uv);
    const drops = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      drops.set([(sample() * 2 - 1) * radius, 17 - sample() * layerDepth, sample() * 14, sample()], i * 4);
    }
    geometry.setAttribute("drop", new T.InstancedBufferAttribute(drops, 4));
    geometry.instanceCount = count;
    const uniforms = { ...water, uRainTime: { value: 0 }, uStrength: { value: 0 } };
    const material = new T.ShaderMaterial({
      uniforms, vertexShader, fragmentShader, transparent: true,
      depthWrite: false, side: T.DoubleSide, forceSinglePass: true,
    });
    const mesh = new T.Mesh(geometry, material);
    mesh.name = name;
    mesh.frustumCulled = false;
    scene.add(mesh);
    return { mesh, geometry, uniforms, count };
  }

  const streaks = makeLayer("Wind-driven rain", 6400, 23, 48, streakVertex, streakFragment);
  const ripples = makeLayer("Rain impacts", 1600, 17, 38, rippleVertex, rippleFragment);
  return (shot: number, sinceImpact: number, pullback: number, reduced: boolean) => {
    // Let the near-field rain recede as the camera sinks, then return at the waterline.
    const visible = ease(.23, .95, shot) * (1 - .92 * ease(.04, 1.2, sinceImpact) * (1 - pullback));
    for (const [layer, strength] of [[streaks, .48], [ripples, .36]] as const) {
      layer.mesh.visible = visible > .005;
      layer.geometry.instanceCount = reduced ? Math.floor(layer.count * .46) : layer.count;
      layer.uniforms.uRainTime.value = reduced ? .7 : shot;
      layer.uniforms.uStrength.value = visible * strength * (reduced ? .54 : 1);
    }
  };
}
