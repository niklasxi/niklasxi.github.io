import * as T from "three";

// Capture the settled ocean on the last frame it is drawn. The moving crest
// refracts both that view and the live dolphin film as it passes the lens.
export function captureMuseumWave(renderer: T.WebGLRenderer) {
  const { width, height } = renderer.domElement;
  const shore = new T.FramebufferTexture(width, height);
  shore.minFilter = shore.magFilter = T.LinearFilter;
  renderer.copyFramebufferToTexture(shore);
  const incoming = new T.WebGLRenderTarget(width, height);
  const scene = new T.Scene();
  const camera = new T.Camera();
  const geometry = new T.PlaneGeometry(2, 2);
  const uniforms = {
    shore: { value: shore }, film: { value: incoming.texture },
    progress: { value: 0 }, reduced: { value: false }, aspect: { value: width / height },
  };
  const material = new T.ShaderMaterial({
    uniforms, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 st; void main(){st=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader: `
      varying vec2 st;
      uniform sampler2D shore,film; uniform float progress,aspect; uniform bool reduced;
      void main(){
        vec2 uv=st; float t=progress;
        if(reduced){gl_FragColor=vec4(mix(texture2D(shore,uv).rgb,texture2D(film,uv).rgb,t),1.);return;}
        float x=uv.x*aspect;
        float h=mix(-.28,1.38,t)+.085*sin(x*5.-t*4.)+.033*sin(x*13.+t*6.)+.01*sin(x*33.-t*11.);
        float depth=h-uv.y;
        float lip=exp(-abs(depth)*28.);
        float wash=smoothstep(-.016,.10,depth);
        vec2 bend=lip*vec2(.009*sin(x*17.+depth*6.),-.037);
        vec3 ocean=texture2D(shore,clamp(uv+bend,0.,1.)).rgb;
        vec3 dolphins=texture2D(film,clamp(uv-bend,0.,1.)).rgb;
        float bubbles=.5+.5*sin(x*67.+5.*sin(x*22.+t*7.)+depth*120.);
        vec3 c=mix(ocean,dolphins,wash);
        c=mix(c,vec3(.045,.37,.39),lip*.65);
        c+=vec3(.58,.78,.73)*exp(-abs(depth+.003)*150.)*(.27+.73*bubbles);
        gl_FragColor=vec4(c,1.);
      }`,
  });
  scene.add(new T.Mesh(geometry, material));
  return {
    incoming,
    composite(progress: number, reduced: boolean) {
      uniforms.progress.value = progress; uniforms.reduced.value = reduced;
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
    },
    dispose() { shore.dispose(); incoming.dispose(); material.dispose(); geometry.dispose(); },
  };
}
