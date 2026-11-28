import * as T from "three";
import { captureMuseumWave } from "./museumWave";
import { ease } from "./waves";

const clipNames = ["dolphins", "forest", "dance", "hands", "city", "wildlife", "family", "play", "machines", "craft", "festival"];
const exhibits = [...clipNames, ...[1, 2, 3, 4, 5, 6, 8, 9, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26].map(id => "photo-" + String(id).padStart(2, "0"))];
const base = import.meta.env.BASE_URL + "museum/";
const radius = 24;
const rows = 95;
const aperture = Math.tan(18 * Math.PI / 180);

function hash(row: number, column: number) {
  const value = Math.sin(row * 127.1 + column * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

export function createMuseum() {
  const scene = new T.Scene();
  scene.background = new T.Color(0x05080d);
  const camera = new T.PerspectiveCamera(36, 1, .015, 400);
  const world = new T.Group();
  scene.add(world);
  const loader = new T.TextureLoader();
  const land = loader.load(base + "land.png");
  const gray = { value: 0 };
  const panorama = { value: 0 };

  // Every frame is tangent to the same sphere. Its curvature is imperceptible
  // a few inches from a single photograph and emerges naturally on retreat.
  const plate = new T.PlaneGeometry(1, 1);
  const groups: T.Matrix4[][] = exhibits.map(() => []);
  const coordinates: number[][] = exhibits.map(() => []);
  const dummy = new T.Object3D();
  const rowHeight = Math.PI * radius / rows;
  const frameWidth = rowHeight * 1.65;
  const entrance = [18, 4, 12, 8, 23, 16, 7, 0, 1, 30, 9, 28, 2, 3, 10];
  for (let row = 0; row < rows; row++) {
    const lat = (row - (rows - 1) / 2) * Math.PI / rows;
    const count = Math.max(3, Math.round(2 * Math.PI * radius * Math.cos(lat) / frameWidth));
    for (let col = 0; col < count; col++) {
      const lon = (col + (row % 2 === 0 ? .41 : 0)) * 2 * Math.PI / count;
      const east = col > count / 2 ? col - count : col;
      const north = row - (rows - 1) / 2;
      const featured = Math.abs(east) <= 2 && Math.abs(north) <= 1;
      // The entrance stays on the dolphins. Give the closest wall a curated
      // mix of moving and still subjects, then scatter the archive across land.
      const film = featured ? entrance[(north + 1) * 5 + east + 2]
        : Math.floor(hash(row, col) * exhibits.length);
      dummy.position.set(Math.sin(lon) * Math.cos(lat), Math.sin(lat), Math.cos(lon) * Math.cos(lat)).multiplyScalar(radius);
      dummy.rotation.set(-lat, lon, 0, "YXZ");
      dummy.scale.set(2 * Math.PI * radius * Math.cos(lat) / count * .955, rowHeight * .90, 1);
      dummy.updateMatrix();
      groups[film].push(dummy.matrix.clone());
      // The opening wall sits in equatorial Africa.
      coordinates[film].push((lon / (2 * Math.PI) + .56) % 1, .5 + lat / Math.PI, hash(col + 31, row));
    }
  }

  const clips = exhibits.map((name, i) => {
    const video = i < clipNames.length ? document.createElement("video") : undefined;
    if (video) {
      video.loop = video.muted = video.playsInline = true;
      video.preload = "metadata";
      video.src = base + name + ".mp4";
    }
    const poster = loader.load(base + name + ".jpg");
    const movie = video ? new T.VideoTexture(video) : undefined;
    const uniforms = { film: { value: poster as T.Texture }, land: { value: land }, panorama, gray };
    const material = new T.ShaderMaterial({
      uniforms,
      vertexShader: `
        attribute vec3 geography;
        varying vec2 vUv;
        varying vec3 vGeo;
        varying vec3 vNormal;
        void main(){
          vUv=uv; vGeo=geography;
          vNormal=normalize(mat3(modelMatrix)*mat3(instanceMatrix)*normal);
          gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);
        }`,
      fragmentShader: `
        varying vec2 vUv; varying vec3 vGeo,vNormal;
        uniform sampler2D film,land;
        uniform float panorama,gray;
        void main(){
          float continent=texture2D(land,vGeo.xy).r;
          float remote=panorama*(1.-continent);
          if(remote>.98 && vGeo.z>.014) discard;
          vec2 edge=min(vUv,1.-vUv)*vec2(1.77,1.);
          float border=min(edge.x,edge.y);
          float image=smoothstep(.027,.032,border);
          vec2 uv=clamp((vUv-vec2(.016,.028))/vec2(.968,.944),0.,1.);
          vec3 rgb=texture2D(film,uv).rgb;
          float bevel=smoothstep(.003,.009,border)*(1.-smoothstep(.013,.022,border));
          vec3 trim=mix(vec3(.075,.057,.046),vec3(.55,.46,.34),bevel*(.55+.4*vUv.y));
          rgb=mix(trim,rgb,image);
          float daylight=.72+.28*max(0.,dot(normalize(vNormal),normalize(vec3(-.64,.66,.54))));
          rgb=mix(vec3(dot(rgb,vec3(.2126,.7152,.0722))),rgb,1.+.18*panorama);
          rgb*=mix(1.,daylight,panorama);
          rgb=mix(rgb,vec3(.08,.13,.18),remote*(vGeo.z>.014?1.:.55));
          rgb=mix(rgb,vec3(dot(rgb,vec3(.2126,.7152,.0722))),gray);
          gl_FragColor=vec4(rgb,1.);
        }`,
    });
    const geometry = plate.clone();
    geometry.setAttribute("geography", new T.InstancedBufferAttribute(new Float32Array(coordinates[i]), 3));
    const frames = new T.InstancedMesh(geometry, material, groups[i].length);
    groups[i].forEach((matrix, j) => frames.setMatrixAt(j, matrix));
    world.add(frames);
    return { video, poster, movie, uniforms, geometry, material };
  });

  // A dim ocean and a thin atmospheric limb keep the globe readable between
  // the individual screens. Geography is supplied by the frames themselves.
  const globeGeometry = new T.SphereGeometry(radius - .014, 180, 100);
  const globeMaterial = new T.ShaderMaterial({
    uniforms: { panorama, gray },
    vertexShader: `varying vec3 n,v;
      void main(){vec4 p=modelViewMatrix*vec4(position,1.); n=normalMatrix*normal;v=-p.xyz;gl_Position=projectionMatrix*p;}`,
    fragmentShader: `varying vec3 n,v; uniform float panorama,gray;
      void main(){
        vec3 N=normalize(n);float rim=pow(1.-max(0.,dot(N,normalize(v))),2.6);
        float light=max(0.,dot(N,normalize(vec3(-.65,.65,.42))));
        vec3 sea=vec3(.025,.055,.083)+light*vec3(.05,.105,.135)+rim*vec3(.15,.25,.31);
        vec3 c=mix(vec3(.12,.105,.095),sea,panorama);
        gl_FragColor=vec4(mix(c,vec3(dot(c,vec3(.2126,.7152,.0722))),gray),1.);
      }`,
  });
  world.add(new T.Mesh(globeGeometry, globeMaterial));
  let wave: ReturnType<typeof captureMuseumWave> | undefined;
  function play() {
    for (const { video } of clips) void video?.play().catch(() => {});
  }
  return {
    play,
    captureOcean(renderer: T.WebGLRenderer) { wave = captureMuseumWave(renderer); },
    pause() { for (const { video } of clips) video?.pause(); },
    render(renderer: T.WebGLRenderer, elapsed: number, aspect: number, reduced: boolean) {
      const duration = reduced ? 11 : 26;
      const t = Math.min(elapsed / duration, 1);
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      const close = Math.min(rowHeight * .42, frameWidth * .44 / aspect) / aperture;
      const gallery = Math.min(4.4, 3.4 / aspect);
      const globe = radius * (Math.sqrt(1 + 1 / (aperture * Math.min(1, aspect) * .76) ** 2) - 1);
      const pull = ease(.08,.52,t);
      const retreat = ease(.45,.88,t);
      const distance = close * (gallery / close) ** pull * (globe / gallery) ** retreat;
      world.rotation.y = -.073 * ease(.10,.37,t) + .145 * ease(.32,.55,t) - .64 * ease(.55,.93,t);
      world.rotation.x = .13 * ease(.48,.91,t);
      if (reduced) {
        // Two short dissolving-scale transitions with a long stationary globe.
        camera.position.z = radius + T.MathUtils.lerp(T.MathUtils.lerp(close, gallery, ease(.19,.29,t)),globe,ease(.49,.62,t));
        world.rotation.set(.11,-.26*ease(.48,.62,t),0);
        world.rotation.x *= ease(.48,.62,t);
      } else camera.position.z = radius + distance;
      panorama.value = ease(.43,.77,t);
      gray.value = ease(.93,.995,t);
      for (const {video, uniforms, movie} of clips) {
        if (video && movie && video.readyState >= 2) uniforms.film.value = movie;
      }
      const washDuration = reduced ? .48 : 1.65;
      if (wave && elapsed < washDuration) {
        renderer.setRenderTarget(wave.incoming);
        renderer.render(scene, camera);
        wave.composite(ease(0, washDuration, elapsed), reduced);
      } else {
        wave?.dispose();
        wave = undefined;
        renderer.render(scene, camera);
      }
      return t >= 1;
    },
    dispose() {
      wave?.dispose();
      for (const clip of clips) {
        clip.video?.pause();
        clip.video?.removeAttribute("src");
        clip.video?.load();
        clip.geometry.dispose(); clip.material.dispose();
        clip.poster.dispose(); clip.movie?.dispose();
      }
      world.traverse(object => { if (object instanceof T.InstancedMesh) object.dispose(); });
      globeGeometry.dispose(); globeMaterial.dispose(); plate.dispose(); land.dispose();
    },
  };
}
