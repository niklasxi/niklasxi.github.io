import * as T from "three";
import fieldUrl from "./assets/quiet-deep-field.webp";

const quadVertex = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.9999, 1.0);
  }
`;

const optics = `
  const vec2 halfExtent = vec2(1.0, 0.5625);
  const vec3 observer = vec3(0.0, 1.14, 17.0);
  vec3 cameraRay(vec2 point) {
    vec3 forward = normalize(-observer);
    vec3 up = vec3(0.0, -forward.z, forward.y);
    return normalize(1.18 * forward + vec3(point.x, 0.0, 0.0) + point.y * up);
  }
`;

// Adapted from Jonás Javier Encarnación's Schwarzschild ray integrator and disk:
// https://jonasjavier.dev/en/blog/black-hole-three-js-shader-tutorial#the-full-file
// The camera is fixed relative to the disk. Trace once and store both visible
// disk intersections plus the direction of the escaping ray. The disk can then
// rotate over a full-resolution star field without marching rays every frame.
const traceFragment = `
  in vec2 vUv;
  layout(location = 0) out vec4 frontHit;
  layout(location = 1) out vec4 backHit;
  layout(location = 2) out vec4 escapeRay;
  ${optics}
  vec3 acceleration(vec3 position, float angularMomentumSq) {
    float radiusSq = max(dot(position, position), 0.0001);
    return -1.5 * angularMomentumSq * position / (radiusSq * radiusSq * sqrt(radiusSq));
  }
  vec4 diskHit(vec3 hit, vec3 ray, float radius) {
    vec2 azimuth = hit.xz / radius;
    vec3 orbit = vec3(-azimuth.y, 0.0, azimuth.x);
    float speed = inversesqrt(2.0 * (radius - 1.0));
    float doppler = sqrt(1.0 - speed * speed) / (1.0 - speed * dot(orbit, -normalize(ray)));
    return vec4(azimuth * 0.5 + 0.5, (radius - 3.0) / 7.0, doppler * 0.5);
  }
  void main() {
    vec3 point = observer;
    vec3 ray = cameraRay((2.0 * vUv - 1.0) * halfExtent);
    vec3 momentum = cross(point, ray);
    float angularMomentumSq = dot(momentum, momentum);
    float momentumLength = max(length(momentum), 0.01);
    frontHit = vec4(0.5, 0.5, 1.0, 0.0);
    backHit = vec4(0.5, 0.5, 1.0, 0.0);
    escapeRay = vec4(0.0);
    int crossings = 0;
    for (int stepIndex = 0; stepIndex < 240; stepIndex++) {
      float radiusSq = dot(point, point);
      if (radiusSq < 1.0) break;
      if (radiusSq > 1600.0 && dot(point, ray) > 0.0) {
        escapeRay = vec4(normalize(ray) * 0.5 + 0.5, 1.0);
        break;
      }
      float dt = clamp(0.075 * radiusSq / momentumLength, 0.015, 1.1);
      vec3 acc = acceleration(point, angularMomentumSq);
      vec3 nextPoint = point + dt * (ray + 0.5 * dt * acc);
      if (point.y * nextPoint.y < 0.0) {
        vec3 hit = mix(point, nextPoint, point.y / (point.y - nextPoint.y));
        float radius = length(hit.xz);
        if (radius > 3.0 && radius < 10.0) {
          vec4 sampleHit = diskHit(hit, ray, radius);
          if (crossings == 0) frontHit = sampleHit;
          else if (crossings == 1) backHit = sampleHit;
        }
        // Keep the same orbital crossing in each texture even when a ray
        // first crosses empty space beyond the outer edge of the disk.
        crossings++;
      }
      ray += 0.5 * dt * (acc + acceleration(nextPoint, angularMomentumSq));
      point = nextPoint;
    }
  }
`;

// Two separable Gaussian passes spread the disk's actual radiance across
// the lens. The footprint stays fixed while finer gas filaments rotate.
const bloomFragment = `
  varying vec2 vUv;
  uniform sampler2D uFront, uBack, uBlur;
  uniform vec2 uStep;
  uniform bool uHorizontal;
  float intensity(vec4 hit) {
    return pow(1.0 - hit.b, 2.4) * smoothstep(0.002,0.060,hit.b) * pow(2.0*hit.a,3.0);
  }
  void main() {
    float sum = 0.0, weights = 0.0;
    for (int i = -12; i <= 12; i++) {
      float t = float(i);
      vec2 uv = vUv + uStep*t;
      float weight = exp(-t*t/36.0);
      float value = uHorizontal
        ? (intensity(texture2D(uFront, uv)) + intensity(texture2D(uBack, uv))) / 6.0
        : texture2D(uBlur, uv).r;
      sum += value*weight;
      weights += weight;
    }
    gl_FragColor = vec4(vec3(sum/weights),1.0);
  }
