import * as T from "three";
import { waveGLSL } from "./waves";

const seabed = -3.65;
export { seabed };
const skyCode = `
uniform sampler2D uSky,uStormSky;
uniform float uClearing;
uniform vec3 uSun;
uniform float uSkyMotion;
float cloudLight() {
  float t=uTime*uSkyMotion;
  return .94+.04*sin(t*.083)+.02*sin(t*.137+.8);
}
vec3 sky(vec3 d) {
  float lon=atan(d.x,-d.z);
  float u=.362+(lon-atan(uSun.x,-uSun.z))/2.1;
  float v=clamp(asin(clamp(d.y,-1.,1.))/.68,0.002,.998);
  // The photograph includes the sun. Keep its disk and the horizon fixed
  // while the higher clouds travel and gently deform.
  float sunDistance=length(d-uSun);
  float movable=smoothstep(.06,.23,sunDistance)*smoothstep(.015,.22,v);
  float t=uTime*uSkyMotion;
  vec2 drift=vec2(t*.0014,0.);
  vec2 warp=vec2(sin(v*13.+t*.09),sin(u*11.-t*.065))*.007;
  vec2 uv=vec2(u,v)+(drift+warp)*movable;
  vec3 storm=vec3(0.);
  if(uClearing<1.){
    float elevation=clamp(asin(clamp(d.y,-1.,1.))/.58,0.,1.);
    float layer=smoothstep(.03,.6,elevation);
    // Angular coordinates keep the cloud base on the horizon as the camera dives.
    vec2 overcast=vec2(.332+(lon-atan(uSun.x,-uSun.z))/1.75,elevation);
    overcast.x+=layer*(t*.0010+.019*uClearing);
    overcast.y+=layer*.005*sin(11.*overcast.x+t*.045);
    storm=texture2D(uStormSky,vec2(1.-abs(mod(overcast.x,2.)-1.),clamp(overcast.y,.002,.998))).rgb;
    float haze=exp(-sunDistance*sunDistance*125.);
    storm+=vec3(.13,.112,.076)*haze + vec3(.40,.37,.29)*exp(-dot(d-uSun,d-uSun)*7600.);
    if(uClearing<=0.) return storm;
  }
  vec3 c=texture2D(uSky,vec2(1.-abs(mod(uv.x,2.)-1.),clamp(uv.y,.002,.998))).rgb;
  c*=cloudLight();
  if(uClearing>=1.) return c;
  // Thin cloud toward the low sun clears first. Dense overhead folds linger.
  float density=1.-dot(storm,vec3(.2126,.7152,.0722));
  float onset=.32*clamp(density,0.,1.)+.20*smoothstep(.12,.72,v);
  return mix(storm,c,smoothstep(onset,onset+.48,uClearing));
}`;

