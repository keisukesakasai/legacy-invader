import * as THREE from 'three';

// ── Renderer ──────────────────────────────────────────────────────────────
const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0x88c4f0);

// ── Scene & Camera ────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x88c4f0, 0.004);

const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 350);
camera.position.set(0, 16, 34);
camera.lookAt(0, 2, -10);
let camTargetX = 0;
let fovTarget = 62;

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ── Time of Day ───────────────────────────────────────────────────────────
let timeOfDay = 0.40;        // 0=midnight, 0.5=noon, 1=midnight
const TIME_SPEED = 0.000055; // full cycle ~3 min real time

// ── Weather system ────────────────────────────────────────────────────────
// States: 'clear', 'cloudy', 'rain', 'fog', 'storm'
const WEATHER_STATES = ['clear', 'clear', 'cloudy', 'rain', 'fog', 'storm'];
let weatherState     = 'clear';
let weatherTarget    = 'clear';
let weatherIntensity = 0.0;   // 0→1 transition progress
let weatherTimer     = 0;     // frames until next change
const WEATHER_DURATIONS = { clear: 1800, cloudy: 1200, rain: 900, fog: 1000, storm: 600 };
function nextWeather() {
  const options = WEATHER_STATES.filter(w => w !== weatherState);
  weatherTarget = options[Math.floor(Math.random() * options.length)];
  weatherTimer  = WEATHER_DURATIONS[weatherTarget] + Math.floor(Math.random() * 400);
}
nextWeather();

// Keyframes: t, zenith, midSky, horizon, ground, ambInt, ambColor, sunInt, sunColor, fogColor, fogDensity
const PHASES = [
  // Midnight — deep indigo, soft navy fog, visible but dim
  { t:0.00, zen:0x06081a, mid:0x080d22, hor:0x0e1530, gnd:0x04060e, aI:0.55, aC:0x182840, sI:0.0,  sC:0x6080c0, fog:0x08101e, fd:0.003 },
  // Pre-dawn — dark slate lavender
  { t:0.22, zen:0x0d0c28, mid:0x160e30, hor:0x2a1040, gnd:0x070510, aI:0.60, aC:0x201838, sI:0.05, sC:0x8060a0, fog:0x120c22, fd:0.004 },
  // Sunrise — soft peach & lavender horizon, pastel orange sun
  { t:0.26, zen:0x2a2050, mid:0x5040a0, hor:0xf0b090, gnd:0x140a10, aI:0.80, aC:0x806050, sI:1.0,  sC:0xffb870, fog:0xd09070, fd:0.006 },
  // Morning — warm gold wash
  { t:0.32, zen:0x2858b0, mid:0x4880c0, hor:0xd0b878, gnd:0x182018, aI:1.1,  aC:0x8a7850, sI:2.2,  sC:0xffd898, fog:0xa09068, fd:0.005 },
  // Noon — clear blue
  { t:0.50, zen:0x155aab, mid:0x3382cc, hor:0x88c4f0, gnd:0x204030, aI:1.4,  aC:0x7a9090, sI:3.5,  sC:0xfff8f0, fog:0x88c0e0, fd:0.004 },
  // Afternoon — slightly warmer
  { t:0.67, zen:0x143898, mid:0x2e68c0, hor:0x78a8d8, gnd:0x203028, aI:1.3,  aC:0x6880a0, sI:3.0,  sC:0xffe898, fog:0x6890c0, fd:0.004 },
  // Sunset — romantic pastel: apricot, rose, soft lavender zenith
  { t:0.74, zen:0x2a1848, mid:0x7040a0, hor:0xffb890, gnd:0x0e0810, aI:1.0,  aC:0xa07060, sI:2.0,  sC:0xffb870, fog:0xe08868, fd:0.006 },
  // Deep sunset — mauve & dusty rose
  { t:0.78, zen:0x180e30, mid:0x3a2060, hor:0xff9060, gnd:0x080408, aI:0.75, aC:0x704848, sI:1.2,  sC:0xffaa80, fog:0xc07050, fd:0.007 },
  // Dusk — indigo with warm afterglow at horizon
  { t:0.83, zen:0x080a20, mid:0x101530, hor:0x603050, gnd:0x040408, aI:0.60, aC:0x302040, sI:0.2,  sC:0x9060a0, fog:0x302040, fd:0.005 },
  // Night — back to midnight
  { t:0.92, zen:0x06081a, mid:0x080d22, hor:0x0e1530, gnd:0x04060e, aI:0.55, aC:0x182840, sI:0.0,  sC:0x6080c0, fog:0x08101e, fd:0.003 },
  { t:1.00, zen:0x06081a, mid:0x080d22, hor:0x0e1530, gnd:0x04060e, aI:0.55, aC:0x182840, sI:0.0,  sC:0x6080c0, fog:0x08101e, fd:0.003 },
];

function skyAt(t) {
  let i = 0;
  while (i < PHASES.length - 2 && PHASES[i+1].t <= t) i++;
  const a = PHASES[i], b = PHASES[i+1];
  const f = Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t)));
  const lc = (hA, hB) => new THREE.Color(hA).lerp(new THREE.Color(hB), f);
  const ln = (A, B) => A + (B - A) * f;
  return {
    zen: lc(a.zen,b.zen), mid: lc(a.mid,b.mid), hor: lc(a.hor,b.hor), gnd: lc(a.gnd,b.gnd),
    aI: ln(a.aI,b.aI), aC: lc(a.aC,b.aC), sI: ln(a.sI,b.sI), sC: lc(a.sC,b.sC),
    fog: lc(a.fog,b.fog), fd: ln(a.fd,b.fd),
  };
}

