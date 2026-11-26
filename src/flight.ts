import * as T from "three";
import { ease, wave } from "./waves";
import { createAirplaneFold } from "./airplane";
import type { createPaper } from "./paper";

const projects = [
  {
    name: "Packet Flow",
    url: "https://github.com/niklasxi/packet-flow",
    detail:
      "A macOS network map. Watch packets travel between hosts and follow the conversations taking place on your network.",
  },
  {
    name: "Git Ship",
    detail:
      "A cargo ship built from GitHub activity. Languages become cargo, turning a developer’s work into a vessel with its own silhouette.",
  },
];

function landmarks() {
  const brass = new T.MeshStandardMaterial({
    color: 0xd6ae73,
    metalness: 0.38,
    roughness: 0.5,
  });
  const dark = new T.MeshStandardMaterial({ color: 0x24495b, roughness: 0.62 });
  const glass = new T.MeshStandardMaterial({
    color: 0x8cdcd4,
    emissive: 0x17494f,
  });
  const groups = projects.map(() => new T.Group());
  function mesh(
    group: T.Group,
    geometry: T.BufferGeometry,
    material: T.Material,
    x: number,
    y: number,
    z: number,
  ) {
    const m = new T.Mesh(geometry, material);
    m.position.set(x, y, z);
    group.add(m);
    return m;
  }
  const globe = groups[0];
  for (let i = 0; i < 4; i++) {
    const ring = mesh(
      globe,
      new T.TorusGeometry(3.4, 0.046, 8, 96),
      brass,
      0,
      0,
      0,
    );
    ring.rotation.set(0.35 + i * 0.64, i * 0.77, i * 0.43);
    for (let j = 0; j < 4; j++) {
      const a = (j * Math.PI) / 2 + i * 0.4;
      const dot = new T.Mesh(new T.IcosahedronGeometry(0.21, 1), glass);
      dot.position.set(3.4 * Math.cos(a), 3.4 * Math.sin(a), 0);
      ring.add(dot);
    }
  }
  mesh(globe, new T.IcosahedronGeometry(1.22, 1), dark, 0, 0, 0);
  const ship = groups[1];
  const outline = new T.Shape();
  outline.moveTo(-4, 0.3);
  outline.lineTo(4, 0.7);
  outline.lineTo(3, -0.65);
  outline.lineTo(-3.45, -0.65);
  outline.closePath();
  mesh(
    ship,
    new T.ExtrudeGeometry(outline, {
      depth: 1.8,
      bevelSize: 0.13,
      bevelThickness: 0.12,
      bevelSegments: 1,
    }),
    dark,
    0,
    0,
    -0.9,
  );
  const paints = [
    brass,
    glass,
    new T.MeshStandardMaterial({ color: 0xb86846 }),
  ];
  for (let row = 0; row < 2; row++)
    for (let i = 0; i < 5; i++) {
      const height = 1 + ((i + row) % 2);
      for (let j = 0; j < height; j++)
        mesh(
          ship,
          new T.BoxGeometry(0.84, 0.49, 0.76),
          paints[(i + row + j) % 3],
          -1.85 + i * 0.91,
          0.76 + j * 0.52,
          row * 0.87 - 0.44,
        );
    }
  mesh(ship, new T.BoxGeometry(0.84, 1.8, 1.65), brass, -2.95, 1.11, 0);
  mesh(ship, new T.BoxGeometry(1.04, 0.42, 1.85), dark, -2.95, 2.05, 0);
  return groups;
}

