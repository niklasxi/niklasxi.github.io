import * as T from "three";
import { waveGLSL } from "./waves";

const seabed = -3.65;
export { seabed };
const skyCode = `
uniform sampler2D uSky;
uniform vec3 uSun;
vec3 sky(vec3 d) {
  float lon=atan(d.x,-d.z);
  float u=.362+(lon-atan(uSun.x,-uSun.z))/2.1;
  float v=clamp(asin(clamp(d.y,-1.,1.))/.68,0.002,.998);
  vec3 c=texture2D(uSky,vec2(1.-abs(mod(u,2.)-1.),v)).rgb;
  return c;
}`;

export const causticsGLSL = `
    float caustic(vec2 p,float t){
      vec2 q=p+vec2(sin(p.y*1.7+t*.5)+sin(p.x*1.2-t*.21),
                    sin(p.x*1.8-t*.35)+cos(p.y*1.7+t*.35))*.24;
      float k=sin(q.x*3.3+q.y*1.1+t*.21)+sin(q.y*3.14-q.x*1.12-t*.31)+.55*sin(dot(q,vec2(2.7,-3.5))-t*.23);
      return pow(max(0.,1.-abs(k)*.81),7.);
    }
`;

const noiseCode = `
uniform sampler2D uNoise;
float noise(vec2 p) {return texture2D(uNoise,p/256.).r;}
float fb(vec2 p) {return .55*noise(p)+.28*noise(p*2.1+23.)+.17*noise(p*4.4+71.);}
`;

