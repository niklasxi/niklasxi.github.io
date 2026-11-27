import * as T from "three";

export function createWastebasket() {
  const basket = new T.Group();
  const steel = new T.MeshStandardMaterial({ color: 0x78828a, roughness: 0.48, metalness: 0.52 });
  const base = new T.Mesh(new T.CylinderGeometry(2.05, 2.02, 0.12, 72), steel);
  basket.add(base);
  const height = 3.8;
  for (const [y, radius] of [[0.09,2.04],[height,2.9],[height-0.12,2.87]]) {
    const ring = new T.Mesh(new T.TorusGeometry(radius, 0.045, 8, 96), steel);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    basket.add(ring);
  }
  const strands = 40, steps = 12;
  const wire = new T.InstancedMesh(new T.CylinderGeometry(0.016,0.016,1,5),
    steel, 2 * strands * steps);
  const segment = new T.Object3D(), up = new T.Vector3(0,1,0);
  const start = new T.Vector3(), finish = new T.Vector3(), delta = new T.Vector3();
  let index = 0;
  for (const winding of [-1,1]) for (let n = 0; n < strands; n++) {
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, a = 2*Math.PI*n/strands + winding*t*0.99;
      const radius = 2.04 + 0.86*t;
      finish.set(radius*Math.cos(a), 0.09+(height-0.09)*t, radius*Math.sin(a));
      if (i) {
        segment.position.addVectors(start,finish).multiplyScalar(0.5);
        delta.subVectors(finish,start);
        segment.scale.y = delta.length()+0.009;
        segment.quaternion.setFromUnitVectors(up,delta.normalize());
        segment.updateMatrix();
        wire.setMatrixAt(index++,segment.matrix);
      }
      start.copy(finish);
    }
  }
  basket.add(wire);
  return basket;
}
