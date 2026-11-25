import * as T from "three";
import swimUrl from "./assets/aurelia-swim.webp?url";

// 64 transparent frames rendered from the portfolio's Aurelia GPU simulation.
// World-space placement lets the water surface, seabed and chain occlude them.
export function createJellyfish(scene: T.Scene) {
  const atlas = new T.TextureLoader().load(swimUrl);
  atlas.generateMipmaps = false;
  atlas.minFilter = T.LinearFilter;
  const school = new T.Group();
  school.name = "Aurelia jellyfish";
  scene.add(school);
  const plane = new T.PlaneGeometry(1, 1);
  const specimens = [
    { x: -1.49, y: -1.95, z: 0.1, size: 2.06, phase: 0.14, clarity: 0.87 },
    { x: 3.04, y: -1.76, z: -2.45, size: 1.21, phase: 0.66, clarity: 0.63 },
    { x: -4.52, y: -1.39, z: -4.4, size: 0.96, phase: 0.39, clarity: 0.45 },
    { x: 0.03, y: -1.75, z: -7.2, size: 0.82, phase: 0.89, clarity: 0.33 },
  ].map((spec) => {
    const material = new T.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uAtlas: { value: atlas },
        uFrame: { value: 0 },
        uOpacity: { value: 0 },
        uSize: { value: spec.size },
        uTilt: { value: 0 },
      },
      vertexShader: `uniform float uSize,uTilt; varying vec2 texCoord;
        void main(){texCoord=uv;vec4 center=modelViewMatrix*vec4(0.,0.,0.,1.);
        vec2 offset=position.xy*vec2(.857143,1.)*uSize;
        center.xy+=mat2(cos(uTilt),sin(uTilt),-sin(uTilt),cos(uTilt))*offset;
        gl_Position=projectionMatrix*center;}`,
      fragmentShader: `uniform sampler2D uAtlas; uniform float uFrame,uOpacity; varying vec2 texCoord;
        vec4 frame(float index){
          vec2 cell=vec2(mod(index,8.),7.-floor(index/8.));
          return texture2D(uAtlas,(cell+clamp(texCoord,vec2(.003),vec2(.997)))/8.);
        }
        void main(){
          vec4 a=frame(floor(uFrame)),b=frame(mod(floor(uFrame)+1.,64.));
          float f=fract(uFrame),alpha=mix(a.a,b.a,f);
          if(alpha<.012)discard;
          vec3 c=mix(a.rgb*a.a,b.rgb*b.a,f)/alpha;
          c=mix(c*vec3(.83,1.12,1.16),vec3(.43,.77,.79),.25);
          gl_FragColor=vec4(c,alpha*uOpacity);
        }`,
    });
    const mesh = new T.Mesh(plane, material);
    mesh.frustumCulled = false;
    school.add(mesh);
    return { spec, mesh };
  });
  return (dive: number, time: number) => {
    school.visible = dive > 0.02;
    if (!school.visible) return;
    for (const { spec, mesh } of specimens) {
      const p = time * 0.24 + spec.phase * 6.283;
      mesh.position.set(
        spec.x + 0.24 * Math.sin(p),
        spec.y + 0.16 * Math.sin(p * 0.72 + spec.phase),
        spec.z + 0.13 * Math.cos(p * 0.58),
      );
      const u = mesh.material.uniforms;
      u.uFrame.value =
        ((time * (0.17 + spec.phase * 0.035) + spec.phase) % 1) * 64;
      u.uTilt.value = 0.15 * Math.sin(p) + 0.09;
      u.uOpacity.value =
        spec.clarity * T.MathUtils.smoothstep(dive, 0.12, 0.88);
    }
  };
}