// ── Sky shader dome ───────────────────────────────────────────────────────
const skyUni = {
  uZenith:  { value: new THREE.Color(0x155aab) },
  uMidSky:  { value: new THREE.Color(0x3382cc) },
  uHorizon: { value: new THREE.Color(0x88c4f0) },
  uGround:  { value: new THREE.Color(0x204030) },
};
scene.add(new THREE.Mesh(
  new THREE.SphereGeometry(280, 32, 20),
  new THREE.ShaderMaterial({
    uniforms: skyUni,
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uZenith, uMidSky, uHorizon, uGround;
      varying vec3 vDir;
      void main() {
        float h = vDir.y;
        vec3 c;
        if (h > 0.18)      c = mix(uMidSky, uZenith, smoothstep(0.18, 0.95, h));
        else if (h > 0.0)  c = mix(uHorizon, uMidSky, smoothstep(0.0, 0.18, h));
        else               c = mix(uGround, uHorizon, smoothstep(-0.25, 0.0, h));
        gl_FragColor = vec4(c, 1.0);
      }`,
    side: THREE.BackSide,
    depthWrite: false,
  })
));

// ── Lights ────────────────────────────────────────────────────────────────
const ambLight  = new THREE.AmbientLight(0x7a9090, 1.4);
scene.add(ambLight);
const sunLight  = new THREE.DirectionalLight(0xfff8f0, 3.5);
sunLight.position.set(30, 80, -100);
scene.add(sunLight);
const moonLight = new THREE.DirectionalLight(0x8aaae8, 0.0);
moonLight.position.set(-30, 60, -100);
scene.add(moonLight);
const playerGlow = new THREE.PointLight(0x4fc3f7, 8, 14);
scene.add(playerGlow);
const invGlow = new THREE.PointLight(0xff4422, 3, 35);
invGlow.position.set(0, 4, -8);
scene.add(invGlow);
const cityGlow = new THREE.PointLight(0xffaa44, 0.0, 120);
cityGlow.position.set(0, 5, -60);
scene.add(cityGlow);

// ── Sun ───────────────────────────────────────────────────────────────────
const sunObj = new THREE.Group();
sunObj.add(new THREE.Mesh(new THREE.SphereGeometry(6, 20, 12),
  new THREE.MeshBasicMaterial({ color: 0xfffaee })));
for (const [r, op, col] of [[9,0.22,0xffee99],[14,0.10,0xffcc66],[21,0.045,0xffaa44]]) {
  const h = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 8),
    new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op }));
  sunObj.add(h);
}
sunObj.position.set(-40, 5, -220);
scene.add(sunObj);

// ── Moon ──────────────────────────────────────────────────────────────────
const moonMesh = new THREE.Mesh(
  new THREE.SphereGeometry(7, 20, 14),
  new THREE.MeshBasicMaterial({ color: 0xeef4ff })
);
// Moon glow halo
const moonGlow = new THREE.Mesh(
  new THREE.SphereGeometry(12, 16, 10),
  new THREE.MeshBasicMaterial({ color: 0xaabfe8, transparent: true, opacity: 0.10 })
);
moonMesh.add(moonGlow);
moonMesh.position.set(80, 60, -220);
scene.add(moonMesh);

// ── Stars ─────────────────────────────────────────────────────────────────
const starMesh = (() => {
  const N = 2200;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(2 * Math.random() - 1);
    const r     = 240 + Math.random() * 25;
    pos[i*3]   = r * Math.sin(phi) * Math.cos(theta);
    pos[i*3+1] = Math.abs(r * Math.cos(phi)) + 5;
    pos[i*3+2] = r * Math.sin(phi) * Math.sin(theta);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const m = new THREE.Points(geo,
    new THREE.PointsMaterial({ color: 0xddeeff, size: 0.65, sizeAttenuation: true, transparent: true, opacity: 0.0 })
  );
  scene.add(m);
  return m;
})();

// ── Clouds ────────────────────────────────────────────────────────────────
const cloudGroups = [];
function makeCloud(x, y, z, sc, windSpd) {
  const g = new THREE.Group();
  const blobs = [
    [0,0,0,1.0],[1.5,0.25,0.1,0.88],[-1.3,0.15,-0.15,0.82],
    [2.8,0.08,0.25,0.74],[-2.6,0.05,-0.1,0.70],
    [0.7,0.62,0.35,0.80],[-0.6,0.58,-0.22,0.75],[1.9,0.52,0.12,0.68],
    [0.3,-0.18,0.65,0.68],[-1.6,-0.14,-0.32,0.64],
    [4.0,-0.08,0.1,0.60],[-3.8,0.02,0.22,0.57],
    [0.5,0.92,0,0.65],[-0.8,0.85,0.2,0.60],
  ];
  blobs.forEach(([bx,by,bz,r]) => {
    const br = by > 0.5 ? 1.0 : (by > 0.1 ? 0.96 : 0.88);
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(r * sc, 7, 5),
      new THREE.MeshLambertMaterial({ color: new THREE.Color(br, br, br * 1.01), transparent: true, opacity: 0.90 })
    );
    m.position.set(bx * sc, by * sc, bz * sc);
    g.add(m);
  });
  g.position.set(x, y, z);
  g._wind = windSpd;
  scene.add(g);
  cloudGroups.push(g);
}
{
  const rnd = (a, b) => a + Math.random() * (b - a);
  makeCloud(  0, 38, -110, rnd(5,9),   0.012);
  makeCloud(-40, 42, -140, rnd(6,10),  0.008);
  makeCloud( 55, 40, -120, rnd(4,8),   0.015);
  makeCloud(-70, 46, -160, rnd(5,9),   0.010);
  makeCloud( 80, 39, -150, rnd(6,10),  0.007);
  makeCloud( 20, 52, -185, rnd(7,12),  0.009);
  makeCloud(-50, 36, -95,  rnd(4,7),   0.013);
  makeCloud( 30, 45, -85,  rnd(3,6),   0.016);
  makeCloud(-25, 58, -210, rnd(8,14),  0.006);
  makeCloud( 65, 54, -195, rnd(7,12),  0.008);
  makeCloud(-90, 41, -130, rnd(5,9),   0.011);
  makeCloud( 95, 36, -105, rnd(4,8),   0.014);
  makeCloud(-15, 48, -240, rnd(9,15),  0.005);
  makeCloud( 40, 43, -260, rnd(8,13),  0.006);
}

// ── Rain particles ────────────────────────────────────────────────────────
let rainMesh, rainGeo;
{
  const COUNT = 2000;
  const pos = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) {
    pos[i*3]   = (Math.random() - 0.5) * 260;
    pos[i*3+1] = Math.random() * 80 + 5;
    pos[i*3+2] = (Math.random() - 0.5) * 200 - 80;
  }
  rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  rainMesh = new THREE.Points(rainGeo, new THREE.PointsMaterial({
    color: 0x99bbdd, size: 0.25, transparent: true, opacity: 0.0, depthWrite: false
  }));
  scene.add(rainMesh);
}

// ── Night material registries ─────────────────────────────────────────────
const nightEmissiveMats = []; // MeshStandardMaterial: emissiveIntensity changes with night
const nightWindowMats   = []; // MeshBasicMaterial transparent windows: opacity changes

// ── Tokyo Bay water ───────────────────────────────────────────────────────
let waterMesh, waterMat;
{
  const plaza = new THREE.Mesh(
    new THREE.PlaneGeometry(38, 60),
    new THREE.MeshStandardMaterial({ color: 0x302820, roughness: 0.95 })
  );
  plaza.rotation.x = -Math.PI / 2; plaza.position.set(0, -1.0, 0);
  scene.add(plaza);

  waterMat = new THREE.MeshStandardMaterial({
    color: 0x1a3a5c, roughness: 0.10, metalness: 0.50,
    emissive: 0x0a1828, emissiveIntensity: 0.25,
  });
  waterMesh = new THREE.Mesh(new THREE.PlaneGeometry(1000, 600), waterMat);
  waterMesh.rotation.x = -Math.PI / 2; waterMesh.position.set(0, -9, -120);
  scene.add(waterMesh);

  const edge = new THREE.Mesh(
    new THREE.BoxGeometry(44, 0.5, 1.2),
    new THREE.MeshStandardMaterial({ color: 0x706050, roughness: 0.9 })
  );
  edge.position.set(0, -1.2, -21);
  scene.add(edge);
}

// ── Building skyline ──────────────────────────────────────────────────────
{
  const rnd = (a, b) => a + Math.random() * (b - a);
  const rndInt = (a, b) => Math.floor(rnd(a, b + 1));

  // Facade styles: 0=glass curtain wall, 1=concrete grid, 2=dark mirror glass, 3=striped
  function addBuilding(x, z, w, d, h) {
    const style = rndInt(0, 3);
    const isTall = h > 35;
    const isTower = h > 50;

    // ── Facade color by style ──────────────────────────────────────────────
    const facadeColor = [
      new THREE.Color().setHSL(0.58, 0.22, 0.42 + Math.random()*0.10), // glass blue-grey
      new THREE.Color().setHSL(0.08, 0.06, 0.52 + Math.random()*0.10), // concrete beige
      new THREE.Color().setHSL(0.60, 0.18, 0.18 + Math.random()*0.08), // dark mirror
      new THREE.Color().setHSL(0.55, 0.12, 0.38 + Math.random()*0.10), // slate grey
    ][style];

    const metalness = [0.55, 0.12, 0.80, 0.35][style];
    const roughness  = [0.20, 0.75, 0.05, 0.55][style];

    const bodyMat = new THREE.MeshStandardMaterial({
      color: facadeColor, roughness, metalness,
      emissive: new THREE.Color(0.08, 0.06, 0.02), emissiveIntensity: 0.0,
    });
    nightEmissiveMats.push(bodyMat);

    // ── Base podium (wider, shorter block at bottom) ───────────────────────
    const podH = Math.min(h * 0.18, 6);
    const podMat = new THREE.MeshStandardMaterial({
      color: facadeColor.clone().multiplyScalar(0.82),
      roughness: roughness + 0.15, metalness: metalness * 0.6,
    });
    const pod = new THREE.Mesh(new THREE.BoxGeometry(w * 1.12, podH, d * 1.12), podMat);
    pod.position.set(x, podH / 2 - 1.0, z);
    scene.add(pod);

    // ── Main tower body ────────────────────────────────────────────────────
    // Taller towers get a setback: lower 60% full width, upper 40% slightly narrower
    if (isTall) {
      const lowerH = h * 0.62, upperH = h * 0.38;
      const lw = w, ld = d;
      const uw = w * (0.78 + Math.random() * 0.12), ud = d * (0.78 + Math.random() * 0.12);

      const lower = new THREE.Mesh(new THREE.BoxGeometry(lw, lowerH, ld), bodyMat);
      lower.position.set(x, podH + lowerH / 2 - 1.0, z);
      scene.add(lower);

      const upper = new THREE.Mesh(new THREE.BoxGeometry(uw, upperH, ud), bodyMat.clone());
      upper.position.set(x, podH + lowerH + upperH / 2 - 1.0, z);
      scene.add(upper);
      nightEmissiveMats.push(upper.material);

      // Setback ledge
      const ledgeMat = new THREE.MeshStandardMaterial({ color: 0x888898, roughness: 0.6, metalness: 0.4 });
      const ledge = new THREE.Mesh(new THREE.BoxGeometry(lw + 0.3, 0.4, ld + 0.3), ledgeMat);
      ledge.position.set(x, podH + lowerH - 1.0, z);
      scene.add(ledge);

      // Very tall: second setback
      if (isTower && Math.random() > 0.4) {
        const t2H = upperH * 0.5;
        const t2w = uw * 0.70, t2d = ud * 0.70;
        const top2 = new THREE.Mesh(new THREE.BoxGeometry(t2w, t2H, t2d), bodyMat.clone());
        top2.position.set(x, podH + lowerH + upperH + t2H / 2 - 1.0, z);
        scene.add(top2);
        nightEmissiveMats.push(top2.material);
        const l2 = new THREE.Mesh(new THREE.BoxGeometry(uw + 0.2, 0.3, ud + 0.2), ledgeMat);
        l2.position.set(x, podH + lowerH + upperH - 1.0, z);
        scene.add(l2);
      }
    } else {
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bodyMat);
      body.position.set(x, podH + h / 2 - 1.0, z);
      scene.add(body);
    }

    // ── Horizontal floor bands (concrete grid style) ───────────────────────
    if (style === 1 || style === 3) {
      const bandMat = new THREE.MeshStandardMaterial({
        color: facadeColor.clone().multiplyScalar(0.70), roughness: 0.85, metalness: 0.05
      });
      const floors = Math.floor(h / 4);
      for (let f = 1; f < floors; f++) {
        const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.18, d + 0.1), bandMat);
        band.position.set(x, podH + (f / floors) * h - 1.0, z);
        scene.add(band);
      }
    }

    // ── Individual windows (grid pattern) ─────────────────────────────────
    const winCols = Math.max(2, Math.round(w / 1.6));
    const winRows = Math.max(3, Math.round(h / 2.8));
    const winW = (w / winCols) * 0.58, winH2 = (h / winRows) * 0.55;
    const colSpacing = w / winCols, rowSpacing = h / winRows;

    for (let row = 0; row < winRows; row++) {
      if (Math.random() < 0.08) continue; // skip a whole row occasionally
      for (let col = 0; col < winCols; col++) {
        if (Math.random() < 0.15) continue; // some windows dark
        const isBlue = Math.random() < 0.18;
        const wMat = new THREE.MeshBasicMaterial({
          color: isBlue ? 0x99ccff : (Math.random() < 0.3 ? 0xffdd99 : 0xffee77),
          transparent: true, opacity: 0.0,
        });
        const wx = x - w / 2 + (col + 0.5) * colSpacing;
        const wy = podH - 1.0 + (row + 0.5) * rowSpacing + rowSpacing * 0.5;
        const win = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH2), wMat);
        win.position.set(wx, wy, z - d / 2 - 0.05);
        scene.add(win);
        nightWindowMats.push(wMat);
      }
    }

    // ── Rooftop details ───────────────────────────────────────────────────
    const roofY = (isTall ? (h * 0.62 + h * 0.38) : h) + podH - 1.0;

    // Parapet
    const parapetMat = new THREE.MeshStandardMaterial({ color: 0x909098, roughness: 0.65, metalness: 0.3 });
    const parapet = new THREE.Mesh(new THREE.BoxGeometry(w + 0.15, 0.5, d + 0.15), parapetMat);
    parapet.position.set(x, roofY + 0.25, z);
    scene.add(parapet);

    // Mechanical penthouse
    if (isTall && Math.random() > 0.3) {
      const phW = w * rnd(0.30, 0.55), phD = d * rnd(0.35, 0.60), phH = rnd(2.0, 4.5);
      const phMat = new THREE.MeshStandardMaterial({
        color: facadeColor.clone().multiplyScalar(0.88), roughness: 0.6, metalness: 0.3
      });
      const ph = new THREE.Mesh(new THREE.BoxGeometry(phW, phH, phD), phMat);
      ph.position.set(x + rnd(-w*0.1, w*0.1), roofY + phH / 2 + 0.5, z);
      scene.add(ph);
    }

    // Antenna / spire on tall towers
    if (isTall) {
      const antH = isTower ? h * 0.14 : h * 0.08;
      const ant = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.10, antH, 6),
        new THREE.MeshStandardMaterial({ color: 0x999aaa, roughness: 0.4, metalness: 0.7 })
      );
      ant.position.set(x, roofY + antH / 2 + 0.5, z);
      scene.add(ant);
      // Red warning light
      const warnMat = new THREE.MeshBasicMaterial({ color: 0xff2200 });
      const warn = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), warnMat);
      warn.position.set(x, roofY + antH + 0.7, z);
      scene.add(warn);
      nightWindowMats.push(new THREE.MeshBasicMaterial({ color: 0xff2200, transparent: true, opacity: 0.0 }));
    }

    // Helipad on ultra-tall towers
    if (isTower && Math.random() > 0.55) {
      const hpMat = new THREE.MeshStandardMaterial({ color: 0x445566, roughness: 0.8 });
      const hp = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.38, w * 0.38, 0.22, 12), hpMat);
      hp.position.set(x, roofY + 0.55, z);
      scene.add(hp);
      // H marking
      const hMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const hBar = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.5, 0.25), hMat);
      hBar.rotation.x = -Math.PI / 2;
      hBar.position.set(x, roofY + 0.67, z);
      scene.add(hBar);
    }
  }

  for (let z = -32; z >= -78; z -= rnd(4, 9)) {
    addBuilding(rnd(-16,-32), z, rnd(3,7), rnd(3,6), rnd(18,55));
    if (Math.random()>0.5) addBuilding(rnd(-28,-44), z+rnd(-2,2), rnd(4,9), rnd(4,7), rnd(10,32));
  }
  for (let z = -32; z >= -78; z -= rnd(4, 9)) {
    addBuilding(rnd(16,32), z, rnd(3,7), rnd(3,6), rnd(18,55));
    if (Math.random()>0.5) addBuilding(rnd(28,44), z+rnd(-2,2), rnd(4,9), rnd(4,7), rnd(10,32));
  }
  for (let x = -30; x <= 30; x += rnd(5, 12)) {
    addBuilding(x, rnd(-60,-85), rnd(4,13), rnd(5,10), rnd(22,68));
  }

  // Construction cranes
  function addCrane(x, z) {
    const cMat = new THREE.MeshStandardMaterial({ color: 0xcc3300, roughness: 0.7 });
    const g = new THREE.Group();
    const mast = new THREE.Mesh(new THREE.BoxGeometry(0.5, 28, 0.5), cMat);
    mast.position.y = 14; g.add(mast);
    const jib = new THREE.Mesh(new THREE.BoxGeometry(22, 0.4, 0.4), cMat);
    jib.position.set(5, 28.2, 0); g.add(jib);
    const cjib = new THREE.Mesh(new THREE.BoxGeometry(8, 0.35, 0.35), cMat);
    cjib.position.set(-8, 27.4, 0); g.add(cjib);
    const wl = new THREE.Mesh(new THREE.SphereGeometry(0.18, 4, 3),
      new THREE.MeshBasicMaterial({ color: 0xff3300 }));
    wl.position.set(15, 28.5, 0); g.add(wl);
    g.position.set(x, -1, z); scene.add(g);
  }
  addCrane( 18, -38);
  addCrane( 25, -45);
  addCrane(-20, -42);
}

// ── Rainbow Bridge ────────────────────────────────────────────────────────
let bridgeLightMats = [];
{
  const g = new THREE.Group();
  const towerMat = new THREE.MeshStandardMaterial({
    color: 0xbcb8ae, roughness: 0.65, metalness: 0.28,
    emissive: 0x080806, emissiveIntensity: 0.0,
  });
  const deckMat = new THREE.MeshStandardMaterial({ color: 0xa4a098, roughness: 0.82, metalness: 0.08 });
  nightEmissiveMats.push(towerMat);

  // Road deck (two levels)
  g.add(new THREE.Mesh(new THREE.BoxGeometry(100, 0.95, 6.5), deckMat));
  const upper = new THREE.Mesh(new THREE.BoxGeometry(100, 0.60, 5), deckMat);
  upper.position.y = 1.9; g.add(upper);

  // Towers
  for (const tx of [-24, 24]) {
    for (const [lx, lz] of [[-0.85,-2.3],[0.85,-2.3],[-0.85,2.3],[0.85,2.3]]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(1.0, 34, 1.0), towerMat);
      col.position.set(tx+lx, 17, lz); g.add(col);
    }
    for (const ty of [8, 17, 25, 30]) {
      const cb = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.75, 6.0), towerMat);
      cb.position.set(tx, ty, 0); g.add(cb);
    }
    const cap = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1.0, 6.5), towerMat);
    cap.position.set(tx, 34.5, 0); g.add(cap);
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.30, 5.8, 8), towerMat);
    spire.position.set(tx, 37.5, 0); g.add(spire);
    const wl = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 4),
      new THREE.MeshBasicMaterial({ color: 0xff2200 }));
    wl.position.set(tx, 40.5, 0); g.add(wl);
  }

  // Main suspension cables
  const cablePts = [];
  for (let t = 0; t <= 1; t += 0.015) {
    const x = -48 + t * 96;
    const dt = t * 2 - 1;
    cablePts.push(new THREE.Vector3(x, 34 * (1 - dt * dt * 0.62), 0));
  }
  const cMat = new THREE.LineBasicMaterial({ color: 0xd4d0c8 });
  for (const zOff of [-2.6, 2.6]) {
    const pts = cablePts.map(p => new THREE.Vector3(p.x, p.y, zOff));
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), cMat.clone()));
  }

  // Suspenders
  for (let x = -46; x <= 46; x += 4.2) {
    const dt = x / 48;
    const cY = 34 * (1 - dt * dt * 0.62);
    const s = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, Math.max(0.2, cY - 0.5), 0.07),
      new THREE.MeshBasicMaterial({ color: 0xc8c4bc })
    );
    s.position.set(x, (cY + 0.5) / 2, 0); g.add(s);
  }

  // Rainbow lights along cables (night only)
  for (const zOff of [-2.6, 2.6]) {
    for (let i = 0; i <= 28; i++) {
      const t = i / 28;
      const x = -46 + t * 92;
      const dt = x / 48;
      const cY = 34 * (1 - dt * dt * 0.62);
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(t, 1.0, 0.55),
        transparent: true, opacity: 0.0,
      });
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.24, 5, 3), mat);
      l.position.set(x, cY, zOff); g.add(l);
      bridgeLightMats.push(mat);
    }
  }

  g.position.set(5, -17, -88);
  g.rotation.y = 0.16;
  scene.add(g);
}

// ── Tokyo Tower ───────────────────────────────────────────────────────────
{
  const tt = new THREE.Group();
  const redMat = new THREE.MeshStandardMaterial({
    color: 0xcc3300, roughness: 0.62, metalness: 0.22,
    emissive: 0x441100, emissiveIntensity: 0.0,
  });
  const whiteMat = new THREE.MeshStandardMaterial({
    color: 0xdddccc, roughness: 0.75, metalness: 0.10,
    emissive: 0x444444, emissiveIntensity: 0.0,
  });
  nightEmissiveMats.push(redMat, whiteMat);

  for (const [ax, az] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    for (let i = 0; i < 12; i++) {
      const t = i / 12;
      const sz = 0.14 + (1 - t) * 0.68;
      const isW = (i===3||i===6||i===9);
      const seg = new THREE.Mesh(new THREE.BoxGeometry(sz*0.9, 4.5, sz*0.9), isW ? whiteMat : redMat);
      seg.position.set(ax*(1-t)*4.5, i*4.5+2.25, az*(1-t)*4.5);
      tt.add(seg);
    }
  }

  for (const [hy, sz] of [[28, 5.2], [47, 3.8]]) {
    const plat = new THREE.Mesh(new THREE.BoxGeometry(sz, 1.3, sz), whiteMat);
    plat.position.y = hy; tt.add(plat);
    const wMat = new THREE.MeshBasicMaterial({ color: 0x88aacc, transparent: true, opacity: 0.7 });
    for (let k = 0; k < 4; k++) {
      const ang = k * Math.PI / 2;
      const w = new THREE.Mesh(new THREE.PlaneGeometry(sz*0.6, 0.8), wMat.clone());
      w.position.set(Math.cos(ang)*sz*0.52, hy, Math.sin(ang)*sz*0.52);
      w.rotation.y = ang; tt.add(w);
    }
  }

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.13, 22, 8), redMat.clone());
  mast.position.y = 57; tt.add(mast);
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.06, 6, 6), redMat.clone());
  tip.position.y = 70; tt.add(tip);

  const warnMat = new THREE.MeshBasicMaterial({ color: 0xff3300 });
  for (const hy of [40, 58, 66, 72]) {
    const wl = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 4), warnMat.clone());
    wl.position.y = hy; tt.add(wl);
  }

  tt.position.set(-55, -17, -63); tt.scale.setScalar(0.72);
  scene.add(tt);
}

// ── Persistence ───────────────────────────────────────────────────────────
let hiscore    = parseInt(localStorage.getItem('legacyInvaderHi') || '0', 10);
let bgmEnabled = localStorage.getItem('legacyBGM') === '1';

// ── Audio ─────────────────────────────────────────────────────────────────
let _ac;
function ac() { return _ac || (_ac = new (window.AudioContext || window.webkitAudioContext)()); }
function beep(freq, dur, type = 'square', vol = 0.07) {
  try {
    const o = ac().createOscillator(), g = ac().createGain();
    o.connect(g); g.connect(ac().destination);
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, ac().currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac().currentTime + dur);
    o.start(); o.stop(ac().currentTime + dur);
  } catch(e) {}
}

const BGM_SEQ = [220, 261, 294, 349, 392, 349, 294, 261];
let bgmIdx = 0, bgmInterval = null;
function startBGM() {
  if (bgmInterval) return;
  bgmInterval = setInterval(() => {
    if (!bgmEnabled || state !== 'playing') return;
    beep(BGM_SEQ[bgmIdx++ % BGM_SEQ.length], 0.18, 'triangle', 0.035);
  }, 220);
}
function stopBGM() { if (bgmInterval) { clearInterval(bgmInterval); bgmInterval = null; } }
function toggleBGM() {
  bgmEnabled = !bgmEnabled;
  localStorage.setItem('legacyBGM', bgmEnabled ? '1' : '0');
  const btn = document.getElementById('btn-mute');
  if (btn) btn.textContent = bgmEnabled ? '🔊' : '🔇';
  if (bgmEnabled) startBGM(); else stopBGM();
}

// ── HUD ───────────────────────────────────────────────────────────────────
const elScore    = document.getElementById('hud-score');
const elHi       = document.getElementById('hud-hi');
const elLives    = document.getElementById('hud-lives');
const elLevel    = document.getElementById('hud-level');
const elPU       = document.getElementById('hud-pu');
const hudEl      = document.getElementById('hud');
const legendEl   = document.getElementById('item-legend');

// ── Item inventory ────────────────────────────────────────────────────────
// Counts persist across waves; life is instant so not stored
const inv = { rapid: 0, triple: 0, bomb: 0 };

// Per-stack effects:
//   rapid:  ×1→ 3shot cd5  ×2→ 5shot cd3  ×3→ 7shot cd2
//   triple: ×1→ 3-way      ×2→ 5-way       ×3→ 7-way
//   bomb:   ×1→ front row  ×2→ front 2rows  ×3→ all enemies
const PU_SLOT_ICONS  = { rapid: '⚡', triple: '≡', life: '♥', bomb: '✸' };
const PU_BAR_COLORS  = { rapid: '#ffcc00', triple: '#00e5ff', life: '#ff4d8b', bomb: '#bf5fff' };
// Legend descriptions (left panel)
const PU_DESC = {
  rapid:  ['連射UP', '超連射', '超超連射', '弾幕', '神連射'],
  triple: ['3方向弾', '5方向弾', '7方向弾', '9方向弾', '11方向弾'],
  life:   ['HP回復', '', '', '', ''],
  bomb:   ['前列爆破', '前2列爆破', '全滅爆破', '前列爆破', '前列爆破'],
};
let puSlotEls = {};

function buildPUSlots() {
  elPU.innerHTML = '';
  puSlotEls = {};
  for (const type of ['rapid', 'triple', 'bomb']) {
    const slot = document.createElement('div');
    slot.className = 'pu-slot';
    slot.style.display = 'none';
    slot.innerHTML =
      `<span class="pu-icon">${PU_SLOT_ICONS[type]}</span>` +
      `<span class="pu-count"></span>` +
      `<div class="pu-pips"></div>`;
    elPU.appendChild(slot);
    puSlotEls[type] = { slot, count: slot.querySelector('.pu-count'), pips: slot.querySelector('.pu-pips') };
  }
}

function updateHUD() {
  elScore.textContent = String(score).padStart(6, '0');
  elHi.textContent    = 'HI ' + String(hiscore).padStart(6, '0');
  elLives.textContent = '♥'.repeat(Math.max(0, lives));
  elLevel.textContent = `LV${level}`;
  for (const type of ['rapid', 'triple', 'bomb']) {
    const n = inv[type];
    const el = puSlotEls[type];
    if (!el) continue;
    if (n > 0) {
      el.slot.style.display = 'flex';
      el.count.textContent  = `×${n}`;
      el.count.style.color  = PU_BAR_COLORS[type];
      // pip dots: up to 3, filled = current count
      el.pips.innerHTML = [1,2,3,4,5].map(i =>
        `<span class="pip${i<=n?' pip-on':''}" style="${i<=n?`background:${PU_BAR_COLORS[type]};box-shadow:0 0 5px ${PU_BAR_COLORS[type]}`:''}""></span>`
      ).join('');
    } else {
      el.slot.style.display = 'none';
    }
  }
  // Update left legend counts + desc
  for (const type of ['rapid','triple','bomb']) {
    const cntEl  = document.getElementById(`legend-count-${type}`);
    const dscEl  = document.getElementById(`legend-desc-${type}`);
    const n = inv[type];
    if (cntEl) cntEl.textContent = n > 0 ? `×${n}` : '';
    if (dscEl) dscEl.textContent = PU_DESC[type][Math.min(2, Math.max(0, n - 1))] || PU_DESC[type][0];
  }
}
function saveHi() {
  if (score > hiscore) { hiscore = score; localStorage.setItem('legacyInvaderHi', hiscore); }
  updateHUD();
}