export function createFlight(
  scene: T.Scene,
  boat: T.Group,
  paper: ReturnType<typeof createPaper>,
  camera: T.PerspectiveCamera,
  cue: () => void,
) {
  const airplane = createAirplaneFold(),
    original = paper.mesh.geometry;
  const start = new T.Vector3(),
    cameraStart = new T.Vector3(),
    cameraRotation = new T.Quaternion(),
    boatStart = new T.Quaternion();
  const flightRig = new T.Group();
  flightRig.visible = false;
  scene.add(flightRig);
  const sculptures = landmarks();
  flightRig.add(...sculptures);
  const nav = document.querySelector<HTMLElement>("#destinations")!;
  const panel = document.querySelector<HTMLElement>("#project-detail")!;
  const back = panel.querySelector("button")!;
  const links = projects.map((project, i) => {
    const button = document.createElement("button");
    button.textContent = project.name + " ↗";
    nav.append(button);
    button.onclick = () => {
      selected = lastDestination = i;
      nav.hidden = true;
      cue();
    };
    return button;
  });
  back.onclick = () => {
    const previous = selected;
    selected = -1;
    panel.hidden = true;
    nav.hidden = false;
    links[previous]?.focus();
    cue();
  };
  const endPosition = new T.Vector3(),
    focus = new T.Vector3(),
    orientation = new T.Quaternion();
  let age = 0,
    aircraftFold = 0,
    selected = -1,
    lastDestination = 0,
    approach = 0,
    ready = false,
    lifted = false;
  let dolphin: T.Object3D | undefined;
  function begin() {
    start.copy(boat.position);
    cameraStart.copy(camera.position);
    cameraRotation.copy(camera.quaternion);
    boatStart.copy(boat.quaternion);
    age = 0;
    selected = -1;
    approach = 0;
    ready = false;
    lifted = false;
    aircraftFold = 0;
    flightRig.position.copy(start);
    flightRig.visible = true;
    dolphin = scene.getObjectByName("Breaching dolphin 1");
  }
  function reset() {
    paper.mesh.geometry = original;
    paper.fold(0);
    flightRig.visible = false;
    nav.hidden = panel.hidden = true;
    if (dolphin) dolphin.visible = false;
  }
  function update(
    dt: number,
    time: number,
    reduced: boolean,
    steer: T.Vector2,
  ) {
    age += dt;
    const duration = reduced ? 6 : 13,
      p = Math.min(1, age / duration);
    const sail = ease(0, 0.71, p),
      climb = ease(0.42, 0.9, p),
      sky = ease(0.57, 0.91, p);
    const scale = reduced ? 0.65 : 1;
    const distance = 34 * sail + 14 * climb;
    boat.position.set(start.x, start.y, start.z - distance);
    const afloat = wave(start.x, boat.position.z, time, 1) - 0.16;
    boat.position.y =
      T.MathUtils.lerp(start.y, afloat, ease(0, 0.12, p)) * (1 - climb) +
      (16 + Math.sin(time * 0.6) * 0.16) * climb;
    const unfolding = 1 - ease(0.41, 0.58, p);
    if (p < 0.58) paper.fold(unfolding);
    else {
      paper.mesh.geometry = airplane.geometry;
      aircraftFold = ease(0.58, 0.82, p);
      airplane.fold(aircraftFold);
      paper.mesh.material.uniforms.uFold.value = aircraftFold;
    }
    if (!lifted && p > 0.41) {
      lifted = true;
      cue();
    }
    const steerX = steer.x * (reduced ? 0.18 : 1);
    orientation.setFromEuler(
      new T.Euler(-Math.PI / 2 + 0.1 * Math.sin(age * 0.64), 0, -0.12 * steerX),
    );
    const sailing = new T.Quaternion().setFromEuler(
      new T.Euler(0, -Math.PI / 2, 0),
    );
    boat.quaternion
      .copy(boatStart)
      .slerp(sailing, sail)
      .slerp(orientation, climb);
    const endZ = boat.position.z;
    const spread = Math.min(10, Math.max(4.1, camera.aspect * 7));
    const depth = camera.aspect < 0.85 ? 29 : 21;
    sculptures.forEach((g, i) => {
      g.visible = p > 0.59;
      g.scale.setScalar(
        ease(0.59, 0.92, p) * (camera.aspect < 0.85 ? 0.68 : 1),
      );
      g.position.set(
        (i ? 1 : -1) * spread,
        16 - start.y + 2 + (i ? -0.6 : 0.7) + Math.sin(time * 0.43 + i) * 0.3,
        -48 - depth,
      );
      g.rotation.y = (i ? -0.4 : 0.18) + Math.sin(time * 0.23) * 0.12;
    });
    approach = T.MathUtils.damp(approach, selected >= 0 ? 1 : 0, 3, dt);
    endPosition.set(
      start.x + steerX * 0.65,
      boat.position.y +
        3.0 * scale +
        sky * 4 -
        (reduced ? 0 : 4.5 * Math.sin(Math.PI * climb)),
      endZ + Math.max(10.3 + sky * 2, 8.5 / camera.aspect),
    );
    focus.copy(boat.position);
    focus.y += 1.1;
    focus.z -= 3 + sky * 4;
    if (selected >= 0 || approach > 0.002) {
      const target = sculptures[lastDestination].getWorldPosition(
        new T.Vector3(),
      );
      boat.position.x = T.MathUtils.lerp(
        boat.position.x,
        target.x,
        approach * 0.84,
      );
      boat.position.z -= approach * 9;
      endPosition.x = T.MathUtils.lerp(
        endPosition.x,
        target.x,
        approach * 0.86,
      );
      endPosition.z -= approach * 11;
      focus.lerp(target, approach);
      if (selected >= 0 && approach > 0.92 && panel.hidden) {
        const project = projects[selected];
        panel.querySelector("h2")!.textContent = project.name;
        panel.querySelector("p")!.textContent = project.detail;
        const link = panel.querySelector("a")!;
        link.hidden = !project.url;
        if (project.url) link.href = project.url;
        else link.removeAttribute("href");
        panel.hidden = false;
        back.focus({ preventScroll: true });
      }
    } else boat.position.x += steerX * 0.9 * sky;
    camera.position.copy(cameraStart).lerp(endPosition, ease(0, 0.23, p));
    camera.lookAt(focus);
    orientation.copy(camera.quaternion);
    camera.quaternion.copy(cameraRotation).slerp(orientation, ease(0, 0.23, p));
    camera.updateMatrixWorld();
    if (dolphin) {
      dolphin.visible = p > 0.23 && p < 0.58;
      dolphin.position.set(
        start.x - 5.7 + 2.8 * Math.sin(p * 23),
        4 + Math.sin(p * 28) * 1.5,
        endZ - 7,
      );
      dolphin.rotation.set(0, 1.2, Math.cos(p * 24) * 0.28);
    }
    if (p >= 1) {
      if (!ready) {
        ready = true;
        nav.hidden = false;
        cue();
      }
      links.forEach((link, i) => {
        const pos = sculptures[i].getWorldPosition(new T.Vector3());
        pos.y -= 3.2 * sculptures[i].scale.y;
        pos.project(camera);
        link.style.left = 50 + pos.x * 50 + "%";
        link.style.top = 50 - pos.y * 50 + "%";
      });
    }
    return {
      sky,
      canyon: ease(0, 0.35, p) * (1 - ease(0.65, 0.94, p)),
      line: ease(0, 0.1, p) * (1 - ease(0.35, 0.62, p)),
      x: start.x,
      ready,
    };
  }
  function pick(ray: T.Raycaster) {
    if (!ready || selected >= 0) return false;
    const i = sculptures.findIndex(
      (g) => ray.intersectObject(g, true).length > 0,
    );
    if (i < 0) return false;
    links[i].click();
    return true;
  }
  return {
    begin,
    update,
    pick,
    reset,
    hideControls() {
      nav.hidden = panel.hidden = true;
    },
    openingFold(amount: number) {
      if (paper.mesh.geometry !== airplane.geometry) return false;
      airplane.fold(amount);
      paper.mesh.material.uniforms.uFold.value = amount;
      return true;
    },
  };
}
