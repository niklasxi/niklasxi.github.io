import * as T from "three";
import { forgedSteel, makeAnchor, submerge } from "./anchor";
import { createEnvironment, seabed } from "./environment";
import { createSeabedDetails } from "./tether";
import { createOceanRain } from "./oceanRain";
import { createSplash } from "./splash";
import { ease } from "./waves";


export function createCraneOcean(camera: T.PerspectiveCamera, [sky, storm, ripples, sand]: T.Texture[]) {
  const world = new T.Scene();
  const mirror = new T.PerspectiveCamera();
  const reflected = new T.WebGLRenderTarget(480, 320);
  const empty = new T.WebGLRenderTarget(1, 1);
  const env = createEnvironment(sky, storm, ripples, sand, camera, reflected, empty);
  const un = env.uniforms;
  world.add(env.background, env.water);
  const steel = forgedSteel();
  submerge(steel, un, true);
  const { anchor } = makeAnchor(steel);
  anchor.position.set(.84, seabed - .025, .58);
  anchor.rotation.set(.13, -.39, -.28);
  world.add(anchor);
  un.uAnchor.value.copy(anchor.position);
  const details = createSeabedDetails(world);
  const splash = createSplash(world);
  const rain = createOceanRain(world, un);
  const impact = new T.Vector3(anchor.position.x - .65, 0, anchor.position.z + .45);
  const bubbles=new T.InstancedMesh(new T.SphereGeometry(1,8,6),
    new T.MeshPhongMaterial({color:0x629998,specular:0xffffff,shininess:75,transparent:true,opacity:.54}),100);
  const seeds=Array.from({length:bubbles.count},()=>({angle:Math.random()*Math.PI*2,r:Math.random(),speed:Math.random(),delay:Math.random()}));
  bubbles.frustumCulled = false;
  world.add(bubbles);
  const dummy=new T.Object3D();
  const lensEntry=new T.Vector3();
  let crossed=false, crossingTime=0;
  return {
    world,
    impact,
    shadePaper(material: T.MeshStandardMaterial) {
      submerge(material, un, true);
    },
    setPaperShadow(position: T.Vector3, contact: number) {
      un.uPaperShadow.value.set(position.x + .09, position.z - .08, .58 * contact, 0);
    },
    reflect(renderer: T.WebGLRenderer, scene: T.Scene, focus: T.Vector3, surfaceY: number) {
    mirror.copy(camera, false);
    mirror.layers.set(1);
    mirror.position.y = 2 * surfaceY - camera.position.y;
    mirror.lookAt(focus.x, 2 * surfaceY - focus.y, focus.z);
    mirror.updateMatrixWorld();
    un.uReflectMatrix.value.multiplyMatrices(mirror.projectionMatrix, mirror.matrixWorldInverse);
    un.uMirrorHeight.value = surfaceY;
    const background = scene.background;
    scene.background = null;
    renderer.setRenderTarget(reflected);
    renderer.render(scene, mirror);
    renderer.setRenderTarget(null);
    scene.background = background;
  }, update(shot:number, sinceImpact:number, reduced:boolean, height:number, wet:number, surfaceY:number, pullback:number){
    world.visible=shot>.22;
    camera.updateMatrixWorld();
    un.uTime.value = shot;
    un.uSkyMotion.value = reduced ? .15 : 1;
    un.uSwell.value = (reduced ? .39 : 1) * (1 - pullback);
    un.uExposure.value = ease(.22, .95, shot);
    un.uAspect.value = camera.aspect;
    un.uTan.value = Math.tan(T.MathUtils.degToRad(camera.fov / 2));
    un.uViewProjection.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    un.uCut.value = camera.position.z - T.MathUtils.lerp(.26, camera.position.z * .65, pullback);
    un.uDive.value = 1;
    un.uReflectionStrength.value = sinceImpact < 0 ? 1 : 0;
    un.uBoat.value.copy(impact);
    un.uImpact.value = sinceImpact;
    if (sinceImpact<0) crossed=false;
    if (!crossed && wet>.02) {
      lensEntry.copy(camera.position);
      crossed=true;
      crossingTime=shot;
    }
    // Water and seabed depth occlude submerged objects throughout the crossing.
    details.update(1, shot);
    rain(shot, sinceImpact, pullback, reduced);
    impact.y = surfaceY;
    splash(sinceImpact,impact,reduced,height);
    bubbles.visible=sinceImpact>=0 && sinceImpact<3;
    if(bubbles.visible){
      seeds.forEach((s,i)=>{
        const t=Math.max(0,sinceImpact-s.delay*.46),r=s.r*(.12+t*.75);
        dummy.position.copy(impact);
        dummy.position.x+=Math.cos(s.angle)*r;
        dummy.position.z+=Math.sin(s.angle)*r+t*.85;
        dummy.position.y-=Math.sin(Math.min(1,t/2.4)*Math.PI)*(.22+1.1*s.speed);
        dummy.scale.setScalar((.012+.055*s.r)*Math.sin(Math.min(1,t/2.5)*Math.PI));
        if(i<38 && crossed) {
          const life=shot-crossingTime;
          dummy.position.copy(lensEntry);
          dummy.position.x+=Math.cos(s.angle)*s.r*.85;
          dummy.position.z-=.35+s.speed*.95;
          dummy.position.y+=Math.sin(s.angle)*s.r*.55+life*.56;
          dummy.scale.setScalar((.009+.028*s.speed)*ease(0,.1,life)*(1-ease(.21,.95,life)));
        }
        dummy.updateMatrix(); bubbles.setMatrixAt(i,dummy.matrix);
      });
      bubbles.instanceMatrix.needsUpdate=true;
    }
  }};
}
