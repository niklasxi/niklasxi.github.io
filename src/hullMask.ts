import * as T from "three";

// Look straight up at the finished paper. The depth test selects the lowest
// folded panel at each point in the footprint, including the tapered tips.
export function bakeHullMask(
  renderer: T.WebGLRenderer,
  geometry: T.BufferGeometry,
) {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const size = box.getSize(new T.Vector3());
  const center = box.getCenter(new T.Vector3());
  const camera = new T.OrthographicCamera(
    -size.x / 2,
    size.x / 2,
    size.z / 2,
    -size.z / 2,
    0.1,
    size.y + 2,
  );
  camera.position.set(center.x, box.min.y - 1, center.z);
  camera.up.set(0, 0, 1);
  camera.lookAt(center);
  const target = new T.WebGLRenderTarget(512, 256, { generateMipmaps: false });
  const material = new T.ShaderMaterial({
    side: T.DoubleSide,
    uniforms: { bottom: { value: box.min.y }, height: { value: size.y } },
    vertexShader: `uniform float bottom,height; varying float level;
      void main(){level=(position.y-bottom)/height; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying float level;
      void main(){gl_FragColor=vec4(level,0.,0.,1.);}`,
  });
  const scene = new T.Scene();
  scene.add(new T.Mesh(geometry, material));
  const originalTarget = renderer.getRenderTarget();
  renderer.setRenderTarget(target);
  renderer.clear();
  renderer.render(scene, camera);
  renderer.setRenderTarget(originalTarget);
  material.dispose();
  return {
    texture: target.texture,
    bounds: new T.Vector4(box.min.x, box.min.z, 1 / size.x, 1 / size.z),
    levels: new T.Vector2(box.min.y, size.y),
  };
}
