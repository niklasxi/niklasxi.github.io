import * as T from "three";

export function createOpeningDesk(texture: T.Texture, sheetWidth: number, sheetHeight: number) {
  const corners = [
    new T.Vector3(-sheetWidth / 2, -sheetHeight / 2, 0),
    new T.Vector3(sheetWidth / 2, -sheetHeight / 2, 0),
    new T.Vector3(sheetWidth / 2, sheetHeight / 2, 0),
    new T.Vector3(-sheetWidth / 2, sheetHeight / 2, 0),
  ];
  const outline = corners.map(() => new T.Vector2());
  const projected = new T.Vector3();
  const imageAspect = texture.image.width / texture.image.height;
  const uniforms = {
    uDesk: { value: texture },
    uCover: { value: new T.Vector2() },
    uViewport: { value: new T.Vector2() },
    uOutline: { value: outline },
    uOpacity: { value: 0 },
    uLift: { value: 0 },
  };
  // Draw over the water and sky, before the paper. Standard alpha blending
  // fades the desk out while the same mesh continues across both settings.
  const material = new T.ShaderMaterial({
    uniforms,
    depthTest: false,
    depthWrite: false,
    blending: T.CustomBlending,
    blendSrc: T.SrcAlphaFactor,
    blendDst: T.OneMinusSrcAlphaFactor,
    blendSrcAlpha: T.OneFactor,
    blendDstAlpha: T.OneMinusSrcAlphaFactor,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0., 1.);
      }`,
    fragmentShader: `
      uniform sampler2D uDesk;
      uniform vec2 uCover, uViewport, uOutline[4];
      uniform float uOpacity, uLift;
      varying vec2 vUv;

      float cross2(vec2 a, vec2 b) {
        return a.x * b.y - a.y * b.x;
      }

      void main() {
        vec3 wood = texture2D(uDesk, (vUv - .5) * uCover + .5).rgb;
        vec2 fromLamp = vUv - vec2(.5, .64);
        float falloff = min(1., length(fromLamp / vec2(.76, .96)) / .82);
        wood = mix(wood, vec3(.055, .035, .027), .67 * falloff);
        float warmth = max(0., 1. - length(fromLamp / vec2(.68, .82)) / .68);
        wood = mix(wood, vec3(.976, .714, .416), .20 * warmth);

        // Track the four projected paper edges. The shadow drifts down the
        // desk and softens as the sheet moves farther from the lamp's pool.
        vec2 lightOffset = vec2(1.5 + 16. * uLift, -4. - 24. * uLift);
        vec2 point = vUv * uViewport - lightOffset;
        float side = sign(cross2(uOutline[1] - uOutline[0], uOutline[2] - uOutline[1]));
        float distanceFromPaper = -10000.;
        for (int i = 0; i < 4; i++) {
          vec2 edge = uOutline[(i + 1) % 4] - uOutline[i];
          float edgeDistance = -side * cross2(edge, point - uOutline[i]) / max(length(edge), .01);
          distanceFromPaper = max(distanceFromPaper, edgeDistance);
        }
        float shadow = 1. - smoothstep(-4., 15. + 29. * uLift, distanceFromPaper);
        wood = mix(wood, vec3(.035, .020, .012), shadow * (.64 - .32 * uLift));
        gl_FragColor = vec4(wood, uOpacity);
      }`,
  });
  const mesh = new T.Mesh(new T.PlaneGeometry(2, 2), material);
  mesh.name = "Desk and lamplight";
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  mesh.visible = false;

  return {
    mesh,
    update(camera: T.Camera, paper: T.Object3D, width: number, height: number, opacity: number, lift: number) {
      mesh.visible = opacity > 0;
      if (!mesh.visible) return;
      uniforms.uOpacity.value = opacity;
      uniforms.uLift.value = lift;
      uniforms.uViewport.value.set(width, height);
      const aspect = width / height;
      uniforms.uCover.value.set(Math.min(1, aspect / imageAspect), Math.min(1, imageAspect / aspect));
      corners.forEach((corner, i) => {
        projected.copy(corner).applyMatrix4(paper.matrixWorld).project(camera);
        outline[i].set((projected.x * .5 + .5) * width, (projected.y * .5 + .5) * height);
      });
    },
  };
}