// ── Overlay ───────────────────────────────────────────────────────────────
const overlayEl   = document.getElementById('overlay');
const overlayT    = document.getElementById('overlay-title');
const overlaySub  = document.getElementById('overlay-sub');
const overlayHint = document.getElementById('overlay-hint');
function showOverlay(title, sub, hint) {
  overlayEl.classList.remove('hidden');
  overlayT.innerHTML = title; overlaySub.textContent = sub; overlayHint.textContent = hint;
}
function hideOverlay() { overlayEl.classList.add('hidden'); }

// ── Wave transition ───────────────────────────────────────────────────────
const transEl  = document.getElementById('trans-overlay');
const transMsg = document.getElementById('trans-msg');
let transState = 0, transAlpha = 0, transHold = 0, transText = '', transCallback = null;
function startTransition(text, cb) {
  transState = 1; transAlpha = 0; transHold = 0; transText = text; transCallback = cb;
}
function updateTransition() {
  if (transState === 0) return;
  if (transState === 1) { transAlpha = Math.min(1, transAlpha + 0.04); if (transAlpha >= 1) transState = 2; }
  else if (transState === 2) { if (++transHold >= 50) { transState = 3; if (transCallback) transCallback(); } }
  else { transAlpha = Math.max(0, transAlpha - 0.04); if (transAlpha <= 0) transState = 0; }
  transEl.style.opacity = transAlpha;
  transMsg.textContent  = transAlpha > 0.55 ? transText : '';
}

