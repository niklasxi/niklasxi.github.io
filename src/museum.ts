import * as T from "three";
import { captureMuseumWave } from "./museumWave";
import { ease } from "./waves";

const clipNames = ["dolphins", "forest", "dance", "hands", "city", "wildlife", "family", "play", "machines", "craft", "festival"];
const exhibits = [...clipNames, ...Array.from({ length: 31 }, (_, i) => "photo-" + String(i + 1).padStart(2, "0")).filter(name => !["photo-07", "photo-10", "photo-27"].includes(name))];
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
  scene.background = new T.Color(0x020611);
  const skyGeometry = new T.SphereGeometry(280, 64, 40);
  const skyMaterial = new T.ShaderMaterial({
    side: T.BackSide,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    vertexShader: `varying vec3 direction;
      void main(){direction=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec3 direction;
      void main(){
        vec3 d=normalize(direction);
        float band=exp(-pow((d.y+.17*d.x+.11*sin(d.z*6.))/.19,2.));
        float clouds=.5+.5*sin(d.x*19.+d.z*13.)*sin(d.y*23.-d.x*7.);
        float haze=band*(.32+.68*clouds);
        vec3 base=mix(vec3(.003,.007,.02),vec3(.009,.019,.041),smoothstep(-.9,.8,d.y));
        float glow=exp(-pow(length(d.xz-vec2(.34,-.12))/.42,2.));
        vec3 color=base+haze*vec3(.012,.023,.049)+glow*vec3(.004,.009,.019);
        gl_FragColor=vec4(color,1.);
      }`,
  });
  const sky = new T.Mesh(skyGeometry, skyMaterial);
  sky.renderOrder = -1000;
  scene.add(sky);

  const starCount = 2600;
  const starGeometry = new T.BufferGeometry();
  const starPositions = new Float32Array(starCount * 3);
  const starColors = new Float32Array(starCount * 3);
  const starSizes = new Float32Array(starCount);
  let seed = 0x51a7;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < starCount; i++) {
    const y = random() < .34 ? (random() - .5) * .48 : random() * 2 - 1;
    const angle = random() * Math.PI * 2;
    const ring = Math.sqrt(1 - y * y);
    const offset = i * 3;
    starPositions[offset] = Math.cos(angle) * ring * 272;
    starPositions[offset + 1] = y * 272;
    starPositions[offset + 2] = Math.sin(angle) * ring * 272;
    const brightness = .55 + random() * .45;
    const warm = random() < .18;
    starColors[offset] = brightness * (warm ? .88 : .62);
    starColors[offset + 1] = brightness * (warm ? .70 : .80);
    starColors[offset + 2] = brightness * (warm ? .52 : 1);
    starSizes[i] = random() < .08 ? 3.3 : 2 + random() * .85;
  }
  starGeometry.setAttribute("position", new T.BufferAttribute(starPositions, 3));
  starGeometry.setAttribute("tint", new T.BufferAttribute(starColors, 3));
  starGeometry.setAttribute("size", new T.BufferAttribute(starSizes, 1));
  const starMaterial = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
    toneMapped: false,
    vertexShader: `attribute vec3 tint;attribute float size;varying vec3 vTint;
      void main(){vec4 view=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*view;gl_PointSize=size;vTint=tint;}`,
    fragmentShader: `varying vec3 vTint;
      void main(){float r=length(gl_PointCoord-vec2(.5));float a=1.-smoothstep(.04,.48,r);if(a<.015)discard;gl_FragColor=vec4(vTint*a*1.25,a);}`,
  });
  const stars = new T.Points(starGeometry, starMaterial);
  stars.frustumCulled = false;
  scene.add(stars);

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
      camera.far = Math.max(400, camera.position.length() + 300);
      camera.updateProjectionMatrix();
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
      scene.remove(sky, stars);
      skyGeometry.dispose(); skyMaterial.dispose(); starGeometry.dispose(); starMaterial.dispose();
      globeGeometry.dispose(); globeMaterial.dispose(); plate.dispose(); land.dispose();
    },
  };
}
