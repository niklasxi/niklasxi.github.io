import { MathUtils, Quaternion, Vector3 } from "three";
import { sheetHeight, sheetWidth } from "./creases";

// Four quadrature samples approximate the pressure over the two-sided sheet.
// The offset from the center makes unequal loads turn and bend the paper.
const panels = [-1, 1].flatMap(x => [-1, 1].map(y => new Vector3(
  x * sheetWidth / Math.sqrt(12), y * sheetHeight / Math.sqrt(12), 0,
)));
const inertia = new Vector3(sheetHeight ** 2, sheetWidth ** 2, sheetWidth ** 2 + sheetHeight ** 2)
  .multiplyScalar(1 / 12);

export function createSheetAir() {
  const attitude = new Quaternion();
  const spin = new Vector3();
  const force = new Vector3();
  const eddy = new Vector3();
  const relativeWind = new Vector3();
  const relativeSpin = new Vector3();
  const panelWind = new Vector3(), normal = new Vector3(), load = new Vector3();
  const torque = new Vector3(), moment = new Vector3(), axis = new Vector3();
  const toLocal = new Quaternion(), increment = new Quaternion();
  let eddyStart = 0, eddyDuration = 0, phase = 0;
  let pressure = 0, twist = 0;
  let verticalExtent = 0;

  function reset(pose: Quaternion) {
    attitude.copy(pose);
    spin.set(0, 0, 0);
    force.set(0, 0, 0);
    phase = 2 * Math.PI * Math.random();
    eddyDuration = 0;
    pressure = twist = verticalExtent = 0;
  }

  function step(dt: number, elapsed: number, velocity: Vector3, windX: number, windZ: number,
    updraft: number, opening: number) {
    if (elapsed >= eddyStart + eddyDuration || eddyDuration === 0) {
      eddyStart = elapsed;
      eddyDuration = 1.7 + 2.1 * Math.random();
      const azimuth = 2 * Math.PI * Math.random();
      const vertical = 2 * Math.random() - 1;
      const horizontal = Math.sqrt(1 - vertical * vertical);
      eddy.set(horizontal * Math.cos(azimuth), vertical, horizontal * Math.sin(azimuth))
        .multiplyScalar(2.7 + 1.8 * Math.random());
    }
    // A cell's circulation swells and dies before the next one arrives.
    const pulse = Math.sin(Math.PI * (elapsed - eddyStart) / eddyDuration) ** 2;
    toLocal.copy(attitude).invert();
    relativeWind.set(
      windX + pulse * eddy.z * 0.52,
      Math.max(0, updraft) * 0.57 + pulse * eddy.y * 0.44,
      windZ - pulse * eddy.x * 0.52,
    ).sub(velocity).applyQuaternion(toLocal);
    relativeSpin.set(
      pulse * eddy.x + 0.37 * Math.sin(elapsed * 1.35 + phase),
      pulse * eddy.y,
      pulse * eddy.z + 0.35 * Math.cos(elapsed * 1.77 + phase),
    ).applyQuaternion(toLocal).sub(spin);

    force.set(0, 0, 0);
    torque.set(0, 0, 0);
    pressure = twist = 0;
    for (const point of panels) {
      panelWind.crossVectors(relativeSpin, point).add(relativeWind);
      // A small camber makes the moving sheet catch air along its curling edges.
      normal.set(-0.08 * Math.sign(point.x), -0.13 * Math.sign(point.y), 1).normalize();
      const speed = panelWind.dot(normal);
      const normalLoad = 0.066 * speed * Math.abs(speed);
      load.copy(normal).multiplyScalar(normalLoad)
        .addScaledVector(panelWind, 0.009 * panelWind.length());
      force.add(load);
      torque.add(moment.crossVectors(point, load));
      pressure += normalLoad;
      twist += normalLoad * Math.sign(point.x * point.y);
    }
    // Semi-implicit integration. The substep in paperFlight keeps the thin
    // sheet stable when pressure changes sharply around an edge.
    spin.addScaledVector(torque.divide(inertia), dt * opening)
      .addScaledVector(relativeSpin, dt * 0.58 * opening)
      .multiplyScalar(Math.exp(-dt * (0.14 + 1.8 * (1 - opening))))
      .clampLength(0, 3.3);
    const rate = spin.length();
    if (rate > 1e-5) {
      increment.setFromAxisAngle(axis.copy(spin).divideScalar(rate), rate * dt);
      attitude.multiply(increment).normalize();
    }
    force.applyQuaternion(attitude).clampLength(0, 12);
    axis.set(0, 1, 0).applyQuaternion(toLocal.copy(attitude).invert());
    verticalExtent = (sheetWidth * Math.abs(axis.x) + sheetHeight * Math.abs(axis.y)) / 2;
  }

  return {
    attitude, spin, force, reset, step,
    get pressure() { return pressure; },
    get twist() { return twist; },
    get verticalExtent() { return verticalExtent; },
  };
}
