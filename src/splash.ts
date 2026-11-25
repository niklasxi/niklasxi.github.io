import * as T from "three";

export function createSplash(scene: T.Scene) {
  const spray = new T.InstancedMesh(
    new T.SphereGeometry(1, 6, 4),
    new T.MeshPhongMaterial({
      specular: 0xffefd1,
      shininess: 95,
      color: 0x87b0b3,
      transparent: true,
      opacity: 0.71,
      depthWrite: false,
    }),
    44,
  );
  spray.frustumCulled = false;
  scene.add(spray);
  // The impact first throws up a continuous lip of water. Its thinner
  // sections break up into droplets as the crown falls back into the swell.
  const crownGeo = new T.PlaneGeometry(1, 1, 112, 6);
  const crownMat = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    uniforms: { age: { value: 0 }, strength: { value: 1 } },
    vertexShader: `uniform float age,strength; varying vec2 v;
    void main(){
      v=uv;float a=uv.x*6.2831853;
      float lobes=.55+.20*sin(9.*a)+.13*sin(17.*a+1.)+.12*cos(23.*a);
      float h=max(0.,age*(3.1+lobes*2.)-5.7*age*age)*lobes*strength;
      float r=.22+age*1.72+uv.y*(.12+age*.49);
      vec3 p=vec3((1.40+r)*cos(a),h*uv.y-.05,(.48+r)*sin(a));
      gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
    }`,
    fragmentShader: `uniform float age; varying vec2 v;
    void main(){
      float edge=smoothstep(.78,1.,v.y);
      float lace=sin(150.*v.x+6.*v.y)*cos(31.*v.y-47.*v.x);
      float alpha=(.13+.53*edge)*(1.-smoothstep(.31,.79,age));
      alpha*=smoothstep(-.85,-.35,lace+1.-v.y);
      gl_FragColor=vec4(mix(vec3(.25,.47,.47),vec3(.98,.91,.73),edge),alpha);
    }`,
  });
  const crown = new T.Mesh(crownGeo, crownMat);
  crown.frustumCulled = false;
  scene.add(crown);
  const drop = new T.Object3D();
  const origin = new T.Vector3();
  let active = false;
  return (age: number, boat: T.Vector3, reduced: boolean) => {
    spray.visible = age >= 0 && age < 0.83;
    crown.visible = spray.visible;
    if (!spray.visible) {
      active = false;
      return;
    }
    if (!active) {
      origin.copy(boat);
      active = true;
    }
    crown.position.copy(origin);
    crown.position.y += 0.16;
    crownMat.uniforms.age.value = age;
    crownMat.uniforms.strength.value = reduced ? 0.46 : 1;
    for (let i = 0; i < spray.count; i++) {
      const a = i * 2.39996,
        power = 0.5 + 0.5 * Math.sin(i * 37.3),
        lift = (1.3 + power * 2) * (reduced ? 0.7 : 1);
      const y = lift * age - 4.9 * age * age;
      const r = 0.017 + power * 0.023;
      drop.scale.setScalar(y < 0 ? 0 : r);
      drop.scale.y *= 1.55;
      drop.position.set(
        origin.x + Math.cos(a) * (1.52 + age * (1.1 + power)),
        origin.y + 0.19 + y,
        origin.z + Math.sin(a) * (0.64 + age * (1.6 + power)),
      );
      drop.updateMatrix();
      spray.setMatrixAt(i, drop.matrix);
    }
    spray.instanceMatrix.needsUpdate = true;
  };
}