// ── Hit effects (no screen flash) ────────────────────────────────────────
const sweepEl = document.getElementById('sweep');
let vigTimer = 0;

function triggerFovPulse(amount) {
  fovTarget = Math.max(50, 62 - amount);
}
function triggerSweep() {
  if (!sweepEl) return;
  sweepEl.classList.remove('running');
  void sweepEl.offsetWidth;
  sweepEl.classList.add('running');
}
function triggerVignette(_color, _strength) { /* removed — no more flashing */ }
function triggerFlash(_color, _strength)    { /* removed — no more flashing */ }

// ── Materials ─────────────────────────────────────────────────────────────
const C  = { A: 0xff6b6b, B: 0xffd93d, C: 0x6bcb77 };
const E  = { A: 0xdd1111, B: 0xaa6600, C: 0x117722 };
const CH = { A: '#ff6b6b', B: '#ffd93d', C: '#6bcb77' };
function invMat(type) {
  return new THREE.MeshStandardMaterial({ color: C[type], emissive: E[type], emissiveIntensity: 1.6, roughness: 0.3, metalness: 0.2 });
}

// ── Invader meshes ────────────────────────────────────────────────────────
function makeInvader(type) {
  const g = new THREE.Group();
  const m = invMat(type);
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  if (type === 'A') {
    g.add(new THREE.Mesh(box(0.72, 0.5, 0.32), m));
    [-0.22, 0.22].forEach(x => {
      const ant = new THREE.Mesh(box(0.08, 0.32, 0.08), m.clone()); ant.position.set(x, 0.41, 0); g.add(ant);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), m.clone()); tip.position.set(x, 0.62, 0); g.add(tip);
    });
    [-0.46, 0.46].forEach(x => { const c = new THREE.Mesh(box(0.18,0.18,0.18), m.clone()); c.position.set(x,-0.3,0); g.add(c); });
  } else if (type === 'B') {
    g.add(new THREE.Mesh(box(0.92, 0.42, 0.32), m));
    [-0.64,0.64].forEach(x => { const arm=new THREE.Mesh(box(0.22,0.15,0.15),m.clone()); arm.position.set(x,0.04,0); g.add(arm); });
    [-0.3,0,0.3].forEach(x => { const leg=new THREE.Mesh(box(0.1,0.24,0.1),m.clone()); leg.position.set(x,-0.32,0); g.add(leg); });
  } else {
    g.add(new THREE.Mesh(box(0.88, 0.38, 0.32), m));
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.28,8,6), m.clone()); top.scale.set(1,0.55,0.65); top.position.set(0,0.24,0); g.add(top);
    [-0.34,-0.12,0.12,0.34].forEach(x => { const leg=new THREE.Mesh(box(0.09,0.22,0.09),m.clone()); leg.position.set(x,-0.28,0); g.add(leg); });
  }
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x050510 });
  [-0.18,0.18].forEach(x => { const eye=new THREE.Mesh(box(0.1,0.1,0.08),eyeMat); eye.position.set(x,0.06,0.18); g.add(eye); });
  return g;
}

// ── Player mesh ───────────────────────────────────────────────────────────
const playerMat = new THREE.MeshStandardMaterial({ color: 0x4fc3f7, emissive: 0x0055bb, emissiveIntensity: 2.2, roughness: 0.2, metalness: 0.5 });
const playerMesh = (() => {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.24, 2.2), playerMat));
  const wing = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.1, 1.0), playerMat.clone()); wing.position.set(0,-0.05,0.35); g.add(wing);
  const cannonMat = new THREE.MeshStandardMaterial({ color: 0xaaaaff, emissive: 0x8888ff, emissiveIntensity: 2.5 });
  const cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.09,1.1,8), cannonMat); cannon.rotation.x=Math.PI/2; cannon.position.set(0,0.22,-0.6); g.add(cannon);
  const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.2,0.14,0.22,8), new THREE.MeshBasicMaterial({ color: 0x4fc3f7 })); eng.position.set(0,0,1.1); g.add(eng);
  return g;
})();
playerMesh.position.set(0, 0.5, 12);
scene.add(playerMesh);

// ── Aim reticle ───────────────────────────────────────────────────────────
const reticleSp = (() => {
  const c = document.createElement('canvas'); c.width = 80; c.height = 80;
  const cx = c.getContext('2d');
  cx.strokeStyle = '#ff6600'; cx.lineWidth = 2.5;
  cx.beginPath(); cx.arc(40, 40, 33, 0, Math.PI * 2); cx.stroke();
  for (let a = 0; a < 4; a++) {
    const ang = a * Math.PI / 2 + Math.PI / 4;
    cx.beginPath();
    cx.moveTo(40 + Math.cos(ang)*20, 40 + Math.sin(ang)*20);
    cx.lineTo(40 + Math.cos(ang)*33, 40 + Math.sin(ang)*33);
    cx.stroke();
  }
  const g2 = 7, l = 15;
  cx.beginPath(); cx.moveTo(40-g2-l,40); cx.lineTo(40-g2,40); cx.stroke();
  cx.beginPath(); cx.moveTo(40+g2,40); cx.lineTo(40+g2+l,40); cx.stroke();
  cx.beginPath(); cx.moveTo(40,40-g2-l); cx.lineTo(40,40-g2); cx.stroke();
  cx.beginPath(); cx.moveTo(40,40+g2); cx.lineTo(40,40+g2+l); cx.stroke();
  cx.fillStyle = '#ff6600'; cx.beginPath(); cx.arc(40,40,2.5,0,Math.PI*2); cx.fill();
  const tex = new THREE.CanvasTexture(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, opacity: 0 }));
  sp.scale.set(2.0, 2.0, 1);
  scene.add(sp);
  return sp;
})();

// Shared aim target (updated each frame, used by reticle + bullets)
let aimTarget = null;

// ── Game state ────────────────────────────────────────────────────────────
let state = 'title', score = 0, lives = 3, level = 1, frame = 0;
let waveCleared = false, playerX = 0, playerY = 0.5, playerVX = 0;
let shootCooldown = 0;
let streak = 0, streakTimer = 0;
let shakeTimer = 0, shakeAmt = 0;

let   PLAYER_LIMIT  = 10; // updated dynamically in initGrid
const PLAYER_SPEED  = 0.18, PLAYER_Z = 12;
const PLAYER_Y_MIN  = 0.3, PLAYER_Y_MAX  = 5.5,  PLAYER_Y_SPEED = 0.13;
// Grid size grows with level (set in initGrid)
let gridRows = 5, gridCols = 11;
let invBoundX = 9.5; // turn-around X, updated in initGrid

// ── Grid ──────────────────────────────────────────────────────────────────
let grid = [], invDir = 1, invStepX = 0.10, invAdvZ = 0.32;
let invTick = 52, invTimer = 52;

function initGrid() {
  grid.forEach(inv => scene.remove(inv.mesh));
  grid = [];
  dying.forEach(d => scene.remove(d.mesh)); dying = [];

  // Grow grid each level: +1 col every 2 levels (max 23), +1 row every 3 levels (max 12)
  gridCols = Math.min(23, 11 + Math.floor((level - 1) / 2));
  gridRows = Math.min(12,  5 + Math.floor((level - 1) / 3));

  const totalW = gridCols * 1.82;
  const cellW = totalW / gridCols, cellH = 1.5;
  for (let r = 0; r < gridRows; r++) {
    for (let c = 0; c < gridCols; c++) {
      const type = r === 0 ? 'A' : r < 3 ? 'B' : 'C';
      const mesh = makeInvader(type);
      const x = (c - (gridCols-1)/2) * cellW;
      const y = 1.5 + (gridRows-1-r) * cellH;
      const z = -12;
      mesh.position.set(x, y, z);
      scene.add(mesh);
      grid.push({ mesh, row: r, col: c, type, alive: true, x, y, z });
    }
  }
  invDir = 1;
  invStepX = 0.09;   // speed fixed regardless of level
  invAdvZ  = 0.28;
  invTick  = 52;
  invTimer = invTick;
  waveCleared = false;
  eBullets.forEach(b => scene.remove(b.mesh)); eBullets = [];
  eShootTimer = 80;

  // Camera pulls back as grid grows
  const extraRows = gridRows - 5, extraCols = gridCols - 11;
  fovTarget = 62 + extraCols * 1.2 + extraRows * 1.0;
  camera.position.y = 16 + extraRows * 1.8 + extraCols * 0.8;

  // Sync enemy turn-around and player limit to grid half-width + margin
  const halfGrid = (totalW / 2) + 1.5;
  invBoundX   = halfGrid;
  PLAYER_LIMIT = halfGrid + 1.0;
}

// ── Barriers ──────────────────────────────────────────────────────────────
let barriers = [];
function initBarriers() {
  barriers.forEach(b => scene.remove(b.mesh)); barriers = [];
  const barMat = new THREE.MeshStandardMaterial({ color: 0x50dc78, emissive: 0x116622, emissiveIntensity: 1.0, transparent: true });
  const count = 4, spacing = 18 / (count + 1);
  for (let i = 0; i < count; i++) {
    const bx = -9 + (i+1) * spacing;
    [[-1,0],[0,0],[1,0],[-1,1],[1,1]].forEach(([dc, dr]) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.85, 0.5), barMat.clone());
      mesh.position.set(bx + dc*0.9, 0.5 + dr*0.9, 5.5);
      scene.add(mesh);
      barriers.push({ mesh, hp: 4, x: bx+dc*0.9, y: 0.5+dr*0.9, z: 5.5 });
    });
  }
}

// ── Bullets & dying ───────────────────────────────────────────────────────
let bullets = [], eBullets = [], eShootTimer = 80, dying = [];
const PU_TYPES = ['rapid', 'triple', 'life', 'bomb'];
const PU_COL   = { rapid: 0xffcc00, triple: 0x00e5ff, life: 0xff4d8b, bomb: 0xbf5fff };
const PU_CHX   = { rapid: '#ffcc00', triple: '#00e5ff', life: '#ff4d8b', bomb: '#bf5fff' };

