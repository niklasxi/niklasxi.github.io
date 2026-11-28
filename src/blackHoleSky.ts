import * as T from "three";
import { blackHoleRayTables } from "./blackHoleRays";
import fieldUrl from "./assets/quiet-deep-field.webp";

const quadVertex = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.9999, 1.0);
  }
`;

// Disk shading and Schwarzschild integration follow Jonás Javier Encarnación's
// black-hole tutorial. The ray paths here can be viewed from a moving camera.
// https://jonasjavier.dev/en/blog/black-hole-three-js-shader-tutorial#the-full-file
const skyFragment = `
  varying vec2 vUv;
  uniform sampler2D uField, uGas, uPaths, uEscape;
  uniform vec2 uViewport, uCenter;
  uniform vec4 uView;
  uniform float uTime;
  uniform float uVisibility;
  const float pi = 3.14159265359;
  const float turn = 2.0 * pi;
  const float focalLength = 1.18;
  const float maximumSlope = 1.18;
  const float maximumRadius = 24.0;

  mat2 bank(float angle) {
    float c = cos(angle), s = sin(angle);
    return mat2(c, -s, s, c);
  }

  vec4 diskHit(vec3 eye, vec3 tangent, float rayIndex, float angle) {
    vec2 path = texture2D(uPaths, vec2(rayIndex, angle / turn)).rg;
    float radius = maximumRadius * path.x;
    if (radius < 3.0 || radius >= 10.0) return vec4(0.0, 0.0, 1.0, 0.0);
    float c = cos(angle), s = sin(angle);
    vec3 radial = c * eye + s * tangent;
    vec2 azimuth = normalize(radial.xz);
    float outward = path.y;
    vec3 ray = outward * radial + sqrt(max(0.0, 1.0 - outward * outward)) * (c * tangent - s * eye);
    vec3 orbit = vec3(-azimuth.y, 0.0, azimuth.x);
    float speed = inversesqrt(2.0 * (radius - 1.0));
    float doppler = sqrt(1.0 - speed * speed) / (1.0 - speed * dot(orbit, -ray));
    return vec4(azimuth * 0.5 + 0.5, (radius - 3.0) / 7.0, doppler * 0.5);
  }

  float firstCrossing(vec3 eye, vec3 tangent) {
    return mod(atan(-eye.y, tangent.y), pi);
  }

  float noiseAt(vec2 cell) {
    vec2 f = fract(cell);
    return texture2D(uGas, (floor(cell) + f*f*(3.0-2.0*f) + 0.5) / 128.0).r;
  }

  // Radius and orbital phase are carried by each bent ray. Broad density
  // fluctuations shear into knots and narrow streamers in the rotating gas.
  vec4 emission(vec4 hit) {
    if (hit.a < 0.02 || hit.b > 0.997) return vec4(0.0);
    float radius = 3.0 + hit.b * 7.0;
    float phase = atan(hit.g * 2.0 - 1.0, hit.r * 2.0 - 1.0)
                + uTime * 0.90 * pow(radius, -1.5);
    float lr = log(radius / 3.0);
    vec2 az = vec2(cos(phase - lr * 2.9), sin(phase - lr * 2.9));
    float eddy = noiseAt(az * 3.7 + vec2(lr * 9.0, 27.0));
    vec2 stream = az * 4.5 + vec2(lr * 29.0 + eddy * 2.6, lr * 9.5);
    float clouds = noiseAt(stream);
    float folds = noiseAt(stream * 2.93 + 3.7 * clouds);
    float bandwidth = length(fwidth(stream));
    float threads = mix(noiseAt(stream * 5.15 + 2.4 * folds), 0.5, smoothstep(0.12,0.45,bandwidth));
    folds = mix(folds, 0.5, smoothstep(0.3,0.9,bandwidth));
    float density = 0.25 + 1.48 * pow(0.53*clouds + 0.32*folds + 0.15*threads, 1.7);
    float edge = smoothstep(0.003, 0.080, hit.b) * (1.0 - smoothstep(0.64, 0.997, hit.b));
    float temperature = pow(3.0 / radius, 1.6);
    float doppler = 2.0 * hit.a;
    float heat = clamp(temperature * doppler * (0.72 + 0.30*clouds), 0.0, 1.0);
    vec3 gas = mix(vec3(0.67,0.23,0.082), vec3(1.0,0.70,0.42), smoothstep(0.12,0.68,heat));
    gas = mix(gas, vec3(1.0,0.95,0.83), smoothstep(0.64,1.0,heat));
    float radiance = 2.05 * temperature * density * doppler*doppler*doppler;
    return vec4(gas * radiance, edge * (0.66 + 0.32*clouds));
  }

  void main() {
    float shortSide = min(uViewport.x, uViewport.y);
    mat2 tilt = bank(uView.z);
    vec2 screen = (vUv-uCenter)*uViewport/(0.47*shortSide*uView.w);
    vec2 q = tilt * screen;
    float slope = length(q) / focalLength;
    float rayIndex = sqrt(slope / maximumSlope);

    float azimuth = uView.x, elevation = uView.y;
    vec3 right = vec3(cos(azimuth), 0.0, -sin(azimuth));
    vec3 eye = vec3(sin(azimuth)*cos(elevation), sin(elevation), cos(azimuth)*cos(elevation));
    vec3 up = cross(eye, right);
    vec3 tangent = (q.x * right + q.y * up) / max(length(q), 0.00001);
    vec3 straight = normalize(-eye + slope * tangent);
    vec4 escape = texture2D(uEscape,vec2(rayIndex, 0.5));
    vec3 bent = (2.0*escape.r-1.0)*eye + (2.0*escape.g-1.0)*tangent;

    // Anchor distant light to a direction in space. The foreground can
    // grow during the approach without magnifying the distant galaxies.
    vec2 skyOffset = tilt * ((vUv - .5) * uViewport / shortSide) * .63;
    vec3 skyRay = normalize(-eye + skyOffset.x * right + skyOffset.y * up);
    float bend = 1.0 - smoothstep(0.41, 0.78, slope);
    vec3 direction = normalize(skyRay + .72 * bend * (bent - straight));
    vec2 fieldUv = vec2(.5 + atan(direction.x, -direction.z) / pi,
      .55 + asin(clamp(direction.y,-1.,1.)) * .82);
    vec3 color = texture2D(uField, fieldUv).rgb * mix(1.0, escape.a, bend);
    if (slope < maximumSlope) {
      float crossing = firstCrossing(eye, tangent);
      vec4 nearDisk = emission(diskHit(eye, tangent, rayIndex, crossing));
      vec4 farDisk = emission(diskHit(eye, tangent, rayIndex, crossing + pi));
      // Add the glowing far arc through the gas while the denser near
      // side attenuates it, rather than layering two opaque bands.
      color *= (1. - .72 * nearDisk.a) * (1. - .55 * farDisk.a);
      color += nearDisk.rgb * nearDisk.a + farDisk.rgb * farDisk.a * (1. - .65 * nearDisk.a);

      float halo = exp(-26.0 * abs(slope - 0.167)) * smoothstep(0.13, 0.18, slope);
      float haze = exp(-7.0 * slope - 12.0 * abs(q.y)) * smoothstep(0.19, 0.30, slope);
      color += vec3(1.0,0.48,0.24) * (0.004 * halo + 0.010 * haze);
    }
    gl_FragColor = vec4(1.0 - exp(-color * 1.12), 1.0);
    #include <colorspace_fragment>
    float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    gl_FragColor.rgb = (gl_FragColor.rgb + (dither - 0.5) / 255.0) * uVisibility;
  }
