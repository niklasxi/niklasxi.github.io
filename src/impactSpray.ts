import * as T from "three";

export function spraySeeds(count: number) {
  const seeds = new Float32Array(count * 3);
  let state = 9043;
  for (let i = 0; i < seeds.length; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    seeds[i] = state / 4294967296;
  }
  return new T.BufferGeometry().setAttribute(
    "position",
    new T.BufferAttribute(seeds, 3),
  );
}

// Fine droplets decelerate in air and streak along projected screen velocity,
// while a fraction atomizes into soft backlit mist.
export function createImpactSpray(geometry: T.BufferGeometry, boat: boolean) {
  const uniforms = {
    origin: { value: new T.Vector3() },
    age: { value: -1 },
    strength: { value: 1 },
    phase: { value: 0 },
    pixels: { value: 1 },
  };
  const spray = new T.Points(
    geometry,
    new T.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: `uniform vec3 origin; uniform float age,strength,phase,pixels;
      varying vec2 axis; varying float stretch,alpha,glint,blur,mist;
      void main() {
        float a=position.x*6.28318+phase, k=position.y, seed=position.z;
        // Cluster droplets into irregular jets rather than a uniform ring.
        float jet=.58+.42*sin(a*5.+phase*1.7)*cos(a*3.-phase*.9);
        a+=(sin(a*7.+seed*6.28)*.16)*(1.-seed*.4);
        float t=max(0.,age-seed*.14);
        mist=1.-smoothstep(0.,.42,seed);
        vec2 dir=vec2(cos(a),sin(a));
        vec2 rim=dir*${boat ? "vec2(1.55,.48)" : "vec2(.18,.15)"};
        float outward=(.35+${boat ? "4.8" : "2.4"}*seed*jet)*strength;
        vec3 v0=vec3(dir.x*outward,(1.4+${boat ? "5.8" : "3.8"}*k*jet)*strength,dir.y*outward);
        float drag=mix(.55,2.2,mist);
        float expD=exp(-drag*t);
        float disp=(1.-expD)/drag;
        vec3 p=origin+vec3(rim.x,0.,rim.y)+v0*disp+vec3(.12*t*t,-4.9*t*t*(1.-mist*.45),0.);
        vec4 eye=viewMatrix*vec4(p,1.);
        vec3 velWorld=v0*expD+vec3(.24*t,-9.8*t*(1.-mist*.45),0.);
        vec3 velocity=mat3(viewMatrix)*velWorld;
        vec2 projected=velocity.xy-eye.xy*velocity.z/min(eye.z,-.05);
        axis=normalize(projected+vec2(.0001));
        float baseR=(.004+${boat ? ".022" : ".014"}*seed*seed)*strength;
        float radius=mix(baseR,baseR*(1.8+2.6*t),mist);
        float dist=max(.35,-eye.z);
        float width=max(.95,pixels*radius/dist);
        float lengthPx=pixels*length(projected)*.013/dist;
        stretch=mix(clamp(1.+lengthPx/width,1.,5.4),1.25,mist);
        blur=${boat ? "1.-smoothstep(3.5,9.,-eye.z)" : ".08"};
        gl_PointSize=clamp(width*stretch+blur*1.5,1.0,24.);
        gl_Position=projectionMatrix*eye;
        float lifeFade=1.-smoothstep(mix(.85,.45,mist),mix(1.55,.95,mist),t);
        alpha=smoothstep(.0,.05,p.y-origin.y)*lifeFade*mix(.44+.36*seed,.14+.10*seed,mist);
        glint=clamp(.36+.48*cos(a+1.)+.24*seed,0.,1.);
      }`,
      fragmentShader: `varying vec2 axis; varying float stretch,alpha,glint,blur,mist;
      void main(){
        vec2 q=(gl_PointCoord-.5)*2.; q.y=-q.y;
        vec2 coord=vec2(dot(q,vec2(-axis.y,axis.x))*stretch,dot(q,axis));
        float r=length(coord);
        if(r>1.) discard;
        float dropEdge=1.-smoothstep(.26-blur*.12,.96,r);
        float mistEdge=pow(max(0.,1.-r),1.9);
        float edge=mix(dropEdge,mistEdge,mist);
        float shine=exp(-8.*length(coord-vec2(-.28,.20)));
        float rim=smoothstep(.3,.9,r)*(1.-mist);
        vec3 body=mix(vec3(.22,.36,.38),vec3(.78,.85,.85),.38+.42*glint+.30*rim);
        vec3 sun=vec3(1.,.93,.77);
        vec3 col=mix(body,sun,clamp(glint*.52+shine*.65,0.,1.));
        gl_FragColor=vec4(col,alpha*edge);
      }`,
    }),
  );
  spray.visible = false;
  spray.frustumCulled = false;
  return spray;
}
