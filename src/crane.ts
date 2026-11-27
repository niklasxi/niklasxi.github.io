import * as T from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { ease, wave } from "./waves";
import { createCraneOcean } from "./craneOcean";
import { seabed } from "./environment";
import grainUrl from "./assets/paper-grain.webp?url";
import { createFlexiblePaper, createPaperSprings } from "./paperFlex";
import craneUrl from "../3d_origami_crane.glb?url";


export async function loadCrane(landscape: Promise<T.Texture[]>) {
  const { scene: model } = await new GLTFLoader().loadAsync(craneUrl);
  model.updateMatrixWorld(true);
  const mesh = model.getObjectByName("Object_3");
  if (!(mesh instanceof T.Mesh)) throw new Error("Missing folded paper in the crane model");
  // Bake the OBJ axis conversion. The separate ground shadow and outline
  // belong to the static presentation of the model.
  const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
  const paper = new T.MeshStandardMaterial({
    map: new T.TextureLoader().load(grainUrl), color: 0xfff9ec, roughness: 1, side: T.DoubleSide, flatShading: true,
  });
  // Grain supplies fiber detail. Keep its contrast low so the folded panels
  // take their broad shading from the lights as the wings change direction.
  paper.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>",
      "diffuseColor.rgb *= mix(vec3(0.87), vec3(1.0), texture2D(map,vMapUv).rgb);");
  };
  geometry.computeBoundingSphere();
  const clearance = geometry.boundingSphere!.radius + geometry.boundingSphere!.center.length() + .15;
  const viewPoint = new T.Vector3();
  const bird = new T.Mesh(geometry, paper);
  bird.rotation.order = "YXZ";
  const positions = geometry.getAttribute("position");
  const tips: { i: number; x: number; y: number }[] = [];
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    if (Math.abs(x-.01) > 0.075) tips.push({ i, x, y: positions.getY(i) });
  }
  const scene = new T.Scene();
  scene.background = new T.Color(0);
  const fill = new T.HemisphereLight(0xffffff, 0x999999);
  const key = new T.DirectionalLight(0xffffff);
  key.position.set(-3, 5, 4);
  scene.add(bird, fill, key);
  const camera = new T.PerspectiveCamera(35, 1, 0.07, 2600);
  const ocean = createCraneOcean(camera, await landscape);
  const springs = createPaperSprings();
  const flex = createFlexiblePaper(geometry, 5);
  const ball = new T.Mesh(geometry, paper.clone());
  ball.material.onBeforeCompile = paper.onBeforeCompile;
  ball.frustumCulled = false;
  const vertex = new T.Vector3(), hinge = new T.Vector3(), up = new T.Vector3(0,1,0);
  // Each crease turns the projecting part of the previous fold back over itself.
  const creases = [
    [1,0,.12,.45,2.45], [-1,0,.25,.48,2.65], [.2,0,1,.51,2.3],
    [-.33,.12,-1,.47,2.55], [.3,1,.15,.64,2.42], [.82,.2,-.6,.38,2.05],
    [-.54,.4,.8,.36,2.14],
  ].map(([x,y,z,offset,angle]) => {
    const normal = new T.Vector3(x,y,z).normalize();
    const axis = new T.Vector3().crossVectors(normal,up).normalize();
    return {normal,axis,offset,angle};
  });
  ball.layers.enable(1);
  fill.layers.enable(1);
  key.layers.enable(1);
  const oceanOffset = new T.Vector3();
  scene.add(ocean.world, ball);
  const landingEye = new T.Vector3(), focus = new T.Vector3(), target = new T.Vector3();
  const deep = new T.Color(0x245759), black = new T.Color(0);
  const fog = new T.FogExp2(deep,.08);
  let pathOffset = 0;
  let cueIndex = 0;
  const path = new T.CatmullRomCurve3();
  const direction = new T.Vector3();
  const flightRotation = new T.Quaternion();
  const ahead = new T.Vector3();
  let heading = 0;
  let pitch = 0;
  let bank = 0;
  const desired = new T.Euler(0,0,0,"YXZ");
  let previousAge = Infinity;
  let nextStroke = 0, strokeStart = 0, period = 1, amplitude = 0.6, beat = 0;
  const range = T.MathUtils.randFloat;
  function choosePath(reduced: boolean) {
    const side = Math.random() < 0.5 ? -1 : 1;
    const height = reduced ? 0.38 : 0.82;
    path.points = [
      new T.Vector3(-.55 * side, -0.35, -1.8),
      new T.Vector3(-0.42 * side, range(-height, height), -1.0),
      new T.Vector3(range(0.1, 0.44) * side, range(0.1, height), range(-0.6, 0.3)),
      new T.Vector3(range(0.25, 0.48) * side, range(-height, 0), 1.0),
      new T.Vector3(range(-0.35, -0.08) * side, range(-height, height), 0.45),
      new T.Vector3(-0.45 * side, range(0, height), -0.85),
      new T.Vector3(0.10 * side, 0.05, -0.25),
    ];
    nextStroke = 0;
    beat = 0;
    cueIndex = 0;
    pathOffset = 0;
    springs.reset();
  }

  return function renderCrane(renderer: T.WebGLRenderer, age: number, aspect: number,
    reduced: boolean, rustle: (beat: number, strength: number) => void, foley: (cue: number) => void, killAt = Infinity) {
    const desktopSpread = reduced ? 0 : ease(1.05, 1.75, aspect);
    const duration = reduced ? 10.5 : 15.5;
    const t = Math.min(age, killAt);
    const entering = age < previousAge;
    if (entering) choosePath(reduced);
    const dt = T.MathUtils.clamp(age-previousAge,0,0.12);
    previousAge = age;
    fill.intensity = 1.15;
    key.intensity = 2.1;
    camera.aspect = aspect;
    const distance = Math.max(10.2, 12.0 / aspect);
    camera.position.set(0, 0.28 * distance, distance);
    camera.lookAt(0, 0.35, 0);
    camera.updateProjectionMatrix();

    let segment = t * 6 / duration - pathOffset;
    // Extend the path while the visible segment and heading samples still
    // have the same four spline control points after the shift.
    while (segment >= 4.5) {
      const last = path.points[6];
      path.points.shift();
      path.points.push(new T.Vector3(-Math.sign(last.x || 1)*range(.18,.46),range(-.5,.7),range(-1.1,1)));
      pathOffset++;
      segment--;
    }
    const progress = segment / 6;
    const halfWidth = distance * Math.tan(T.MathUtils.degToRad(17.5)) * aspect;
    path.getPoint(progress, bird.position);
    const compactWidth = Math.min(.82 * halfWidth, 4.8);
    // Waypoints already alternate sides. Use more of the desktop frustum
    // for those sweeps while the camera-space bounds protect the wingtips.
    const flightWidth = T.MathUtils.lerp(compactWidth, 1.55 * halfWidth, desktopSpread);
    bird.position.x *= flightWidth;
    // Look through the bend over a short section of the path, so tight
    // spline tangents cannot whip the nose around in a single frame.
    const turnWindow = .065;
    path.getPoint(Math.min(1, progress + turnWindow), ahead);
    path.getPoint(Math.max(0, progress - turnWindow), direction);
    direction.subVectors(ahead, direction);
    direction.x *= flightWidth;
    direction.normalize();
    if (t >= nextStroke) {
      strokeStart = t;
      period = range(0.56, 0.92) * (reduced ? 1.22 : 1);
      amplitude = range(0.42, 0.82) * (reduced ? 0.65 : 1);
      nextStroke = t + period + (Math.random() < 0.43 ? range(0.35, 1.1) : 0);
      beat++;
      if (Math.abs(bird.position.x) < halfWidth + 0.3) rustle(beat, amplitude);
    }
    const cycle = Math.min(1, (t - strokeStart) / period);
    const envelope = Math.sin(Math.PI * cycle);
    const stroke = Math.sin(2 * Math.PI * cycle) * envelope;
    const shot = Math.max(0,age-killAt);
    const crush = ease(0,.34,shot);
    const flap = Math.sin(ease(0,.13,shot)*Math.PI*2);
    ball.visible = shot > 0;
    ocean.world.visible = false;

    scene.background = black;
    scene.fog = null;
    bird.visible = !ball.visible;
    const angle = amplitude * stroke - 0.09 + flap*0.42;
    for (const tip of tips) {
      const sign = Math.sign(tip.x);
      const span = Math.abs(tip.x-.01) - 0.075;
      const height = tip.y - 0.35;
      const bend = (angle + 1.25*ease(sign>0 ? 0 : .05,.19,shot)) * ease(0,.32,span);
      positions.setXY(tip.i, 0.01 + sign * (0.075 + span * Math.cos(bend) - height * Math.sin(bend)),
        0.35 + span * Math.sin(bend) + height * Math.cos(bend));
    }
    positions.needsUpdate = true;
    bird.position.y -= 0.07 * stroke;
    camera.updateMatrixWorld();
    viewPoint.copy(bird.position).applyMatrix4(camera.matrixWorldInverse);
    const tangent = Math.tan(T.MathUtils.degToRad(camera.fov / 2));
    const limit = (slope: number) => Math.max(0, -viewPoint.z * slope - clearance * Math.hypot(1, slope));
    const horizontal = limit(tangent * aspect), verticalLimit = limit(tangent);
    viewPoint.x = T.MathUtils.clamp(viewPoint.x, -horizontal, horizontal);
    viewPoint.y = T.MathUtils.clamp(viewPoint.y, -verticalLimit, verticalLimit);
    bird.position.copy(viewPoint).applyMatrix4(camera.matrixWorld);
    if (!shot) {
      const targetHeading = Math.atan2(direction.x, direction.z);
      const targetPitch = -Math.asin(T.MathUtils.clamp(direction.y, -.5, .5));
      const turn = T.MathUtils.euclideanModulo(targetHeading - heading + Math.PI, 2 * Math.PI) - Math.PI;
      const response = 1 - Math.exp(-dt * 5);
      const headingStep = T.MathUtils.clamp(turn * response, -2.25 * dt, 2.25 * dt);
      heading = entering ? targetHeading : heading + headingStep;
      pitch = entering ? targetPitch : T.MathUtils.lerp(pitch, targetPitch, response);
      const turnRate = dt > 0 ? headingStep / dt : 0;
      bank = entering ? 0 : T.MathUtils.lerp(bank, -.31 * turnRate / 2.25, response);
      desired.set(pitch - .05 * stroke, heading, bank + .05 * stroke);
      flightRotation.setFromEuler(desired);
    }
    bird.quaternion.copy(flightRotation);
    if (shot > 0) {
      bird.rotation.z += 0.58*ease(0,1.2,shot);
      const hitTime = 1.43;
      const entry = shot-hitTime;
      const fall = T.MathUtils.clamp((shot-.27)/(hitTime-.27),0,1);
      const sink = T.MathUtils.clamp(entry/4.45,0,1);
      const settle = ease(5.88,6.38,shot);
      const waterY = bird.position.y-2.9;
      const swell = reduced ? .39 : 1;
      const hitHeight = wave(ocean.impact.x, ocean.impact.z, hitTime, swell);
      oceanOffset.set(bird.position.x-ocean.impact.x,waterY-hitHeight,bird.position.z-ocean.impact.z);
      const load = Math.sin(shot*7.2)*crush*(1-crush);
      const impact = Math.sin(settle*Math.PI*2)*(1-settle);
      springs.step(dt,0.48*crush + load + .18*impact, -.32*crush - .55*load);
      ball.geometry = flex(springs.bend,Math.max(.001,crush),shot,.07*crush*(1-crush));
      const sheet = ball.geometry.getAttribute("position") as T.BufferAttribute;
      ball.rotation.copy(bird.rotation);
      ball.rotation.x += fall*2.4 + sink*1.75;
      ball.rotation.z += fall*1.5 + sink*.85 + .16*Math.sin(sink*6.28);
      const vertical = up.clone().applyQuaternion(ball.quaternion.clone().invert());
      let lowest = Infinity;
      for (let i=0; i<sheet.count; i++) {
        vertex.fromBufferAttribute(sheet,i);
        vertex.y -= .35;
        for (let j=0;j<creases.length;j++) {
          const {normal,axis,offset,angle} = creases[j];
          const excess = vertex.dot(normal)-offset;
          if (excess <= 0) continue;
          const fold = ease(.01+j*.023,.16+j*.028,shot);
          hinge.copy(vertex).addScaledVector(normal,-excess);
          vertex.sub(hinge).applyAxisAngle(axis,angle*fold).add(hinge);
        }
        vertex.y += .35*(1-crush);
        sheet.setXYZ(i,vertex.x,vertex.y,vertex.z);
        lowest = Math.min(lowest,vertex.dot(vertical));
      }
      sheet.needsUpdate = true;
      const floorY = oceanOffset.y + seabed - lowest*.45;
      ball.scale.setScalar(1-.55*ease(.2,2.15,shot));
      ball.position.copy(bird.position);
      ball.position.y -= 2.9*fall*fall;
      ball.position.y += (floorY-waterY)*(1-(1-sink)**1.35);
      ball.position.x += .26*Math.sin(sink*Math.PI*2);
      const follow = ease(.28,1.77,shot);
      const framing = Math.max(4.8,4.45/aspect);
      target.copy(ball.position);
      target.x += .42*sink;
      target.y += .25*sink;
      landingEye.copy(target);
      landingEye.x += .21*framing;
      landingEye.y += .24 + .84*sink;
      landingEye.z += .92*framing;
      camera.position.lerp(landingEye,follow);
      camera.lookAt(focus.set(0,.35,0).lerp(target,follow));
      camera.position.sub(oceanOffset);
      ball.position.sub(oceanOffset);
      focus.sub(oceanOffset);
      const surfaceY = wave(ocean.impact.x, ocean.impact.z, shot, swell);
      const wet = ease(-.06,.32,wave(camera.position.x,camera.position.z,shot,swell)-camera.position.y);
      fog.color.copy(deep);
      fog.density=.085*wet;
      scene.fog=fog;
      scene.background = fog.color.copy(black).lerp(deep,wet);
      if (entry < 0) ocean.reflect(renderer,scene,focus,surfaceY);
      ocean.update(shot,entry,reduced,renderer.domElement.height,wet,surfaceY);
      const cues = [0,hitTime];
      while (cueIndex < cues.length && shot >= cues[cueIndex]) foley(cueIndex++);
    }
    renderer.render(scene, camera);
    return shot >= 7.9;
  };
}