// A small tile of repeatable smooth noise gives the sand and capillary waves
// detail without fetching a remote texture or tying anything to screen space.
function noiseTexture() {
  let seed = 7412;
  const bytes = new Uint8Array(256 * 256);
  for (let i = 0; i < bytes.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    bytes[i] = seed >>> 24;
  }
  const tex = new T.DataTexture(bytes, 256, 256, T.RedFormat);
  tex.wrapS = tex.wrapT = T.RepeatWrapping;
  tex.magFilter = T.LinearFilter;
  tex.minFilter = T.LinearMipMapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

export function createEnvironment(
  skyTexture: T.Texture,
  ripples: T.Texture,
  sand: T.Texture,
  camera: T.PerspectiveCamera,
  reflection: T.WebGLRenderTarget,
  transmission: T.WebGLRenderTarget,
) {
  const uniforms = {
    uTime: { value: 0 },
    uDive: { value: 0 },
    uCut: { value: 0 },
    uCamera: { value: camera.position },
    uCameraWorld: { value: camera.matrixWorld },
    uInvProj: { value: camera.projectionMatrixInverse },
    uSky: { value: skyTexture },
    uNoise: { value: noiseTexture() },
    uSun: { value: new T.Vector3(-0.22, 0.052, -1).normalize() },
    uBoat: { value: new T.Vector3() },
    uAnchor: { value: new T.Vector3() },
    uReflection: { value: reflection.texture },
    uTransmission: { value: transmission.texture },
    uReflectMatrix: { value: new T.Matrix4() },
    uAspect: { value: 1 },
    uTan: { value: 0.34 },
    uContact: { value: 0 },
    uWorldToHull: { value: new T.Matrix4() },
    uHullMask: { value: null as T.Texture | null },
    uHullBounds: { value: new T.Vector4() },
    uHullLevels: { value: new T.Vector2() },
    uSwell: { value: 0 },
    uWake: { value: 0 },
    uImpact: { value: -1 },
    uBreaches: {
      value: Array.from({ length: 6 }, () => new T.Vector4(0, 0, -1, 0)),
    },
    uRipples: { value: ripples },
    uSand: { value: sand },
    uViewProjection: { value: new T.Matrix4() },
  };
  const background = new T.Mesh(
    new T.PlaneGeometry(2, 2),
    new T.ShaderMaterial({
      uniforms,
      depthWrite: true,
      depthTest: true,
      vertexShader: `varying vec2 vScreen; void main(){vScreen=position.xy; gl_Position=vec4(position.xy,.99999,1.);}`,
      fragmentShader: `
    varying vec2 vScreen;
    uniform mat4 uCameraWorld,uInvProj,uViewProjection;
    uniform sampler2D uSand;
    uniform vec3 uCamera,uAnchor;
    uniform float uTime,uDive,uCut;
    ${skyCode}
    ${noiseCode}
    ${waveGLSL}
    ${causticsGLSL}
    void main(){
      vec4 r=uInvProj*vec4(vScreen,1.,1.);
      vec3 d=normalize(mat3(uCameraWorld)*r.xyz);
      vec3 col=sky(d);
      gl_FragDepth=1.;
      float cutDist=(uCut-uCamera.z)/min(-.001,d.z);
      vec3 edge=uCamera+d*cutDist;
      float line=heightAt(edge.xz,uTime)-edge.y;
      if(uDive>.001 && line>-.016){
        float dy=max(.001,-d.y);
        float dist=min(160.,(uCamera.y+${-seabed})/dy);
        vec3 p=uCamera+dist*d;
        vec2 sand=p.xz;
        vec4 depth=uViewProjection*vec4(p,1.);
        gl_FragDepth=depth.z/depth.w*.5+.5;
        vec3 bed=texture2D(uSand,sand*.148).rgb;
        vec3 second=texture2D(uSand,mat2(.8,.6,-.6,.8)*sand*.29+.36).rgb;
        bed=mix(bed,second,.22);
        float ca=caustic(sand*1.32+fb(sand*.6)*.24,uTime)*.6+caustic(sand*.98+.51,uTime*.8)*.26;
        float shadow=exp(-dot((sand-uAnchor.xz)/vec2(.88,.52),(sand-uAnchor.xz)/vec2(.88,.52)));
        vec3 floorColor=bed*vec3(.39,.81,.71)*(1.-.55*shadow);
        floorColor+=ca*vec3(.16,.26,.20);
        float fog=exp(-.068*max(0.,dist-3.));
        vec3 deep=mix(vec3(.026,.237,.254),vec3(.055,.436,.423),exp(-line*.73));
        vec3 wet=mix(deep,floorColor,fog);
        float shaft=pow(fb(vec2(edge.x*1.02-edge.y*.56+uTime*.055,4.37)),2.);
        wet+=vec3(.085,.17,.133)*shaft*exp(-line*.33);
        float rim=exp(-abs(line-.023)*38.);
        wet=mix(wet,vec3(.42,.70,.62),rim*.7);
        col=mix(col,wet,smoothstep(-.016,.006,line));
      }
      gl_FragColor=vec4(col,1.);
    }`,
    }),
  );
  background.renderOrder = -10;
  background.frustumCulled = false;

  // Exponential spacing keeps the swells finely tessellated at the hull and
  // continues the ocean for kilometres without a visible square boundary.
  const geometry = new T.PlaneGeometry(1, 1, 218, 182);
  const water = new T.Mesh(
    geometry,
    new T.ShaderMaterial({
      uniforms,
      side: T.DoubleSide,
      vertexShader: `
    uniform float uTime,uCut,uAspect,uTan;
    uniform vec3 uCamera;
    varying vec3 vWorld;
    varying float vFromCut;
    ${waveGLSL}
    void main(){
      float distanceFromCut=(exp(uv.y*7.75)-1.)*.77;
      float z=uCut-distanceFromCut;
      float halfWidth=(uCamera.z-z)*(uTan*uAspect+0.32)+2.;
      float x=uCamera.x+(uv.x*2.-1.)*halfWidth;
      vWorld=vec3(x,heightAt(vec2(x,z),uTime),z);
      vFromCut=distanceFromCut;
      gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);
    }`,
      fragmentShader: `
    varying vec3 vWorld; varying float vFromCut;
    uniform vec3 uCamera,uBoat;
    uniform float uTime,uDive,uContact,uWake,uImpact;
    uniform vec4 uBreaches[6],uHullBounds;
    uniform vec2 uHullLevels;
    uniform mat4 uWorldToHull;
    uniform sampler2D uHullMask;
    uniform mat4 uReflectMatrix,uViewProjection;
    uniform sampler2D uReflection,uRipples,uTransmission;
    ${skyCode}
    ${noiseCode}
    ${waveGLSL}
    vec2 fineSlope(vec2 p,float dist){
      float t=uTime;
      float warp=1.3*sin(p.x*1.86+p.y*.63+t*.63)+2.1*sin(p.x*.6-p.y*.31+t*.28);
      vec2 q=p+vec2(warp*.15,warp*.13+sin(p.y*.73+t*.33)*.18);
      vec2 wind=vec2(t*.047,t*.12);
      vec2 swell=texture2D(uRipples,q*.091+wind*.35).rg*2.-1.;
      vec2 chop=texture2D(uRipples,mat2(.92,.39,-.39,.92)*q*.24-wind*.65).rg*2.-1.;
      vec2 fine=texture2D(uRipples,q*vec2(.61,.77)+wind*.64).rg*2.-1.;
      vec2 s=(swell*.53+chop*.28+fine*.12)/(1.+dist*.013);
      return s;
    }
    void main(){
      vec3 p=vWorld;
      if(uContact>0. && all(lessThan(abs(p.xz-uBoat.xz),vec2(3.5)))) {
        vec3 hull=(uWorldToHull*vec4(p,1.)).xyz;
        vec2 at=(hull.xz-uHullBounds.xy)*uHullBounds.zw;
        if(all(greaterThanEqual(at,vec2(0.))) && all(lessThanEqual(at,vec2(1.)))) {
          vec4 floorSample=texture2D(uHullMask,at);
          if(floorSample.a>.995 && hull.y>=uHullLevels.x+floorSample.r*uHullLevels.y-.003) discard;
        }
      }
      vec3 V=normalize(uCamera-p);
      float dist=length(uCamera-p);
      vec2 slopes=slopeAt(p.xz,uTime)+fineSlope(p.xz,dist);
      vec3 N=normalize(vec3(-slopes.x,1.,-slopes.y));
      vec3 R=reflect(-V,N); float skyVisible=smoothstep(-.13,.055,R.y); R.y=max(.002,R.y);
      float nv=clamp(dot(N,V),0.,1.);
      vec3 mirrorSky=sky(R);
      float fres=(.115+.79*pow(1.-nv,3.45))*mix(.13,1.,skyVisible);
      float crest=clamp(.5+.96*p.y-slopes.y*.71,0.,1.);
      vec3 body=mix(vec3(.007,.060,.087),vec3(.045,.214,.229),crest);
      vec3 col=mix(body,mirrorSky,fres);
      float sunFacing=clamp(dot(R,uSun),0.,1.);
      float disk=exp(-max(0.,1.-sunFacing)*1350.);
      float glow=exp(-max(0.,1.-sunFacing)*59.);
      col+=skyVisible*(vec3(.89,.72,.42)*disk+vec3(.11,.063,.026)*glow);
      vec2 local=p.xz-uBoat.xz;
      float nearHull=exp(-dot(local/vec2(2.1,1.05),local/vec2(2.1,1.05)) * 1.8)*uContact;
      col*=1.-nearHull*.39;
      vec4 projected=uReflectMatrix*vec4(p.x,(uBoat.y+.16)*min(1.,uSwell*2.6),p.z,1.);
      vec2 uv=projected.xy/projected.w*.5+.5;
      uv+=vec2(slopes.x*.080,slopes.y*.123)*min(1.,dist*.15);
      if(all(greaterThan(uv,vec2(0.))) && all(lessThan(uv,vec2(1.)))){
        vec4 boat=texture2D(uReflection,uv);
        col=mix(col,boat.rgb,(.23+.14*nearHull)*boat.a*uContact);
      }
      if(uDive>.001) {
        // Transmit the submerged links through the thin strip of surface
        // between the bow and the camera's moving waterline.
        vec4 clip=uViewProjection*vec4(p,1.);
        vec2 refracted=clip.xy/clip.w*.5+.5+slopes*vec2(.002,.003);
        vec4 link=texture2D(uTransmission,refracted);
        vec3 underwaterMetal=pow(max(link.rgb,vec3(0.)),vec3(1./2.2));
        col=mix(col,underwaterMetal,link.a*uDive*.88);
      }
      // Foam advects behind the stern and spreads into two turbulent arms.
      vec2 aft=normalize(vec2(.91,.42)); float along=dot(local,aft);
      float crossWake=dot(local,vec2(-aft.y,aft.x));
      float turbulence=fb(p.xz*2.8+vec2(uTime*.55,0.));
      float edge=abs(crossWake)-(.33+.14*max(0.,along));
      float foam=exp(-edge*edge/(.09+.025*max(0.,along)))+.35*exp(-crossWake*crossWake/(.36+.12*max(0.,along)));
      foam*=smoothstep(.15,1.6,along)*exp(-max(0.,along)*.071)*uWake;
      float ring=0.;
      if(uImpact>=0. && uImpact<2.) {
        float radius=length(local*vec2(.63,1.));
        ring=exp(-pow((radius-.65-uImpact*1.95)/(.13+.06*uImpact),2.))*exp(-uImpact*1.9);
      }
      col=mix(col,vec3(.88,.91,.83),clamp((foam+ring)*smoothstep(.24,.72,turbulence),0.,.88));
      if(uWake>.99) {
        float whitewater=0.;
        for(int i=0; i<6; i++) {
          vec4 event=uBreaches[i];
          vec2 delta=p.xz-event.xy+vec2(event.z*.30,0.);
          if(event.z<0. || dot(delta,delta)>30.) continue;
          float age=event.z;
          float r=length(delta*vec2(.81,1.08))/event.w;
          float grain=fb(p.xz*4.7+vec2(age*.5,-age*.34));
          float edge=r-(.24+age*1.14)+(grain-.5)*.75;
          float ring=exp(-edge*edge/(.035+.085*age));
          float churn=exp(-r*r/(.25+age*.8))*exp(-age*.95);
          whitewater=max(whitewater,(ring*.68+churn)*smoothstep(.28,.71,grain)
               *smoothstep(0.,.09,age)*(1.-smoothstep(.45,3.2,age)));
        }
        col=mix(col,vec3(.86,.89,.80),min(whitewater,.86));
      }
      float rim=exp(-vFromCut*24.)*uDive;
      col=mix(col,vec3(.36,.66,.60),rim*.85);
      float air=1.-exp(-dist*.0028);
      col=mix(col,sky(vec3(-V.x,.002,-V.z)),air*.66);
      gl_FragColor=vec4(col,1.);
    }`,
    }),
  );
  water.frustumCulled = false;
  water.renderOrder = -5;
  return { background, water, uniforms };
}
