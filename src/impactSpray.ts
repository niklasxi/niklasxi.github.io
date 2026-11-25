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

// A drop slows on the way up, rounds off at the apex and streaks on the way
// down. The projected velocity gives even the nearest drops the right tilt.
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
      varying vec2 axis; varying float stretch,alpha,glint,blur;
      void main() {
        float a=position.x*6.28318+phase, k=position.y, seed=position.z;
        float t=max(0.,age-seed*.135);
        vec2 dir=vec2(cos(a),sin(a));
        vec2 rim=dir*${boat ? "vec2(1.65,.53)" : "vec2(.27,.22)"};
        float outward=(.55+${boat ? "4.9" : "2.9"}*seed)*strength;
        vec3 v=vec3(dir.x*outward,(2.3+${boat ? "6.2" : "4.4"}*k)*strength,dir.y*outward);
        vec3 p=origin+vec3(rim.x,0.,rim.y)+v*t+vec3(.15*t*t,-4.9*t*t,0.);
        vec4 eye=viewMatrix*vec4(p,1.);
        vec3 velocity=mat3(viewMatrix)*(v+vec3(.30*t,-9.8*t,0.));
        vec2 projected=velocity.xy-eye.xy*velocity.z/eye.z;
        axis=normalize(projected+vec2(.0001));
        float radius=(.014+${boat ? ".060" : ".031"}*seed*seed)*strength;
        float width=max(.95,pixels*radius/-eye.z);
        float lengthPx=pixels*length(projected)*.012/-eye.z;
        stretch=clamp(1.+lengthPx/width,1.,5.2);
        blur=${boat ? "1.-smoothstep(3.5,9.,-eye.z)" : ".1"};
        gl_PointSize=clamp(width*stretch+blur*2.,1.1,56.);
        gl_Position=projectionMatrix*eye;
        alpha=smoothstep(.0,.065,p.y-origin.y)*(.56+.41*seed);
        glint=clamp(.42+.45*cos(a+1.)+.25*seed,0.,1.);
      }`,
      fragmentShader: `varying vec2 axis; varying float stretch,alpha,glint,blur;
      void main(){
        vec2 q=(gl_PointCoord-.5)*2.; q.y=-q.y;
        vec2 coord=vec2(dot(q,vec2(-axis.y,axis.x))*stretch,dot(q,axis));
        float r=length(coord);float edge=1.-smoothstep(.48-blur*.2,1.,r);
        float shine=exp(-4.*length(coord-vec2(-.32,.12)));
        vec3 col=mix(vec3(.48,.63,.63),vec3(1.,.90,.68),glint*.85+shine*.15);
        gl_FragColor=vec4(col,alpha*edge);
      }`,
    }),
  );
  spray.visible = false;
  spray.frustumCulled = false;
  return spray;
}
