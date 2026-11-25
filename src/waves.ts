// Each row describes amplitude, wave vector, angular velocity, and phase.
// Both render and buoyancy use this exact spectrum in world coordinates.
const spectrum = [
  [0.105, 0.32, 0.71, 0.77, 1.2],
  [0.067, -0.76, 0.36, -0.98, 2.4],
  [0.052, 0.98, 1.51, 1.32, 0.7],
  [0.036, -1.2, 2.14, 1.63, 2.1],
  [0.024, 0.74, 3.28, 1.78, 4.7],
  [0.014, 2.64, 3.83, -2.08, 3.2],
];
const rollers = [
  [1.68, 0.19, 0.28, 1.03, 0.4],
  [0.78, -0.14, 0.23, 0.74, 2.1],
  [0.31, 0.43, 0.49, 1.57, 3.8],
];
export function wave(x: number, z: number, t: number, swell = 0) {
  let h = 0;
  for (const [a, kx, kz, w, phase] of spectrum)
    h += a * Math.sin(kx * x + kz * z + w * t + phase);
  for (const [a, kx, kz, w, b] of rollers)
    h += swell * a * Math.sin(x * kx + z * kz + t * w + b);
  return h;
}
const f = (n: number) => n.toFixed(4);
export const waveGLSL = `
uniform float uSwell;
float heightAt(vec2 p, float t) {
  return uSwell*(${rollers.map(([a, x, z, w, b]) => `${f(a)}*sin(dot(p,vec2(${f(x)},${f(z)}))+t*${f(w)}+${f(b)})`).join("+")}) + ${spectrum.map(([a, x, z, w, b]) => `${f(a)}*sin(dot(p,vec2(${f(x)},${f(z)}))+${f(w)}*t+${f(b)})`).join("+")};
}
vec2 slopeAt(vec2 p, float t) {
  return uSwell*(${rollers.map(([a, x, z, w, b]) => `vec2(${f(a * x)},${f(a * z)})*cos(dot(p,vec2(${f(x)},${f(z)}))+t*${f(w)}+${f(b)})`).join("+")}) + ${spectrum.map(([a, x, z, w, b]) => `vec2(${f(a * x)},${f(a * z)})*cos(dot(p,vec2(${f(x)},${f(z)}))+${f(w)}*t+${f(b)})`).join("+")};
}`;
export const clamp = (v: number) => Math.min(1, Math.max(0, v));
export function ease(a: number, b: number, t: number) {
  const v = clamp((t - a) / (b - a));
  return v * v * (3 - 2 * v);
}