function spawnBullets() {
  const hasTriple = inv.triple > 0;
  const hasRapid  = inv.rapid  > 0;
  const bcolor = hasTriple ? 0x00e5ff : hasRapid ? 0xffcc00 : 0xffffff;
  const mat = new THREE.MeshBasicMaterial({ color: bcolor });
  const bz = playerMesh.position.z - 1.2;
  const by = playerMesh.position.y + 0.3;
  const targetZ = aimTarget ? aimTarget.z - 0.5 : -12;
  const targetY = aimTarget ? aimTarget.y : 4.5;
  const dz = targetZ - bz, dy = targetY - by;
  const spd = 0.58, len = Math.sqrt(dz*dz + dy*dy);
  const bvz = spd * (dz / len), bvy = spd * (dy / len);
  const make = (x, vx) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.7, 6), mat.clone());
    m.rotation.x = Math.PI/2; m.position.set(x, by, bz);
    scene.add(m);
    bullets.push({ mesh: m, x, y: by, z: bz, vz: bvz, vy: bvy, vx });
  };
  // triple: ×1=3way ×2=5way ×3=7way ×4=9way ×5=11way
  const ways = hasTriple ? [3,5,7,9,11][Math.min(4, inv.triple - 1)] : 1;
  if (ways > 1) {
    const spread = 0.55;
    const half = (ways - 1) / 2;
    for (let i = 0; i < ways; i++) {
      const offset = (i - half) * spread;
      make(playerX + offset, offset * 0.015);
    }
  } else {
    make(playerX, 0);
  }
  beep(hasTriple ? 700 : 900, 0.07);
}

function spawnEBullet(inv) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff3300 }));
  m.position.set(inv.x, inv.y, inv.z + 0.5);
  scene.add(m);
  eBullets.push({ mesh: m, x: inv.x, y: inv.y, z: inv.z+0.5, vz: 0.20 });
  beep(160, 0.13, 'sawtooth', 0.05);
}

// ── Dying animation ───────────────────────────────────────────────────────
function killInvader(inv) {
  inv.alive = false;
  dying.push({ mesh: inv.mesh, life: 1.0, vx: (Math.random()-0.5)*0.14, vy: 0.06+Math.random()*0.07, vz: -(0.03+Math.random()*0.04) });
}
function updateDying() {
  for (let i = dying.length-1; i >= 0; i--) {
    const d = dying[i];
    d.life -= 0.052; d.mesh.position.x += d.vx; d.mesh.position.y += d.vy; d.mesh.position.z += d.vz;
    d.mesh.rotation.x += 0.18; d.mesh.rotation.y += 0.12; d.vy -= 0.005;
    d.mesh.traverse(c => { if (c.material) { c.material.transparent = true; c.material.opacity = Math.max(0, d.life); } });
    if (d.life <= 0) { scene.remove(d.mesh); dying.splice(i, 1); }
  }
}

// ── Particles ─────────────────────────────────────────────────────────────
let pSystems = [];
function spawnExplosion(x, y, z, color, big) {
  const N = big ? 48 : 32, pos = new Float32Array(N*3), vels = [];
  for (let i = 0; i < N; i++) {
    pos[i*3]=x; pos[i*3+1]=y; pos[i*3+2]=z;
    const a=Math.random()*Math.PI*2, b=(Math.random()-0.5)*Math.PI, s=(big?0.08:0.05)+Math.random()*(big?0.22:0.17);
    vels.push({ vx:Math.cos(a)*Math.cos(b)*s, vy:Math.sin(b)*s+0.03, vz:Math.sin(a)*Math.cos(b)*s });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size: big?0.55:0.32, sizeAttenuation:true, transparent:true }));
  scene.add(pts);
  pSystems.push({ pts, geo, vels, posArr:pos, life:1.0 });
}
function updateParticles() {
  for (let i = pSystems.length-1; i >= 0; i--) {
    const p = pSystems[i]; p.life -= 0.022;
    if (p.life <= 0) { scene.remove(p.pts); pSystems.splice(i,1); continue; }
    p.pts.material.opacity = p.life;
    for (let j=0; j<p.vels.length; j++) {
      p.posArr[j*3]   += p.vels[j].vx; p.posArr[j*3+1] += p.vels[j].vy; p.posArr[j*3+2] += p.vels[j].vz;
      p.vels[j].vy -= 0.0008;
    }
    p.geo.getAttribute('position').needsUpdate = true;
  }
}

// ── Power-ups ─────────────────────────────────────────────────────────────
let powerUps = [];
let rings = [];

function makePUMesh(type) {
  const col = PU_COL[type];
  const mat = new THREE.MeshStandardMaterial({
    color: col, emissive: col, emissiveIntensity: 2.5,
    transparent: true, opacity: 0.95,
  });
  let geo;
  if (type === 'rapid') {
    geo = new THREE.OctahedronGeometry(0.55);
  } else if (type === 'triple') {
    geo = new THREE.TorusGeometry(0.45, 0.15, 8, 16);
  } else if (type === 'bomb') {
    geo = new THREE.IcosahedronGeometry(0.55);
  } else {
    // life — heart-style group: main sphere + 2 small spheres
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), mat));
    const s1 = new THREE.Mesh(new THREE.SphereGeometry(0.28, 6, 4), mat.clone());
    s1.position.set(-0.3, 0.35, 0); g.add(s1);
    const s2 = new THREE.Mesh(new THREE.SphereGeometry(0.28, 6, 4), mat.clone());
    s2.position.set(0.3, 0.35, 0); g.add(s2);
    return g;
  }
  return new THREE.Mesh(geo, mat);
}

function spawnRing(x, y, z, color) {
  const mat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.8, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.8, 24), mat);
  mesh.position.set(x, y, z);
  mesh.rotation.x = -Math.PI / 2;
  scene.add(mesh);
  rings.push({ mesh, mat, life: 1.0 });
}

function updateRings() {
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i];
    r.life -= 0.032;
    const s = 1 + (1 - r.life) * 6;
    r.mesh.scale.setScalar(s);
    r.mat.opacity = Math.max(0, r.life * 0.8);
    if (r.life <= 0) { scene.remove(r.mesh); rings.splice(i, 1); }
  }
}

function maybeDrop(x, y, z) {
  if (Math.random() > 0.18) return;
  const type = PU_TYPES[Math.floor(Math.random()*4)];
  const m = makePUMesh(type);
  m.position.set(x, y, z); scene.add(m);
  powerUps.push({ mesh:m, type, x, y, z, vz:0.045, age:0 });
  spawnFloat(x, y+1.2, z, {rapid:'⚡',triple:'≡',life:'♥',bomb:'✸'}[type], PU_CHX[type]);
  spawnRing(x, y, z, PU_COL[type]);
}

function collectPU(type, x, y, z) {
  spawnExplosion(x, y, z, PU_COL[type], true);
  beep(660,0.06); beep(880,0.1); beep(1100,0.15);
  // Larger, faster float text on collect
  const c2 = document.createElement('canvas'); c2.width = 256; c2.height = 64;
  const cx2 = c2.getContext('2d');
  cx2.fillStyle = PU_CHX[type]; cx2.font = 'bold 30px monospace';
  cx2.textAlign = 'center'; cx2.textBaseline = 'middle';
  cx2.fillText({rapid:'⚡RAPID',triple:'≡TRIPLE',life:'♥LIFE',bomb:'✸BOMB'}[type], 128, 32);
  const tex = new THREE.CanvasTexture(c2);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sp.scale.set(2.8 * 1.5, 0.75 * 1.5, 1); sp.position.set(x, y + 1.2, z);
  scene.add(sp); floats.push({ sp, mat: sp.material, life: 1.0, vy: 0.06 });
  triggerFovPulse(8);
  spawnRing(x, y, z, PU_COL[type]);
  if (type === 'life') {
    lives = Math.min(5, lives + 1);
  } else if (type === 'bomb') {
    // bomb: use immediately, power scales with count
    const bombLv = inv.bomb + 1; // +1 = current pickup not yet counted
    const alive  = grid.filter(i => i.alive).sort((a, b) => b.row - a.row);
    const maxR   = alive.length ? alive[0].row : 0;
    const rows   = bombLv >= 3 ? 999 : bombLv === 2 ? 2 : 1;
    grid.forEach(gi => {
      if (!gi.alive || gi.row < maxR - rows + 1) return;
      score += (gi.type==='A'?30:gi.type==='B'?20:10) * mult();
      spawnExplosion(gi.x, gi.y, gi.z, new THREE.Color(CH[gi.type]).getHex(), false);
      killInvader(gi);
    });
    triggerSweep(); saveHi(); shakeTimer = 18; shakeAmt = 0.25; beep(100, 0.4, 'sawtooth');
    // bomb doesn't stack into inventory — it fires immediately
  } else {
    // rapid / triple: stack up to 5
    inv[type] = Math.min(5, inv[type] + 1);
  }
  updateHUD();
}

// ── UFO ───────────────────────────────────────────────────────────────────
const UFO_PTS=[50,100,150,200,300];
let ufo=null, ufoTimer=1200+Math.floor(Math.random()*1200);

function spawnUFO() {
  const dir = Math.random()<0.5 ? 1 : -1;
  const g = new THREE.Group();

  // Main saucer body — wider, layered
  const bMat = new THREE.MeshStandardMaterial({color:0xcc1144,emissive:0xff0044,emissiveIntensity:2.2,metalness:0.7,roughness:0.2});
  const body = new THREE.Mesh(new THREE.SphereGeometry(1.2,24,10),bMat);
  body.scale.set(1,0.28,1); g.add(body);

  // Mid ring
  const ringMat = new THREE.MeshStandardMaterial({color:0xff2266,emissive:0xff0055,emissiveIntensity:1.8,metalness:0.8,roughness:0.1});
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1,0.18,8,24),ringMat);
  ring.rotation.x=Math.PI/2; g.add(ring);

  // Glass dome with glow
  const domeMat = new THREE.MeshStandardMaterial({color:0xaaeeff,emissive:0x88ccff,emissiveIntensity:1.5,transparent:true,opacity:0.72,metalness:0.1,roughness:0.05});
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.68,16,10),domeMat);
  dome.position.y=0.26; g.add(dome);

  // Rotating light ring (8 orbs)
  const lightRingGroup = new THREE.Group();
  for(let i=0;i<8;i++){
    const a=(i/8)*Math.PI*2;
    const col = [0xff4400,0xffaa00,0x00ffcc,0xff00aa][i%4];
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.13,8,6),
      new THREE.MeshBasicMaterial({color:col}));
    orb.position.set(Math.cos(a)*1.05,0,Math.sin(a)*1.05);
    lightRingGroup.add(orb);
  }
  g.add(lightRingGroup);

  // Bottom beam emitter
  const beamMat = new THREE.MeshBasicMaterial({color:0x44ffcc,transparent:true,opacity:0.0});
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.5,2.5,12,1,true),beamMat);
  beam.position.y=-1.3; g.add(beam);

  // Entry: start high, descend into position
  const startX = dir===1 ? -18 : 18;
  g.position.set(startX, 14, -5); scene.add(g);

  ufo = {
    mesh:g, dir, x:startX, y:14, z:-5,
    speed:0.14, pts:UFO_PTS[Math.floor(Math.random()*5)],
    lightRing:lightRingGroup, beam, beamMat,
    phase:'enter', enterT:0,  // 'enter'→'fly'
    sineT: 0,
  };
  // Eerie entry sound: descending pitch sweep
  beep(880,0.12,'sawtooth',0.04); beep(440,0.15,'sawtooth',0.06);
}