`;

export function createBlackHoleSky() {
  const field = new T.TextureLoader().load(fieldUrl);
  field.colorSpace = T.SRGBColorSpace;
  field.wrapS = T.RepeatWrapping;
  field.wrapT = T.MirroredRepeatWrapping;
  let seed = 0x68517;
  const noise = new Uint8Array(128 * 128);
  for (let i = 0; i < noise.length; i++) {
    seed = (Math.imul(seed,1664525) + 1013904223) >>> 0;
    noise[i] = seed >>> 24;
  }
  const gas = new T.DataTexture(noise,128,128,T.RedFormat);
  gas.wrapS = gas.wrapT = T.RepeatWrapping;
  gas.minFilter = gas.magFilter = T.LinearFilter;
  gas.needsUpdate = true;

  const rays = blackHoleRayTables();
  const uniforms = {
    uField: { value: field },
    uGas: { value: gas },
    uPaths: { value: rays.paths },
    uEscape: { value: rays.escapes },
    uViewport: { value: new T.Vector2(1, 1) },
    uCenter: { value: new T.Vector2(0.5, 0.5) },
    uView: { value: new T.Vector4(0, 0.067, 0.148, 1) },
    uTime: { value: 0 },
    uVisibility: { value: 1 },
  };
  const geometry = new T.PlaneGeometry(2, 2);
  const material = new T.ShaderMaterial({
    vertexShader: quadVertex, fragmentShader: skyFragment, uniforms,
    depthWrite: false, depthTest: false, toneMapped: false,
  });
  const mesh = new T.Mesh(geometry, material);
  mesh.name = "Lensed deep field";
  mesh.frustumCulled = false;
  mesh.renderOrder = -10000;
  function update(renderer: T.WebGLRenderer, seconds: number, center: T.Vector2, view: T.Vector4, visibility: number) {
    renderer.getDrawingBufferSize(uniforms.uViewport.value);
    uniforms.uCenter.value.copy(center);
    uniforms.uView.value.copy(view);
    uniforms.uTime.value = seconds;
    uniforms.uVisibility.value = visibility;
  }

  function dispose() {
    field.dispose();
    gas.dispose();
    geometry.dispose();
    material.dispose();
  }
  return { mesh, update, dispose };
}
