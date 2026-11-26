import { MathUtils, Vector3 } from "three";
import { ease, wave } from "./waves";

export function flightTiming(reduced: boolean) {
  const launchEnd = reduced ? 0.45 : 0.78;
  const openEnd = launchEnd + (reduced ? 1.2 : 2.2);
  const foldDuration = reduced ? 2.2 : 4.5;
  return { launchEnd, openEnd, foldDuration };
}

// Translation, pitch and roll respond to the same moving air. Resolve loads
// in short steps so a slow rendered frame cannot kick the sheet into a spin.
export function createPaperFlight() {
  const position = new Vector3(), velocity = new Vector3();
  let roll = 0, pitch = 0, rollRate = 0, pitchRate = 0;
  let gust = 0, crosswind = 0;
  function reset(start: Vector3, entrySpeed: number) {
    position.copy(start);
    velocity.set(-0.91 * entrySpeed, 0, -0.42 * entrySpeed);
    roll = pitch = rollRate = pitchRate = gust = crosswind = 0;
  }
  function step(dt: number, elapsed: number, foldAge: number, worldTime: number, heading: Vector3,
    timing: ReturnType<typeof flightTiming>, reduced: boolean) {
    const steps = Math.ceil(dt * 120);
    const h = steps ? dt / steps : 0;
    const motion = reduced ? 0.42 : 1;
    const liftReady = MathUtils.lerp(timing.launchEnd, timing.openEnd, 0.56);
    for (let i = 0; i < steps; i++) {
      const t = elapsed - dt + (i + 1) * h;
      const spread = ease(timing.launchEnd, timing.openEnd, t);
      const fold = ease(0, timing.foldDuration, foldAge - (elapsed - t));
      const loose = spread * (1 - fold);
      const phase = 0.78 * t + 0.051 * position.x;
      gust = Math.sin(phase) + 0.43 * Math.sin(1.69 * phase + 1.4);
      crosswind = Math.sin(0.77 * phase + 0.5) + 0.54 * Math.sin(1.56 * phase - 0.7);

      const targetSpeed = MathUtils.lerp(reduced ? 1.8 : 3.1, reduced ? 3.45 : 7.2, fold);
      const windX = heading.x * targetSpeed + motion * loose * (1.9 * crosswind + 2.5 * Math.sin(roll));
      const windZ = heading.z * targetSpeed + motion * loose * gust * 0.65;
      const drag = 0.24 + loose * 0.73 + fold * 0.45;
      velocity.x += (windX - velocity.x) * drag * h;
      velocity.z += (windZ - velocity.z) * drag * h;
      rollRate += (loose * motion * (1.32 * crosswind + (windX - velocity.x) * 0.23)
        - 2.5 * roll - 1.38 * rollRate) * h;
      pitchRate += (loose * motion * (0.88 * gust - 0.19 * velocity.y)
        - 2.9 * pitch - 1.55 * pitchRate) * h;
      roll += rollRate * h;
      pitch += pitchRate * h;

      const sea = wave(position.x, position.z, worldTime - (steps - i - 1) * h,
        (reduced ? 0.39 : 1) * (1 - 0.76 * spread));
      const height = position.y - sea;
      // A short impulse from the crest launches the folded hull. As its area
      // opens, broadside drag checks the fall and the marine updraft carries it.
      const kick = t < timing.launchEnd
        ? Math.sin(Math.PI * t / timing.launchEnd) * (reduced ? 40 : 37) : 0;
      const pressure = 1 + 0.14 * motion * gust;
      const liftHeight = (reduced ? 4.8 : 7.2) + motion * gust * 0.48;
      const updraft = Math.max(0, 8.8 + (liftHeight - height) * 1.45) * pressure;
      const openingArea = ease(timing.launchEnd, liftReady, t);
      const sheetLift = openingArea * (1 - fold) * updraft * (1 - 0.22 * Math.abs(Math.sin(roll)));
      const cruiseHeight = (reduced ? 5.4 : 8) + motion * 0.42 * Math.sin(t * 0.43);
      const wingLift = fold * (9.81 + 1.7 * (cruiseHeight - position.y));
      const dragArea = velocity.y < 0 ? openingArea * (1 - fold) : loose;
      const damping = 0.16 + dragArea * 1.8 + fold * 2.3;
      const waterSupport = (1 - spread) * Math.max(0, 1 - height) * 8;
      velocity.y += (kick + waterSupport + sheetLift + wingLift - 9.81 - damping * velocity.y) * h;
      position.addScaledVector(velocity, h);
    }
    return { roll, pitch, rollRate, gust, crosswind };
  }
  return { position, velocity, reset, step };
}