function updateUFO() {
  if(!ufo){
    if(--ufoTimer<=0){ spawnUFO(); ufoTimer=1400+Math.floor(Math.random()*1000); }
    return;
  }

  ufo.lightRing.rotation.y += 0.08;
  ufo.mesh.rotation.y += 0.04;
  ufo.sineT += 0.04;

  if(ufo.phase==='enter'){
    ufo.enterT += 0.035;
    const targetY = 5.5;
    ufo.y += (targetY - ufo.y) * 0.06;
    ufo.mesh.position.y = ufo.y;
    // Pulsing beam during descent
    ufo.beamMat.opacity = Math.sin(ufo.enterT*6)*0.15+0.05;
    if(ufo.y < targetY+0.3){ ufo.phase='fly'; beep(660,0.06,'sine'); }
  } else {
    // Sine-wave flight path
    ufo.x += ufo.speed * ufo.dir;
    ufo.y  = 5.5 + Math.sin(ufo.sineT) * 1.2;
    ufo.mesh.position.x = ufo.x;
    ufo.mesh.position.y = ufo.y;
    // Beam pulses on/off rhythmically
    ufo.beamMat.opacity = Math.max(0, Math.sin(ufo.sineT*2)*0.4);
    if(frame%35===0) beep(1100,0.04,'sine',0.02);
    if((ufo.dir===1&&ufo.x>18)||(ufo.dir===-1&&ufo.x<-18)){
      scene.remove(ufo.mesh); ufo=null;
    }
  }
}

// ── Wingmen (escort fighters earned by shooting UFOs) ─────────────────────
// Types: 'scout'=fast single shot, 'gunship'=triple shot slow, 'drone'=orbits enemies
const WINGMAN_TYPES = ['scout','gunship','drone','scout','gunship','drone','scout','gunship'];
const wingmen = [];
const WINGMAN_MAX = 8;

function makeWingmanMesh(type) {
  const g = new THREE.Group();
  if (type === 'scout') {
    // Sleek blue fighter
    const mat = new THREE.MeshStandardMaterial({color:0x44aaff,emissive:0x0055ff,emissiveIntensity:1.4,metalness:0.7,roughness:0.2});
    const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.11,0.08,1.4,8),mat);
    fuse.rotation.z=Math.PI/2; g.add(fuse);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(2.0,0.05,0.55),mat);
    wing.position.set(0,0,0.1); g.add(wing);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.14,8,6),
      new THREE.MeshBasicMaterial({color:0x88eeff}));
    glow.position.set(0.72,0,0); g.add(glow);
  } else if (type === 'gunship') {
    // Heavy green gunship
    const mat = new THREE.MeshStandardMaterial({color:0x44ff88,emissive:0x00cc44,emissiveIntensity:1.2,metalness:0.5,roughness:0.3});
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.0,0.3,0.6),mat);
    g.add(body);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(2.4,0.06,0.7),mat);
    wing.position.set(0,0,0.1); g.add(wing);
    // Twin cannons
    for(const cx of [-0.25,0.25]){
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.06,0.5,6),mat);
      can.rotation.z=Math.PI/2; can.position.set(-0.75,cx,0); g.add(can);
    }
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.18,8,6),
      new THREE.MeshBasicMaterial({color:0x88ffaa}));
    glow.position.set(0.6,0,0); g.add(glow);
  } else {
    // Drone — small golden orb with ring
    const mat = new THREE.MeshStandardMaterial({color:0xffcc00,emissive:0xff8800,emissiveIntensity:1.8,metalness:0.8,roughness:0.1});
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.28,12,8),mat);
    g.add(core);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.44,0.07,6,16),mat);
    ring.rotation.x=Math.PI/2; g.add(ring);
  }
  g.scale.set(0.62,0.62,0.62);
  return g;
}

function addWingman() {
  if (wingmen.length >= WINGMAN_MAX) return;
  const type = WINGMAN_TYPES[wingmen.length % WINGMAN_TYPES.length];
  const mesh = makeWingmanMesh(type);
  scene.add(mesh);
  const labels = {scout:'偵察機+1',gunship:'砲撃機+1',drone:'ドローン+1'};
  const colors = {scout:'#44aaff',gunship:'#44ff88',drone:'#ffcc00'};
  wingmen.push({ mesh, type, idx: wingmen.length, shootCd: 0 });
  spawnFloat(playerX, playerMesh.position.y+1.5, PLAYER_Z, labels[type], colors[type]);
  beep(880,0.06); beep(1100,0.10);
}

function updateWingmen() {
  const n = wingmen.length;
  if (n === 0) return;
  wingmen.forEach((w, i) => {
    // Formation: fan out in arc around player
    const spread = Math.min(0.55, 0.8 / Math.max(1, n - 1));
    const angle = n === 1 ? 0 : ((i - (n-1)/2) * spread * Math.PI);
    const orbitR = 1.6 + Math.floor(i/4) * 1.2;
    const tx = playerMesh.position.x + Math.sin(angle) * orbitR;
    const ty = playerMesh.position.y + Math.cos(angle) * 0.5 + 0.4;
    w.mesh.position.x += (tx - w.mesh.position.x) * 0.10;
    w.mesh.position.y += (ty - w.mesh.position.y) * 0.10;
    w.mesh.position.z = PLAYER_Z - 0.4;

    // Drone type: slowly rotate its ring
    if (w.type === 'drone') w.mesh.children[1].rotation.z += 0.06;

    if (w.shootCd > 0) { w.shootCd--; return; }
    if (shootCooldown < 5) {
      // Scout: fast single, Gunship: twin burst, Drone: wide spread
      const fireRates = {scout:14, gunship:28, drone:20};
      w.shootCd = fireRates[w.type] + i * 3;
      const bz  = w.mesh.position.z - 0.8;
      const by  = w.mesh.position.y + 0.2;
      const targetZ = aimTarget ? aimTarget.z - 0.5 : -12;
      const targetY = aimTarget ? aimTarget.y : 4.5;
      const dz = targetZ - bz, dy = targetY - by;
      const len = Math.sqrt(dz*dz + dy*dy);
      const colors = {scout:0x44aaff, gunship:0x44ff88, drone:0xffcc00};
      const shots = w.type === 'gunship' ? [[-0.18,0],[0.18,0]] :
                    w.type === 'drone'   ? [[-0.3,-0.008],[0,0],[0.3,0.008]] :
                    [[0,0]];
      shots.forEach(([dx, dvx]) => {
        const m = new THREE.Mesh(
          new THREE.CylinderGeometry(0.06,0.06,0.6,5),
          new THREE.MeshBasicMaterial({color:colors[w.type]})
        );
        m.rotation.x=Math.PI/2;
        m.position.set(w.mesh.position.x+dx, by, bz);
        scene.add(m);
        bullets.push({mesh:m, x:w.mesh.position.x+dx, y:by, z:bz,
          vz:0.58*(dz/len), vy:0.58*(dy/len), vx:dvx});
      });
    }
  });
}

// ── Floating text sprites ─────────────────────────────────────────────────
let floats=[];
function spawnFloat(x, y, z, text, color) {
  const c2=document.createElement('canvas'); c2.width=256; c2.height=64;
  const cx=c2.getContext('2d');
  cx.fillStyle=color||'#fff'; cx.font='bold 26px monospace';
  cx.textAlign='center'; cx.textBaseline='middle'; cx.fillText(text,128,32);
  const tex=new THREE.CanvasTexture(c2);
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false}));
  sp.scale.set(2.8,0.75,1); sp.position.set(x,y,z);
  scene.add(sp); floats.push({sp,mat:sp.material,life:1.0,vy:0.035});
}
function updateFloats() {
  for(let i=floats.length-1;i>=0;i--){
    const f=floats[i]; f.life-=0.016; f.sp.position.y+=f.vy; f.mat.opacity=Math.max(0,f.life);
    if(f.life<=0){scene.remove(f.sp);floats.splice(i,1);}
  }
}

// ── Kill streak ───────────────────────────────────────────────────────────
function addStreak(x,y,z){
  streak++; streakTimer=90;
  if(streak===3) spawnFloat(x,y+1,z,'COMBO!','#ffdd00');
  if(streak>=3){ fovTarget=67; setTimeout(()=>fovTarget=62,220); }
}
function mult(){ return streak>=3?2:1; }

// ── Input ─────────────────────────────────────────────────────────────────
const inp={left:false,right:false,up:false,down:false};
window.addEventListener('keydown',e=>{
  if(e.code==='ArrowLeft' ||e.code==='KeyA') inp.left =true;
  if(e.code==='ArrowRight'||e.code==='KeyD') inp.right=true;
  if(e.code==='ArrowUp'   ||e.code==='KeyW'){e.preventDefault();inp.up=true;}
  if(e.code==='ArrowDown' ||e.code==='KeyS') inp.down =true;
  if(e.code==='Enter') action();
  if(e.code==='KeyM')  toggleBGM();
});
window.addEventListener('keyup',e=>{
  if(e.code==='ArrowLeft' ||e.code==='KeyA') inp.left =false;
  if(e.code==='ArrowRight'||e.code==='KeyD') inp.right=false;
  if(e.code==='ArrowUp'   ||e.code==='KeyW') inp.up   =false;
  if(e.code==='ArrowDown' ||e.code==='KeyS') inp.down =false;
});

let activePtr=null,touchInitX=0,touchInitY=0,touchLastX=0,touchLastY=0,touchMoved=false;
canvas.addEventListener('pointerdown',e=>{
  e.preventDefault();
  if(_ac&&_ac.state==='suspended')_ac.resume();
  if(transState!==0) return;
  if(state!=='playing'){action();return;}
  if(activePtr===null){
    activePtr=e.pointerId; canvas.setPointerCapture(e.pointerId);
    touchInitX=e.clientX; touchInitY=e.clientY; touchLastX=e.clientX; touchLastY=e.clientY; touchMoved=false;
  }
});
canvas.addEventListener('pointermove',e=>{
  if(e.pointerId!==activePtr) return;
  const dx=e.clientX-touchLastX, dy=e.clientY-touchLastY;
  touchLastX=e.clientX; touchLastY=e.clientY;
  playerX=Math.max(-PLAYER_LIMIT,Math.min(PLAYER_LIMIT,playerX+dx*0.045));
  playerY=Math.max(PLAYER_Y_MIN,Math.min(PLAYER_Y_MAX,playerY-dy*0.03));
  if(Math.abs(e.clientX-touchInitX)>6||Math.abs(e.clientY-touchInitY)>6) touchMoved=true;
});
canvas.addEventListener('pointerup',e=>{ if(e.pointerId===activePtr) activePtr=null; });
canvas.addEventListener('pointercancel',e=>{ if(e.pointerId===activePtr) activePtr=null; });

const fireBtn=document.getElementById('btn-shoot');
fireBtn.addEventListener('pointerdown',e=>{ e.preventDefault(); if(_ac&&_ac.state==='suspended')_ac.resume(); action(); });

const muteBtn=document.getElementById('btn-mute');
if(muteBtn){
  muteBtn.textContent=bgmEnabled?'🔊':'🔇';
  muteBtn.addEventListener('pointerdown',e=>{
    e.preventDefault(); if(_ac&&_ac.state==='suspended')_ac.resume(); toggleBGM();
  });
}

// ── Game flow ─────────────────────────────────────────────────────────────
function action(){ if(state==='title'||state==='dead') startGame(); }

