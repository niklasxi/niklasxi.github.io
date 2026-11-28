import * as T from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { ease, wave } from "./waves";
import { createCraneOcean } from "./craneOcean";
import { seabed } from "./environment";
import grainUrl from "./assets/paper-grain.webp?url";
import { createFlexiblePaper, createPaperSprings } from "./paperFlex";
import craneUrl from "../3d_origami_crane.glb?url";


export async function loadCrane(landscape: Promise<T.Texture[]>, setupRenderer: T.WebGLRenderer) {
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
  let radius = geometry.boundingSphere!.radius + geometry.boundingSphere!.center.length();
  const viewPoint = new T.Vector3();
  const bird = new T.Mesh(geometry, paper);
  bird.frustumCulled = false;
  bird.rotation.order = "YXZ";
  const positions = geometry.getAttribute("position");
  const tips: { i: number; x: number; y: number }[] = [];
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    if (Math.abs(x-.01) > 0.075) {
      const y = positions.getY(i);
      tips.push({ i, x, y });
      // The flap rotates around an offset hinge, so the rest-pose sphere
      // alone cannot give a safe margin for the closest passes.
      const hingeX = .01 + Math.sign(x) * .075;
      const reach = Math.hypot(x - hingeX, y - .35) + Math.hypot(hingeX, .35);
      radius = Math.max(radius, Math.hypot(reach, positions.getZ(i)));
    }
  }
  const clearance = radius + .15;
  const scene = new T.Scene();
  scene.background = new T.Color(0);
  const fill = new T.HemisphereLight(0xffffff, 0x999999);
  const key = new T.DirectionalLight(0xffffff);
  key.position.set(-3, 5, 4);
  scene.add(bird, fill, key);
  const camera = new T.PerspectiveCamera(35, 1, 0.07, 2600);
  const ocean = createCraneOcean(camera, await landscape);
  const springs = createPaperSprings();
  const flex = createFlexiblePaper(geometry, 3);
  const ball = new T.Mesh(geometry, paper.clone());
  ball.material.onBeforeCompile = paper.onBeforeCompile;
  ocean.shadePaper(ball.material);
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
  const wideEye = new T.Vector3();
  const wideFocus = new T.Vector3();
  const deep = new T.Color(0x245759), black = new T.Color(0);
  const fog = new T.FogExp2(deep,.08);
  let folded = false;
  let restingLow = 0;
  const attitudeForRest = new T.Quaternion();
  const finalAttitude = new T.Euler();
  const vertical = new T.Vector3();
  // Compile the submerged materials before the interactive drop.
  scene.fog = fog;
  await setupRenderer.compileAsync(scene, camera);
  scene.fog = null;
  let pathOffset = 0;
  let cueIndex = 0;
  const path = new T.CatmullRomCurve3();
  const direction = new T.Vector3();
  const flightRotation = new T.Quaternion();
  const flightCenter = new T.Vector3(), flightVelocity = new T.Vector3();
  const guide = new T.Vector3(), acceleration = new T.Vector3();
  const ahead = new T.Vector3();
  let entrySide = 1;
  let heading = 0;
  let pitch = 0;
  let bank = 0;
  const desired = new T.Euler(0,0,0,"YXZ");
  let previousAge = Infinity;
  let nextStroke = 0, strokeStart = 0, period = 1, amplitude = 0.6, beat = 0;
  const range = T.MathUtils.randFloat;
  function choosePath(reduced: boolean) {
    entrySide = Math.random() < 0.5 ? -1 : 1;
    const height = reduced ? .55 : 1;
    // The first pass comes in from the far side, crosses close to the lens,
    // then banks out into the distance. Z controls actual camera-space depth.
    path.points = [
      new T.Vector3(.83 * entrySide, -.20 * height, .88),
      new T.Vector3(.48 * entrySide, range(-.10, .09) * height, .11),
      new T.Vector3(-.11 * entrySide, range(.16, .28) * height, -.98),
      new T.Vector3(-.79 * entrySide, range(-.14, .05) * height, -.14),
      new T.Vector3(-.44 * entrySide, range(-.29, -.14) * height, .92),
      new T.Vector3(.69 * entrySide, range(-.07, .23) * height, .40),
      new T.Vector3(.26 * entrySide, range(.22, .37) * height, -.86),
    ];
    nextStroke = 0;
    beat = 0;
    cueIndex = 0;
    pathOffset = 0;
    springs.reset();
    folded = false;
  }

  const tangent = Math.tan(T.MathUtils.degToRad(camera.fov / 2));
  function placeInView(point: T.Vector3, t: number, distance: number, span: number, reduced: boolean, target: T.Vector3) {
    const depth = distance * (1 + T.MathUtils.clamp(point.z, -1, 1) * span);
    const horizontalSlope = tangent * camera.aspect;
    // Leave space for the wing at any bank angle, measured at the current depth.
    const horizontal = Math.max(0, depth * horizontalSlope - clearance * Math.hypot(1, horizontalSlope));
    const vertical = Math.max(0, depth * tangent - clearance * Math.hypot(1, tangent));
    const entrance = entrySide * (1 - ease(0, reduced ? 2.4 : 3.5, t)) * (clearance * 2.4 + depth * horizontalSlope * .22);
    target.set(
      T.MathUtils.clamp(point.x, -1, 1) * horizontal + entrance,
      T.MathUtils.clamp(point.y, -1, 1) * vertical,
      -depth,
    );
  }

  return function renderCrane(renderer: T.WebGLRenderer, age: number, aspect: number,
    reduced: boolean, rustle: (beat: number, strength: number) => void, foley: (cue: number) => void, rainSound: (level: number, underwater: number) => void, killAt = Infinity) {
    const travelDuration = reduced ? 24 : 28;
    const t = Math.min(age, killAt);
    const entering = age < previousAge;
    if (entering) choosePath(reduced);
    const dt = T.MathUtils.clamp(age-previousAge,0,0.12);
    previousAge = age;
    fill.intensity = 1.15;
    key.intensity = 2.1;
    camera.aspect = aspect;
    const depthSpan = reduced ? .20 : .43;
    const limitingSlope = Math.min(1, aspect) * tangent;
    const closestDepth = clearance * Math.hypot(1, limitingSlope) / limitingSlope;
    const distance = Math.max(10.2, 9.3 / aspect, closestDepth / (1 - depthSpan));
    camera.position.set(0, 0.28 * distance, distance);
    camera.lookAt(0, 0.35, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    let segment = t * 6 / travelDuration - pathOffset;
    // Extend the path while the visible segment and heading samples still
    // have the same four spline control points after the shift.
    while (segment >= 4.5) {
      const side = path.points[5].x > 0 ? -1 : 1;
      const depth = path.points[6].z < 0 ? range(.46, .97) : range(-.97, -.38);
      const width = depth < 0 ? range(.17, .49) : range(.59, .81);
      path.points.shift();
      path.points.push(new T.Vector3(side * width, range(-.32, .38) * (reduced ? .55 : 1), depth));
      pathOffset++;
      segment--;
    }
    path.getPoint(segment / 6, guide);
    if (entering) {
      flightCenter.copy(guide);
      flightVelocity.set(0, 0, 0);
    } else if (age <= killAt) {
      // Track the moving guide with a damped spring. The velocity carries
      // the crane through each turn and also drives its actual heading.
      const steps = Math.max(1, Math.ceil(dt * 90));
      const h = dt / steps;
      for (let i = 0; i < steps; i++) {
        acceleration.subVectors(guide, flightCenter).multiplyScalar(7)
          .addScaledVector(flightVelocity, -4.8);
        flightVelocity.addScaledVector(acceleration, h);
        flightCenter.addScaledVector(flightVelocity, h);
      }
    }
    placeInView(flightCenter, t, distance, depthSpan, reduced, viewPoint);
    bird.position.copy(viewPoint).applyMatrix4(camera.matrixWorld);
    // Use actual three-dimensional motion for pitch and heading, including
    // the inward glide and the turn back out when the crane passes the lens.
    const lookAhead = .26;
    ahead.copy(flightCenter).addScaledVector(flightVelocity, lookAhead);
    placeInView(ahead, t + lookAhead, distance, depthSpan, reduced, direction);
    direction.sub(viewPoint).transformDirection(camera.matrixWorld);
    if (t >= nextStroke) {
      strokeStart = t;
      period = range(0.56, 0.92) * (reduced ? 1.22 : 1);
      amplitude = range(0.42, 0.82) * (reduced ? 0.65 : 1);
      nextStroke = t + period + (Math.random() < 0.43 ? range(0.35, 1.1) : 0);
      beat++;
      const halfWidth = -viewPoint.z * camera.aspect * tangent;
      if (Math.abs(viewPoint.x) < halfWidth + clearance) rustle(beat, amplitude);
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

    if (!shot && direction.lengthSq() > 0) {
      const targetHeading = Math.atan2(direction.x, direction.z);
      const targetPitch = -Math.asin(T.MathUtils.clamp(direction.y, -.5, .5));
      const turn = T.MathUtils.euclideanModulo(targetHeading - heading + Math.PI, 2 * Math.PI) - Math.PI;
      const response = 1 - Math.exp(-dt * 5);
      const turnSpeed = reduced ? .95 : 1.45;
      const headingStep = T.MathUtils.clamp(turn * response, -turnSpeed * dt, turnSpeed * dt);
      heading = entering ? targetHeading : heading + headingStep;
      pitch = entering ? targetPitch : T.MathUtils.lerp(pitch, targetPitch, response);
      const turnRate = dt > 0 ? headingStep / dt : 0;
      bank = entering ? 0 : T.MathUtils.lerp(bank, -.43 * turnRate / turnSpeed, 1 - Math.exp(-dt * 2.2));
      desired.set(pitch, heading, bank);
      flightRotation.setFromEuler(desired);
    }
    bird.quaternion.copy(flightRotation);
    if (shot > 0) {
      bird.rotation.z += 0.58*ease(0,1.2,shot);
      const hitTime = 1.43;
      const entry = shot-hitTime;
      const fall = T.MathUtils.clamp((shot-.27)/(hitTime-.27),0,1);
      const sink = T.MathUtils.clamp(entry/4.45,0,1);
      const waterY = bird.position.y-2.9;
      const swell = reduced ? .39 : 1;
      const hitHeight = wave(ocean.impact.x, ocean.impact.z, hitTime, swell);
      oceanOffset.set(bird.position.x-ocean.impact.x,waterY-hitHeight,bird.position.z-ocean.impact.z);
      const load = Math.sin(shot*7.2)*crush*(1-crush);
      if (!folded) {
        springs.step(dt,0.48*crush + load, -.32*crush - .55*load);
        ball.geometry = flex(springs.bend,Math.max(.001,crush),shot,.07*crush*(1-crush));
        const sheet = ball.geometry.getAttribute("position") as T.BufferAttribute;
        finalAttitude.copy(bird.rotation);
        finalAttitude.z += .58 * (1 - ease(0,1.2,shot));
        finalAttitude.x += 4.15;
        finalAttitude.z += 2.35;
        vertical.copy(up).applyQuaternion(attitudeForRest.setFromEuler(finalAttitude).invert());
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
        restingLow = lowest;
        folded = shot >= .34;
      }
      ball.rotation.copy(bird.rotation);
      ball.rotation.x += fall*2.4 + sink*1.75;
      ball.rotation.z += fall*1.5 + sink*.85 + .16*Math.sin(sink*6.28);
      const floorY = oceanOffset.y + seabed - restingLow*.45;
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
      ocean.setPaperShadow(ball.position, ease(.68, 1, sink));
      focus.sub(oceanOffset);
      const pullback = ease(6.2, reduced ? 7.35 : 9.65, shot);
      const wideDistance = Math.max(11.8, 11.0 / aspect);
      wideEye.set(-.3, .32, wideDistance);
      wideFocus.set(0, -.78 * wideDistance / 11.8, 0);
      camera.position.lerp(wideEye, pullback);
      focus.lerp(wideFocus, pullback);
      camera.lookAt(focus);
      const surfaceY = wave(ocean.impact.x, ocean.impact.z, shot, swell);
      const wet = ease(-.06,.32,wave(camera.position.x,camera.position.z,shot,swell)-camera.position.y);
      // Keep object lighting independent of individual crests crossing the lens.
      const underwater = ease(hitTime, hitTime + 1.1, shot);
      rainSound(ease(.23, .95, shot), underwater * (1 - .84 * pullback));
      fog.color.copy(deep);
      fog.density = .085 * underwater * (1 - .58 * pullback);
      scene.fog=fog;
      scene.background = black;
      if (entry < 0) ocean.reflect(renderer,scene,focus,surfaceY);
      ocean.update(shot,entry,reduced,renderer.domElement.height,wet,surfaceY,pullback);
      const cues = [0,hitTime];
      while (cueIndex < cues.length && shot >= cues[cueIndex]) foley(cueIndex++);
    }
    renderer.render(scene, camera);
    return shot >= (reduced ? 7.35 : 9.65);
  };
}