`;

const skyFragment = `
  varying vec2 vUv;
  uniform sampler2D uField, uGas, uFront, uBack, uEscape, uGlow;
  uniform vec2 uViewport, uCenter, uFieldPan;
  uniform float uTime, uZoom, uPulse;
  ${optics}

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
    vec3 gas = mix(vec3(0.73,0.15,0.037), vec3(1.0,0.68,0.36), smoothstep(0.12,0.68,heat));
    gas = mix(gas, vec3(1.0,0.90,0.72), smoothstep(0.64,1.0,heat));
    float radiance = 2.55 * temperature * density * doppler*doppler*doppler;
    return vec4(gas * radiance, edge * (0.66 + 0.32*clouds));
  }

  void main() {
    float shortSide = min(uViewport.x, uViewport.y);
    vec2 screen = (vUv-uCenter)*uViewport/(0.47*shortSide*uZoom);
    mat2 tilt = mat2(0.989,-0.148,0.148,0.989);
    vec2 q = tilt * screen;
    vec2 lensUv = clamp(0.5 + 0.5 * q / halfExtent, 0.0, 1.0);
    vec4 escaped = texture2D(uEscape, lensUv);
    vec3 straight = cameraRay(q);
    vec3 bent = escaped.rgb*2.0 - 1.0;
    float bend = 1.0 - smoothstep(0.38, 0.98, length(q/halfExtent));
    vec2 fieldScale = uViewport / (max(uViewport.x/1.463,uViewport.y)*vec2(1.463,1.0));
    vec2 fieldUv = 0.5 + (vUv-0.5)*fieldScale + uFieldPan;
    fieldUv += transpose(tilt)*(bent.xy-straight.xy) * (0.32*bend*shortSide) * fieldScale/uViewport;
    vec3 color = texture2D(uField, fieldUv).rgb * mix(1.0, escaped.a, bend);
    vec4 front = emission(texture2D(uFront,lensUv));
    vec4 back = emission(texture2D(uBack,lensUv));
    color = mix(mix(color,back.rgb,back.a),front.rgb,front.a);
    color += vec3(1.0,0.48,0.24) * texture2D(uGlow,lensUv).r * 0.75;
    gl_FragColor = vec4(1.0 - exp(-color * (1.12 + 0.08*uPulse)), 1.0);
    #include <colorspace_fragment>
    float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    gl_FragColor.rgb += (dither - 0.5) / 255.0;
  }
`;

export function createBlackHoleSky() {
  const field = new T.TextureLoader().load(fieldUrl);
  field.colorSpace = T.SRGBColorSpace;
  field.wrapS = field.wrapT = T.MirroredRepeatWrapping;
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

  const lookup = new T.WebGLRenderTarget(1024, 576, {
    count: 3,
    minFilter: T.LinearFilter,
    magFilter: T.LinearFilter,
    depthBuffer: false,
    generateMipmaps: false,
  });
  const glow = new T.WebGLRenderTarget(384,216,{depthBuffer:false});
  const uniforms = {
    uGlow: { value: glow.texture },
    uField: { value: field },
    uGas: { value: gas },
    uFront: { value: lookup.textures[0] },
    uBack: { value: lookup.textures[1] },
    uEscape: { value: lookup.textures[2] },
    uViewport: { value: new T.Vector2(1, 1) },
    uCenter: { value: new T.Vector2(0.5, 0.5) },
    uFieldPan: { value: new T.Vector2() },
    uTime: { value: 0 },
    uZoom: { value: 1 },
    uPulse: { value: 0 },
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
  let traced = false;

  function update(renderer: T.WebGLRenderer, seconds: number, centerUV: T.Vector2,
    zoom = 1, fieldPan?: T.Vector2, pulse = 0) {
    if (!traced) {
      const trace = new T.ShaderMaterial({
        glslVersion: T.GLSL3, vertexShader: quadVertex, fragmentShader: traceFragment,
        depthWrite: false, depthTest: false,
      });
      const quad = new T.Mesh(geometry, trace);
      quad.frustumCulled = false;
      const scene = new T.Scene();
      scene.add(quad);
      const originalTarget = renderer.getRenderTarget();
      if (renderer.extensions.has("EXT_color_buffer_float")) {
        for (const map of lookup.textures) map.type = T.HalfFloatType;
        glow.texture.type = T.HalfFloatType;
      }
      renderer.setRenderTarget(lookup);
      renderer.render(scene, new T.Camera());
      const temp = glow.clone();
      const blur = new T.ShaderMaterial({
        vertexShader: quadVertex, fragmentShader: bloomFragment,
        uniforms: {
          uHorizontal: {value:true}, uStep: {value:new T.Vector2(2/384,0)},
          uFront: uniforms.uFront, uBack: uniforms.uBack, uBlur: {value:null as T.Texture | null},
        },
        depthTest:false, depthWrite:false,
      });
      quad.material = blur;
      renderer.setRenderTarget(temp);
      renderer.render(scene, new T.Camera());
      blur.uniforms.uHorizontal.value = false;
      blur.uniforms.uStep.value.set(0,2/216);
      blur.uniforms.uBlur.value = temp.texture;
      renderer.setRenderTarget(glow);
      renderer.render(scene, new T.Camera());
      renderer.setRenderTarget(originalTarget);
      temp.dispose();
      blur.dispose();
      trace.dispose();
      traced = true;
    }
    renderer.getDrawingBufferSize(uniforms.uViewport.value);
    uniforms.uCenter.value.copy(centerUV);
    uniforms.uZoom.value = zoom;
    if (fieldPan) uniforms.uFieldPan.value.copy(fieldPan);
    uniforms.uPulse.value = pulse;
    uniforms.uTime.value = seconds;
  }

  function dispose() {
    field.dispose();
    gas.dispose();
    lookup.dispose();
    glow.dispose();
    geometry.dispose();
    material.dispose();
  }
  return { mesh, update, dispose };
}