function startGame(){
  score=0;lives=3;level=1;state='playing';frame=0;
  [bullets,eBullets,powerUps,pSystems,floats].forEach(arr=>{
    arr.forEach(o=>scene.remove(o.mesh||o.pts||o.sp)); arr.length=0;
  });
  rings.forEach(r=>scene.remove(r.mesh)); rings.length=0;
  dying.forEach(d=>scene.remove(d.mesh)); dying.length=0;
  inv.rapid=0;inv.triple=0;inv.bomb=0;
  wingmen.forEach(w => scene.remove(w.mesh)); wingmen.length=0;
  shootCooldown=0;streak=0;streakTimer=0;shakeTimer=0;vigTimer=0;
  if(ufo){scene.remove(ufo.mesh);ufo=null;}
  ufoTimer=1200+Math.floor(Math.random()*1200);
  playerX=0;playerY=0.5;
  playerMesh.position.set(0,playerY,PLAYER_Z); playerMesh.rotation.z=0;
  initGrid();initBarriers();
  hideOverlay();hudEl.classList.add('visible');
  if(legendEl) legendEl.classList.add('visible');
  buildPUSlots();
  updateHUD();startBGM();
}

function nextLevel(){
  level++;frame=0;
  [bullets,eBullets,powerUps].forEach(arr=>{arr.forEach(o=>scene.remove(o.mesh));arr.length=0;});
  dying.forEach(d=>scene.remove(d.mesh)); dying.length=0;
  // inv keeps across waves intentionally
  streak=0;streakTimer=0;
  if(ufo){scene.remove(ufo.mesh);ufo=null;}
  initGrid();initBarriers();updateHUD();
}

// ── Collision helper ──────────────────────────────────────────────────────
function dXZ(a,b){return Math.sqrt((a.x-b.x)**2+(a.z-b.z)**2);}

// ── Update ────────────────────────────────────────────────────────────────
function update(){
  if(transState!==0){updateTransition();updateFloats();return;}
  frame++;
  if(streakTimer>0&&--streakTimer===0)streak=0;
  updateUFO();updateWingmen();updateFloats();updateParticles();updateDying();

  if(inp.left)  playerX=Math.max(-PLAYER_LIMIT,playerX-PLAYER_SPEED);
  if(inp.right) playerX=Math.min( PLAYER_LIMIT,playerX+PLAYER_SPEED);
  if(inp.up)    playerY=Math.min(PLAYER_Y_MAX,playerY+PLAYER_Y_SPEED);
  if(inp.down)  playerY=Math.max(PLAYER_Y_MIN,playerY-PLAYER_Y_SPEED);
  const prevX=playerMesh.position.x;
  playerMesh.position.x+=(playerX-playerMesh.position.x)*0.18;
  playerMesh.position.y+=(playerY-playerMesh.position.y)*0.18;
  playerVX=playerMesh.position.x-prevX;
  playerMesh.rotation.z=-playerVX*0.55;
  camTargetX=playerX*0.18;
  camera.position.x+=(camTargetX-camera.position.x)*0.05;
  camera.lookAt(playerX*0.08, 2, -10);
  playerGlow.position.set(playerMesh.position.x, playerMesh.position.y, PLAYER_Z);

  {
    const alive = grid.filter(i => i.alive);
    if (alive.length > 0) {
      aimTarget = alive.reduce((best, inv) => {
        const d  = (inv.x - playerX)**2 + (inv.y - playerMesh.position.y)**2 * 0.55;
        const bd = (best.x - playerX)**2 + (best.y - playerMesh.position.y)**2 * 0.55;
        return d < bd ? inv : best;
      });
      reticleSp.position.set(aimTarget.x, aimTarget.y, aimTarget.z);
      reticleSp.material.opacity = 0.85;
      reticleSp.material.rotation += 0.025;
      reticleSp.scale.setScalar(1.8 + Math.sin(frame * 0.1) * 0.18);
    } else {
      aimTarget = null;
      reticleSp.material.opacity = 0;
    }
  }

  if(shootCooldown>0)shootCooldown--;
  // rapid: ×1→3shot cd5  ×2→5shot cd3  ×3→7shot cd2  ×4→10shot cd1  ×5→15shot cd1
  const rapidLv = inv.rapid;
  const maxB = [1,3,5,7,10,15][Math.min(5, rapidLv)];
  const cd   = [15,5,3,2,1,1][Math.min(5, rapidLv)];
  if(bullets.length<maxB&&shootCooldown===0){spawnBullets();shootCooldown=cd;}

  for(let i=bullets.length-1;i>=0;i--){
    const b=bullets[i]; b.z+=b.vz; b.x+=b.vx; b.y+=b.vy;
    b.mesh.position.z=b.z; b.mesh.position.x=b.x; b.mesh.position.y=b.y;
    if(b.z<-17){scene.remove(b.mesh);bullets.splice(i,1);}
  }
  for(let i=eBullets.length-1;i>=0;i--){
    const b=eBullets[i]; b.z+=b.vz; b.mesh.position.z=b.z;
    if(b.z>15){scene.remove(b.mesh);eBullets.splice(i,1);}
  }

  for(let i=powerUps.length-1;i>=0;i--){
    const pu=powerUps[i]; pu.z+=pu.vz; pu.age=(pu.age||0)+1;
    pu.mesh.position.z=pu.z;
    // Type-specific rotation speeds
    if(pu.type==='rapid')       { pu.mesh.rotation.y+=0.18; pu.mesh.rotation.x+=0.12; }
    else if(pu.type==='triple') { pu.mesh.rotation.z+=0.08; pu.mesh.rotation.y+=0.05; }
    else if(pu.type==='bomb')   { pu.mesh.rotation.y+=0.04; pu.mesh.rotation.x+=0.03; }
    else                        { pu.mesh.rotation.y+=0.07; }
    // Pulsing scale (sine wave)
    const pulse = 1.0 + Math.sin(pu.age * 0.12) * 0.15;
    pu.mesh.scale.setScalar(pulse);
    if(pu.z>15){scene.remove(pu.mesh);powerUps.splice(i,1);continue;}
    if(Math.abs(pu.x-playerX)<1.3&&Math.abs(pu.z-PLAYER_Z)<1.5){
      collectPU(pu.type,pu.x,pu.y,pu.z);scene.remove(pu.mesh);powerUps.splice(i,1);
    }
  }
  updateRings();

  if(--invTimer<=0){invTimer=invTick;stepInvaders();if(state!=='playing')return;}

  if(--eShootTimer<=0){
    eShootTimer=70+Math.floor(Math.random()*30);
    const alive=grid.filter(i=>i.alive);
    if(alive.length){
      const cols=[...new Set(alive.map(i=>i.col))];
      const col=cols[Math.floor(Math.random()*cols.length)];
      const colInvs=alive.filter(i=>i.col===col).sort((a,b)=>b.z-a.z);
      if(colInvs.length) spawnEBullet(colInvs[0]);
    }
  }

  checkCollisions();

  grid.forEach(inv=>{
    if(!inv.alive)return;
    inv.mesh.position.y=inv.y+Math.sin(frame*0.04+inv.col*0.7)*0.1;
  });

  if(!waveCleared&&grid.every(i=>!i.alive)){
    waveCleared=true; if(ufo){scene.remove(ufo.mesh);ufo=null;} saveHi();
    aimTarget=null; reticleSp.material.opacity=0;
    spawnExplosion(0,3,-5,0xffaa44,true); beep(523,0.08);beep(659,0.1);beep(784,0.25);
    triggerVignette('#ffaa44', 0.5); triggerFovPulse(8);
    startTransition(`WAVE ${level} CLEAR!`,()=>nextLevel());
  }
}

function stepInvaders(){
  const alive=grid.filter(i=>i.alive);
  if(!alive.length)return;
  const maxX=Math.max(...alive.map(i=>i.x)), minX=Math.min(...alive.map(i=>i.x));
  let advance=false;
  if(invDir===1 &&maxX+invStepX>invBoundX){invDir=-1;advance=true;}
  if(invDir===-1&&minX-invStepX<-invBoundX){invDir=1; advance=true;}
  alive.forEach(inv=>{
    inv.x+=invStepX*invDir;
    if(advance){inv.z+=invAdvZ;}
    inv.mesh.position.x=inv.x; inv.mesh.position.z=inv.z;
    if(inv.z>PLAYER_Z-3){state='dead';saveHi();showOverlay('GAME OVER',String(score).padStart(6,'0'),'TAP TO RETRY');}
  });
}

function checkCollisions(){
  if(ufo){
    for(let bi=bullets.length-1;bi>=0;bi--){
      const b=bullets[bi];
      if(dXZ(b,ufo)<1.3&&Math.abs(b.y-ufo.y)<1.5){
        const p=ufo.pts*mult(); score+=p; saveHi();
        spawnFloat(ufo.x,ufo.y+1,ufo.z,`+${p}`,'#ff3366');
        spawnExplosion(ufo.x,ufo.y,ufo.z,0xff3366,true);
        beep(880,0.08);beep(660,0.12);beep(440,0.18);
        triggerVignette('#ff3366',0.5); triggerFovPulse(9); addStreak(ufo.x,ufo.y,ufo.z);
        addWingman();
        scene.remove(ufo.mesh);ufo=null;scene.remove(b.mesh);bullets.splice(bi,1);break;
      }
    }
  }

  outer:for(let bi=bullets.length-1;bi>=0;bi--){
    const b=bullets[bi];
    for(const inv of grid){
      if(!inv.alive)continue;
      if(dXZ(b,inv)<0.92&&Math.abs(b.y-inv.y)<3.0){
        const p=(inv.type==='A'?30:inv.type==='B'?20:10)*mult();
        score+=p;saveHi();
        spawnExplosion(inv.x,inv.y,inv.z,new THREE.Color(CH[inv.type]).getHex(),false);
        spawnFloat(inv.x,inv.y+0.9,inv.z,`+${p}`,CH[inv.type]);
        beep(250+Math.random()*250,0.14);
        maybeDrop(inv.x,inv.y,inv.z); addStreak(inv.x,inv.y,inv.z);
        triggerVignette(CH[inv.type],0.28); triggerFovPulse(4); shakeTimer=6;shakeAmt=0.12;
        killInvader(inv); scene.remove(b.mesh);bullets.splice(bi,1);
        continue outer;
      }
    }
  }

  outer2:for(let bi=bullets.length-1;bi>=0;bi--){
    const b=bullets[bi];
    for(const bar of barriers){
      if(bar.hp<=0)continue;
      if(dXZ(b,bar)<0.55&&Math.abs(b.y-bar.y)<0.55){
        bar.hp--;bar.mesh.material.opacity=0.25+0.75*(bar.hp/4);
        if(bar.hp<=0)bar.mesh.visible=false;
        scene.remove(b.mesh);bullets.splice(bi,1);continue outer2;
      }
    }
  }

  for(let i=eBullets.length-1;i>=0;i--){
    const b=eBullets[i]; let blocked=false;
    for(const bar of barriers){
      if(bar.hp<=0)continue;
      if(dXZ(b,bar)<0.55&&Math.abs(b.y-bar.y)<0.55){
        bar.hp--;if(bar.hp<=0)bar.mesh.visible=false;
        scene.remove(b.mesh);eBullets.splice(i,1);blocked=true;break;
      }
    }
    if(blocked)continue;
    if(dXZ(b,{x:playerX,z:PLAYER_Z})<1.2&&Math.abs(b.y-playerMesh.position.y)<1.2){
      lives--;shakeTimer=12;shakeAmt=0.2;beep(80,0.45,'sawtooth');
      triggerVignette('#ff2222',0.55);
      scene.remove(b.mesh);eBullets.splice(i,1);updateHUD();
      if(lives<=0){state='dead';saveHi();showOverlay('GAME OVER',String(score).padStart(6,'0'),'TAP TO RETRY');}
    }
  }

  for(const inv of grid){
    if(!inv.alive)continue;
    for(const bar of barriers) if(bar.hp>0&&dXZ(inv,bar)<0.75)bar.hp=0,bar.mesh.visible=false;
  }
}