export const causticsGLSL = `
    vec2 lightEntry(vec3 point,vec3 sun,float surface){
      vec3 ray=refract(-sun,vec3(0.,1.,0.),1./1.333);
      return point.xz-ray.xz*max(surface-point.y,0.)/-ray.y;
    }
    float caustic(vec2 entry,float t,float blur){
      vec2 p=entry*3.7;
      vec2 q=p+vec2(sin(p.y*1.06+t*.70)+cos(p.x*.89-t*.32),
                    sin(p.x*1.22-t*.47)+cos(p.y*.83+t*.51))*.49;
      float a=sin(q.x+q.y*.37+t*.57);
      float b=sin(q.y-q.x*.41-t*.46);
      float c=sin(dot(q,vec2(.79,-.97))+t*.31);
      float width=.54+blur*.8;
      float folds=exp(-abs(a+b*.83+c*.58)*3.2/width);
      float crossings=exp(-abs(b+c*.73-a*.42)*4.1/width);
      return (.74*folds+.26*crossings+.30*folds*crossings)/(1.+blur);
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
  stormTexture: T.Texture,
  ripples: T.Texture,
  sand: T.Texture,
  camera: T.PerspectiveCamera,
  reflection: T.WebGLRenderTarget,
  transmission: T.WebGLRenderTarget,
) {
  const uniforms = {
    uTime: { value: 0 },
    uExposure: { value: 1 },
    uSkyMotion: { value: 1 },
    uDive: { value: 0 },
    uCut: { value: 0 },
    uCamera: { value: camera.position },
    uCameraWorld: { value: camera.matrixWorld },
    uInvProj: { value: camera.projectionMatrixInverse },
    uSky: { value: skyTexture },
    uStormSky: { value: stormTexture },
    uClearing: { value: 0 },
    uNoise: { value: noiseTexture() },
    uSun: { value: new T.Vector3(-0.22, 0.052, -1).normalize() },
    uBoat: { value: new T.Vector3() },
    uPaperShadow: { value: new T.Vector4() },
    uAnchor: { value: new T.Vector3() },
    uReflection: { value: reflection.texture },
    uTransmission: { value: transmission.texture },
    uReflectMatrix: { value: new T.Matrix4() },
    uAspect: { value: 1 },
    uTan: { value: 0.34 },
    uContact: { value: 0 },
    uMirrorHeight: { value: 0 },
    uReflectionStrength: { value: 0 },
    uWorldToHull: { value: new T.Matrix4() },
    uHullMask: { value: null as T.Texture | null },
    uHullBounds: { value: new T.Vector4() },
    uHullLevels: { value: new T.Vector2() },
    uSwell: { value: 0 },
    uTide: { value: 0 },
    uSnap: { value: new T.Vector4(0, 0, -1, 0) },
    uWake: { value: 0 },
    uImpact: { value: -1 },
    uBreaches: {
      value: Array.from({ length: 6 }, () => new T.Vector4(0, 0, -1, 0)),
    },
    uRipples: { value: ripples },
    uSand: { value: sand },
    uViewProjection: { value: new T.Matrix4() },
    uOceanOrigin: { value: new T.Vector2() },
    uOceanForward: { value: new T.Vector2(0, -1) },
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
    uniform float uExposure;
    uniform mat4 uCameraWorld,uInvProj,uViewProjection;
    uniform sampler2D uSand,uRipples;
    uniform vec3 uCamera,uAnchor;
    uniform vec4 uPaperShadow;
    uniform float uTime,uDive,uCut;
    ${noiseCode}
    ${skyCode}
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
        vec2 entry=lightEntry(p,uSun,uTide);
        float blur=smoothstep(8.,27.,dist);
        float lightingTime=uTime*uSkyMotion;
        float ca=caustic(entry,lightingTime,blur);
        float lightPatch=smoothstep(.23,.76,fb(entry*3.8+vec2(lightingTime*.3,0.)));
        float shadow=exp(-dot((sand-uAnchor.xz)/vec2(.88,.52),(sand-uAnchor.xz)/vec2(.88,.52)));
        float daylight=mix(.68,1.,uClearing)*cloudLight();
        vec3 floorColor=bed*(vec3(.39,.81,.71)+ca*daylight*vec3(.82,1.42,1.25));
        floorColor+=daylight*(ca*vec3(.03,.15,.13)+lightPatch*vec3(.014,.055,.048));
        floorColor*=1.-.55*shadow;
        vec2 paperOffset = (sand-uPaperShadow.xy) / vec2(.48,.34);
        floorColor *= 1. - uPaperShadow.z * exp(-dot(paperOffset,paperOffset));
        float fog=exp(-.068*max(0.,dist-3.));
        vec3 deep=mix(vec3(.026,.237,.254),vec3(.055,.436,.423),exp(-line*.73));
        vec3 wet=mix(deep,floorColor,fog);
        vec3 scatterPoint=mix(edge,p,min(.24,4./max(dist,4.)));
        vec2 shaftEntry=lightEntry(scatterPoint,uSun,uTide);
        float shaft=smoothstep(.30,.77,fb(shaftEntry*vec2(4.3,3.)+vec2(lightingTime*.22,4.37)));
        wet+=vec3(.048,.16,.14)*daylight*shaft*exp(-max(line,0.)*.64);
        vec2 rippleUV=vec2(edge.x*.36,line*1.6)+vec2(lightingTime*.04,-lightingTime*.034);
        float rippledLight=texture2D(uRipples,rippleUV).r;
        float crest=exp(-max(line,0.)*4.6);
        wet+=vec3(.055,.26,.23)*daylight*crest*mix(.28,1.,rippledLight);
        float rim=exp(-abs(line-.013)*57.);
        wet=mix(wet,vec3(.43,.73,.65),rim*(.20+.38*rippledLight));
        wet*=mix(vec3(.70,.79,.85),vec3(1.),uClearing);
        col=mix(col,wet,smoothstep(-.016,.006,line));
      }
      gl_FragColor=vec4(col*uExposure,1.);
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
    uniform vec2 uOceanOrigin,uOceanForward;
    uniform vec3 uCamera;
    varying vec3 vWorld;
    varying float vFromCut;
    ${waveGLSL}
    void main(){
      float distanceFromCut=(exp(uv.y*7.75)-1.)*.77;
      float depth=uCamera.z-uCut+distanceFromCut;
      float halfWidth=depth*(uTan*uAspect+0.32)+2.;
      vec2 across=vec2(-uOceanForward.y,uOceanForward.x);
      vec2 p=uCamera.xz+depth*uOceanForward+(uv.x*2.-1.)*halfWidth*across;
      float y=heightAt(p+uOceanOrigin,uTime);
      vWorld=vec3(p.x,y,p.y);
      vFromCut=distanceFromCut;
      gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);
    }`,
      fragmentShader: `
    varying vec3 vWorld; varying float vFromCut;
    uniform vec3 uCamera,uBoat;
    uniform float uMirrorHeight,uReflectionStrength,uExposure;
    uniform float uTime,uDive,uContact,uWake,uImpact;
    uniform vec2 uOceanOrigin;
    uniform vec4 uBreaches[6],uHullBounds,uSnap;
    uniform vec2 uHullLevels;
    uniform mat4 uWorldToHull;
    uniform sampler2D uHullMask;
    uniform mat4 uReflectMatrix,uViewProjection;
    uniform sampler2D uReflection,uRipples,uTransmission;
    ${noiseCode}
    ${skyCode}
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
      vec2 slopes=slopeAt(p.xz+uOceanOrigin,uTime)+fineSlope(p.xz+uOceanOrigin,dist);
      vec3 N=normalize(vec3(-slopes.x,1.,-slopes.y));
      vec3 R=reflect(-V,N); float skyVisible=smoothstep(-.13,.055,R.y); R.y=max(.002,R.y);
      R=normalize(R);
      float nv=clamp(dot(N,V),0.,1.);
      vec3 mirrorSky=sky(R);
      float fres=(.115+.79*pow(1.-nv,3.45))*mix(.13,1.,skyVisible);
      float crest=clamp(.5+.96*p.y-slopes.y*.71,0.,1.);
      vec3 body=mix(vec3(.007,.060,.087),vec3(.045,.214,.229),crest);
      body*=mix(vec3(.73,.83,.94),vec3(1.),uClearing);
      vec3 col=mix(body,mirrorSky,fres);
      float sunFacing=clamp(dot(R,uSun),0.,1.);
      float disk=exp(-max(0.,1.-sunFacing)*1350.);
      float glow=exp(-max(0.,1.-sunFacing)*59.);
      col+=skyVisible*cloudLight()*(mix(vec3(.23,.23,.20),vec3(.89,.72,.42),uClearing)*disk
        +mix(vec3(.028,.026,.022),vec3(.11,.063,.026),uClearing)*glow);
      vec2 local=p.xz-uBoat.xz;
      float nearHull=exp(-dot(local/vec2(2.1,1.05),local/vec2(2.1,1.05)) * 1.8)*uContact;
      col*=1.-nearHull*.39;
      vec4 projected=uReflectMatrix*vec4(p.x,uMirrorHeight,p.z,1.);
      vec2 uv=projected.xy/projected.w*.5+.5;
      uv+=vec2(slopes.x*.080,slopes.y*.123)*min(1.,dist*.15);
      if(all(greaterThan(uv,vec2(0.))) && all(lessThan(uv,vec2(1.)))){
        vec4 boat=texture2D(uReflection,uv);
        col=mix(col,boat.rgb,(.23+.14*nearHull)*boat.a*uReflectionStrength);
      }
      if(uDive>.001) {
        // Transmit the submerged links through the thin strip of surface
        // between the bow and the camera's moving waterline.
        vec4 clip=uViewProjection*vec4(p,1.);
        vec2 refracted=clip.xy/clip.w*.5+.5+slopes*vec2(.009,.013)*(1.-nv*.45);
        vec4 link=texture2D(uTransmission,refracted);
        vec3 underwaterMetal=pow(max(link.rgb,vec3(0.)),vec3(1./2.2));
        col=mix(col,underwaterMetal,link.a*uDive*(1.-fres)*.84);
      }
      // Foam advects behind the stern and spreads into two turbulent arms.
      vec2 aft=normalize(vec2(.91,.42)); float along=dot(local,aft);
      float crossWake=dot(local,vec2(-aft.y,aft.x));
      float turbulence=fb(p.xz*2.8+vec2(uTime*.55,0.));
      float fineFoam=fb(p.xz*10.5+vec2(uTime*.35,-.2*uTime));
      float lacy=mix(turbulence,fineFoam,.45);
      float edge=abs(crossWake)-(.33+.14*max(0.,along));
      float foam=exp(-edge*edge/(.09+.025*max(0.,along)))+.35*exp(-crossWake*crossWake/(.36+.12*max(0.,along)));
      foam*=smoothstep(.15,1.6,along)*exp(-max(0.,along)*.071)*uWake;
      float ring=0.;
      if(uImpact>=0. && uImpact<2.) {
        float radius=length(local*vec2(.63,1.))+(lacy-.5)*.55;
        ring=exp(-pow((radius-.65-uImpact*1.95)/(.13+.06*uImpact),2.))*exp(-uImpact*1.9);
      }
      if(uSnap.z>=0. && uSnap.z<2.) {
        float age=uSnap.z;
        float r=length((p.xz-uSnap.xy)*vec2(.86,1.))+(lacy-.5)*.45;
        float band=(r-.16-age*1.35*uSnap.w)/(.09+.08*age);
        float churn=exp(-r*r/(.18+age*.45))*exp(-age*2.2);
        ring+=(exp(-band*band-age*1.8)*.75+churn*.65)*uSnap.w;
      }
      vec3 foamColor=mix(mirrorSky*.55+vec3(.32,.38,.39),vec3(.95,.93,.87),.55+.35*sunFacing);
      col=mix(col,foamColor,clamp((foam+ring)*smoothstep(.30,.76,lacy),0.,.84));
      if(uWake>.99) {
        float whitewater=0.;
        for(int i=0; i<6; i++) {
          vec4 event=uBreaches[i];
          vec2 delta=p.xz-event.xy+vec2(event.z*.30,0.);
          if(event.z<0. || dot(delta,delta)>30.) continue;
          float age=event.z;
          float r=length(delta*vec2(.81,1.08))/event.w;
          float grain=fb(p.xz*4.7+vec2(age*.5,-age*.34));
          float micro=fb(p.xz*13.+vec2(-age*.25,age*.2));
          float laceGrain=mix(grain,micro,.42);
          float edge=r-(.24+age*1.14)+(grain-.5)*.75;
          float ring=exp(-edge*edge/(.035+.085*age));
          float churn=exp(-r*r/(.25+age*.8))*exp(-age*.95);
          whitewater=max(whitewater,(ring*.68+churn)*smoothstep(.34,.75,laceGrain)
               *smoothstep(0.,.09,age)*(1.-smoothstep(.45,3.2,age)));
        }
        col=mix(col,foamColor,min(whitewater,.82));
      }
      float rim=exp(-vFromCut*24.)*uDive;
      col=mix(col,vec3(.30,.57,.53),rim*(.29+.31*lacy));
      float air=1.-exp(-dist*.0028);
      col=mix(col,sky(vec3(-V.x,.002,-V.z)),clamp(air*.66,0.,1.));
      gl_FragColor=vec4(col*uExposure,1.);
    }`,
    }),
  );
  water.frustumCulled = false;
  water.renderOrder = -5;
  return { background, water, uniforms };
}