// ── Airplanes ─────────────────────────────────────────────────────────────
const planes = [];
let planeTimer = 500 + Math.floor(Math.random() * 500);

function makePlane() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xe8eef2, roughness: 0.3, metalness: 0.5 });
  const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.24, 5.5, 8), mat);
  fuse.rotation.z = Math.PI / 2; g.add(fuse);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(10, 0.1, 1.8), mat);
  wing.position.set(0, 0, 0.6); g.add(wing);
  const tailH = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.08, 0.7), mat);
  tailH.position.set(0, 0, 2.5); g.add(tailH);
  const tailV = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.0, 0.7), mat);
  tailV.position.set(0, 0.5, 2.5); g.add(tailV);
  for (const ex of [-2.8, 2.8]) {
    const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.16, 1.2, 7), mat);
    eng.rotation.z = Math.PI / 2; eng.position.set(ex, -0.18, 0.4); g.add(eng);
  }
  const redL = new THREE.Mesh(new THREE.SphereGeometry(0.09, 4, 3),
    new THREE.MeshBasicMaterial({ color: 0xff2020 }));
  redL.position.set(-5, 0, 0.6); g.add(redL);
  const greenL = new THREE.Mesh(new THREE.SphereGeometry(0.09, 4, 3),
    new THREE.MeshBasicMaterial({ color: 0x20ff50 }));
  greenL.position.set(5, 0, 0.6); g.add(greenL);
  return g;
}

function updatePlanes() {
  if (--planeTimer <= 0) {
    planeTimer = 450 + Math.floor(Math.random() * 600);
    const dir = Math.random() < 0.5 ? 1 : -1;
    const p = makePlane();
    p.position.set(dir === 1 ? -180 : 180, 30 + Math.random() * 35, -55 - Math.random() * 90);
    p.rotation.y = dir === 1 ? 0 : Math.PI;
    scene.add(p);
    planes.push({ mesh: p, dir, speed: 0.32 + Math.random() * 0.18 });
  }
  for (let i = planes.length - 1; i >= 0; i--) {
    const p = planes[i];
    p.mesh.position.x += p.speed * p.dir;
    if (Math.abs(p.mesh.position.x) > 185) {
      scene.remove(p.mesh); planes.splice(i, 1);
    }
  }
}

// ── Sky / Scene Update (runs every frame) ─────────────────────────────────
function updateSky() {
  timeOfDay = (timeOfDay + TIME_SPEED) % 1.0;
  const p = skyAt(timeOfDay);

  // Sky shader uniforms
  skyUni.uZenith.value.copy(p.zen);
  skyUni.uMidSky.value.copy(p.mid);
  skyUni.uHorizon.value.copy(p.hor);
  skyUni.uGround.value.copy(p.gnd);

  // Sun arc: rises east, sets west; noon at top
  const sunAng = (timeOfDay - 0.5) * Math.PI * 1.85;
  sunObj.position.set(Math.sin(sunAng) * 170, Math.cos(sunAng) * 145 - 8, -220);
  sunObj.visible = timeOfDay > 0.21 && timeOfDay < 0.81;

  // Moon opposite to sun
  const moonAng = sunAng + Math.PI;
  moonMesh.position.set(Math.sin(moonAng) * 150, Math.cos(moonAng) * 125 - 8, -220);
  moonMesh.visible = timeOfDay < 0.23 || timeOfDay > 0.77;

  // Stars fade in/out — visible all night, fade at dawn/dusk
  let starOp;
  if (timeOfDay < 0.25) starOp = 1;
  else if (timeOfDay < 0.33) starOp = 1 - (timeOfDay - 0.25) / 0.08;
  else if (timeOfDay > 0.76) starOp = Math.min(1, (timeOfDay - 0.76) / 0.06);
  else starOp = 0;
  starMesh.material.opacity = Math.max(0, starOp);

  // Lighting
  ambLight.color.copy(p.aC);
  ambLight.intensity = p.aI;
  sunLight.color.copy(p.sC);
  sunLight.intensity = p.sI;
  sunLight.position.copy(sunObj.position).normalize().multiplyScalar(100);
  // Moon intensity: full at midnight, fade at dawn/dusk
  const isNight = timeOfDay < 0.24 || timeOfDay > 0.83;
  const moonFade = timeOfDay < 0.24
    ? Math.min(1, (0.24 - timeOfDay) / 0.04 + 0.5)
    : Math.min(1, (timeOfDay - 0.83) / 0.05 + 0.5);
  moonLight.intensity = isNight ? Math.min(1.2, moonFade * 1.2) : 0;

  // Fog + clear color
  scene.fog.color.copy(p.fog);
  scene.fog.density = p.fd;
  renderer.setClearColor(p.fog);

  // Water — moonlit reflection at night
  const nightness = Math.max(0, 1 - p.sI / 2.0);
  const moonRefl  = moonLight.intensity / 1.2; // 0→1
  // Daytime: deep blue; Night: dark navy with blue-silver moonlit shimmer
  waterMat.color.lerpColors(new THREE.Color(0x1a3a5c), new THREE.Color(0x0a1830), nightness);
  waterMat.emissive.lerpColors(
    new THREE.Color(0x0a1828),
    new THREE.Color(0x1a2e50), // blue-silver moon reflection
    moonRefl
  );
  waterMat.emissiveIntensity = 0.15 + moonRefl * 0.65 + nightness * 0.1;
  waterMat.metalness = 0.5 + moonRefl * 0.35;

  // Night factor for city lights (starts when sun sets)
  const nightFactor = Math.max(0, Math.min(1, (1.0 - p.sI) * 1.4 - 0.2));

  // Building emissive glow — warm windows, brighter at night
  nightEmissiveMats.forEach(m => { m.emissiveIntensity = nightFactor * 1.2; });

  // Window planes — clearly visible at night
  nightWindowMats.forEach(m => { m.opacity = nightFactor * 0.92; });

  // Rainbow bridge lights
  bridgeLightMats.forEach(m => { m.opacity = nightFactor * 0.95; });

  // City ambient fill light — stronger & warmer at night
  cityGlow.intensity = nightFactor * 4.5;
  cityGlow.color.lerpColors(new THREE.Color(0xffaa44), new THREE.Color(0xff8822), nightFactor);

  // ── Weather state machine ──────────────────────────────────────────────
  weatherTimer--;
  if (weatherTimer <= 0) {
    weatherState = weatherTarget;
    weatherIntensity = 0.0;
    nextWeather();
  }
  weatherIntensity = Math.min(1.0, weatherIntensity + 0.003);

  // Interpolation helpers per weather state
  const wCloud  = { clear:0.0, cloudy:0.85, rain:1.0,  fog:0.6,  storm:1.0  }[weatherState];
  const wFogDen = { clear:0.0, cloudy:0.0,  rain:0.5,  fog:1.0,  storm:0.6  }[weatherState];
  const wDark   = { clear:0.0, cloudy:0.25, rain:0.55, fog:0.2,  storm:0.80 }[weatherState];
  const wWind   = { clear:1.0, cloudy:1.5,  rain:3.0,  fog:0.6,  storm:5.0  }[weatherState];

  const wi = weatherIntensity;
  const cloudCover  = wCloud  * wi;
  const extraFog    = wFogDen * wi;
  const darkening   = wDark   * wi;
  const windMult    = 1.0 + (wWind - 1.0) * wi;

  // Override fog density with weather
  const baseFd = p.fd;
  const weatherFd = baseFd + extraFog * 0.014;
  scene.fog.density = weatherFd;

  // Cloud color and drift
  cloudGroups.forEach(c => {
    c.position.x += c._wind * windMult;
    if (c.position.x > 130) c.position.x = -130;
    else if (c.position.x < -130) c.position.x = 130;
    const brightness = Math.max(0.18, Math.min(1.0, p.sI / 3.0)) * (1.0 - darkening * 0.6);
    const warmth = (timeOfDay > 0.22 && timeOfDay < 0.32) ? 0.12 :
                   (timeOfDay > 0.72 && timeOfDay < 0.82) ? 0.10 : 0;
    c.children.forEach(ch => {
      if (ch.isMesh && ch.material) {
        ch.material.color.setRGB(brightness + warmth, brightness + warmth * 0.5, brightness);
        // More clouds visible in bad weather
        ch.material.opacity = 0.90 * (0.3 + cloudCover * 0.7 + (1 - cloudCover) * (ch.material.opacity || 0.9));
      }
    });
    // Lower clouds in storm/rain
    const targetY = c._baseY !== undefined ? c._baseY : c.position.y;
    if (c._baseY === undefined) c._baseY = c.position.y;
    c.position.y = c._baseY - cloudCover * 8;
  });

  // Rain particles
  const isRainy = weatherState === 'rain' || weatherState === 'storm';
  const rainOpacity = isRainy ? Math.min(weatherState === 'storm' ? 0.7 : 0.45, wi * 0.8) : Math.max(0, rainMesh.material.opacity - 0.005);
  rainMesh.material.opacity = rainOpacity;
  if (rainOpacity > 0.01) {
    const rainPos = rainGeo.attributes.position.array;
    const dropSpeed = weatherState === 'storm' ? 1.8 : 0.9;
    for (let i = 0; i < rainPos.length; i += 3) {
      rainPos[i+1] -= dropSpeed;
      rainPos[i]   += (weatherState === 'storm' ? -0.4 : -0.1);  // wind slant
      if (rainPos[i+1] < -5) {
        rainPos[i]   = (Math.random() - 0.5) * 260;
        rainPos[i+1] = 80 + Math.random() * 20;
        rainPos[i+2] = (Math.random() - 0.5) * 200 - 80;
      }
    }
    rainGeo.attributes.position.needsUpdate = true;
  }

  // Darken sky for overcast weather
  if (darkening > 0) {
    skyUni.uZenith.value.multiplyScalar(1 - darkening * 0.5);
    skyUni.uMidSky.value.multiplyScalar(1 - darkening * 0.4);
    skyUni.uHorizon.value.multiplyScalar(1 - darkening * 0.3);
  }

  // Planes
  updatePlanes();
}

// ── Title idle animation ──────────────────────────────────────────────────
let idleT = 0;
function idleAnimate(){
  idleT += 0.008;
  camera.position.x = Math.sin(idleT*0.4)*3.5;
  camera.position.y = 16 + Math.sin(idleT*0.3)*0.8;
  camera.lookAt(0, 2, -10);
  grid.forEach((inv,i)=>{
    if(!inv.alive)return;
    inv.mesh.position.y=inv.y+Math.sin(idleT*2+i*0.4)*0.12;
    inv.mesh.rotation.y=Math.sin(idleT*1.5+i*0.2)*0.18;
  });
}

// ── Render loop ───────────────────────────────────────────────────────────
function animate(){
  requestAnimationFrame(animate);
  updateSky();
  if(state==='playing') update();
  else if(state==='title') idleAnimate();
  else if(state==='dead'){ updateParticles();updateFloats();updateDying(); }
  if(shakeTimer>0){
    shakeTimer--;
    camera.position.x+=(Math.random()-0.5)*shakeAmt;
    camera.position.y+=(Math.random()-0.5)*shakeAmt*0.5;
  }
  if(Math.abs(camera.fov-fovTarget)>0.1){
    camera.fov+=(fovTarget-camera.fov)*0.12;
    camera.updateProjectionMatrix();
  }
  renderer.render(scene,camera);
}

// ── Init ──────────────────────────────────────────────────────────────────
initGrid();
showOverlay('LEGACY<br>INVADER 3D','SLIDE・TAP to play','TAP TO START');
animate();
