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
const TIME_SPEED = 0.000018; // full cycle ~15 min real time

// Keyframes: t, zenith, midSky, horizon, ground, ambInt, ambColor, sunInt, sunColor, fogColor, fogDensity
const PHASES = [
  { t:0.00, zen:0x01010f, mid:0x020318, hor:0x04081e, gnd:0x010108, aI:0.25, aC:0x0a1022, sI:0.0,  sC:0x4060c0, fog:0x02030f, fd:0.003 },
  { t:0.22, zen:0x08061e, mid:0x0f0820, hor:0x1e0610, gnd:0x030208, aI:0.35, aC:0x18101e, sI:0.05, sC:0x503010, fog:0x060510, fd:0.004 },
  { t:0.26, zen:0x200e2e, mid:0x3e1a28, hor:0xc85020, gnd:0x0a060e, aI:0.65, aC:0x402018, sI:1.0,  sC:0xff7030, fog:0x963020, fd:0.007 },
  { t:0.32, zen:0x2858b0, mid:0x4880c0, hor:0xc0a058, gnd:0x182018, aI:1.1,  aC:0x8a6840, sI:2.2,  sC:0xffd080, fog:0x9a8060, fd:0.005 },
  { t:0.50, zen:0x155aab, mid:0x3382cc, hor:0x88c4f0, gnd:0x204030, aI:1.4,  aC:0x7a9090, sI:3.5,  sC:0xfff8f0, fog:0x88c0e0, fd:0.004 },
  { t:0.67, zen:0x143898, mid:0x2e68c0, hor:0x78a8d8, gnd:0x203028, aI:1.3,  aC:0x6880a0, sI:3.0,  sC:0xffe898, fog:0x6890c0, fd:0.004 },
  { t:0.75, zen:0x08051e, mid:0x1c0610, hor:0xe84010, gnd:0x0e0404, aI:0.8,  aC:0x681808, sI:2.2,  sC:0xff5800, fog:0xb02808, fd:0.006 },
  { t:0.83, zen:0x040310, mid:0x080518, hor:0x2e0618, gnd:0x030206, aI:0.45, aC:0x200810, sI:0.3,  sC:0x703018, fog:0x140508, fd:0.005 },
  { t:0.92, zen:0x01010f, mid:0x020218, hor:0x04081e, gnd:0x010108, aI:0.25, aC:0x0a1022, sI:0.0,  sC:0x4060c0, fog:0x02030f, fd:0.003 },
  { t:1.00, zen:0x01010f, mid:0x020318, hor:0x04081e, gnd:0x010108, aI:0.25, aC:0x0a1022, sI:0.0,  sC:0x4060c0, fog:0x02030f, fd:0.003 },
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
const moonLight = new THREE.DirectionalLight(0x4460a0, 0.0);
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
  new THREE.SphereGeometry(5, 16, 10),
  new THREE.MeshBasicMaterial({ color: 0xdde8f8 })
);
moonMesh.position.set(80, 60, -220);
scene.add(moonMesh);

// ── Stars ─────────────────────────────────────────────────────────────────
const starMesh = (() => {
  const N = 1400;
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
    new THREE.PointsMaterial({ color: 0xffffff, size: 0.55, sizeAttenuation: true, transparent: true, opacity: 0.0 })
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

  function addBuilding(x, z, w, d, h) {
    const isTall = h > 35;
    const bodyMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.55 + Math.random()*0.06, 0.08, 0.50 + Math.random()*0.12),
      roughness: 0.55, metalness: isTall ? 0.42 : 0.18,
      emissive: new THREE.Color(0.15, 0.10, 0.04), emissiveIntensity: 0.0,
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bodyMat);
    body.position.set(x, h/2 - 1.0, z);
    scene.add(body);
    nightEmissiveMats.push(bodyMat);

    // Window rows (become visible at night)
    const winRows = Math.max(2, Math.floor(h / 3.5));
    const winW = w * 0.72, winH = (h / winRows) * 0.38;
    for (let wr = 0; wr < winRows; wr++) {
      if (Math.random() < 0.25) continue;
      const wMat = new THREE.MeshBasicMaterial({
        color: Math.random() < 0.10 ? 0x88ccff : 0xffee88,
        transparent: true, opacity: 0.0,
      });
      const win = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), wMat);
      win.position.set(x, h/2 - 1.0 - h/2 + (wr+0.5)*(h/winRows), z - d/2 - 0.02);
      scene.add(win);
      nightWindowMats.push(wMat);
    }

    if (isTall && Math.random() > 0.4) {
      const ant = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.09, h*0.09, 6),
        new THREE.MeshStandardMaterial({ color: 0x888890 })
      );
      ant.position.set(x, h - 1.0 + h*0.045, z);
      scene.add(ant);
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

  // Construction cranes (visible in photo)
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

function updateHUD() {
  elScore.textContent = String(score).padStart(6, '0');
  elHi.textContent    = 'HI ' + String(hiscore).padStart(6, '0');
  elLives.textContent = '♥'.repeat(Math.max(0, lives));
  elLevel.textContent = `LV${level}`;
  const parts = [];
  if (rapidTimer  > 0) parts.push(`⚡ ${Math.ceil(rapidTimer/60)}s`);
  if (tripleTimer > 0) parts.push(`≡ ${Math.ceil(tripleTimer/60)}s`);
  if (streak >= 3)     parts.push(`${streak}x COMBO`);
  elPU.textContent = parts.join('  ');
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

// ── Flash effect ──────────────────────────────────────────────────────────
const flashEl = document.getElementById('flash');
let flashTimer = 0;
function triggerFlash(color, strength) {
  if (!flashEl) return;
  flashEl.style.transition = 'none';
  flashEl.style.background = color || '#ffffff';
  flashEl.style.opacity    = strength || 0.3;
  flashTimer = 2;
}

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
let rapidTimer = 0, tripleTimer = 0, shootCooldown = 0;
let streak = 0, streakTimer = 0;
let shakeTimer = 0, shakeAmt = 0;

const PLAYER_LIMIT  = 10,  PLAYER_SPEED  = 0.18, PLAYER_Z = 12;
const PLAYER_Y_MIN  = 0.3, PLAYER_Y_MAX  = 5.5,  PLAYER_Y_SPEED = 0.13;
const ROWS = 5, COLS = 11;

// ── Grid ──────────────────────────────────────────────────────────────────
let grid = [], invDir = 1, invStepX = 0.14, invAdvZ = 0.55;
let invTick = 38, invTimer = 38;

function initGrid() {
  grid.forEach(inv => scene.remove(inv.mesh));
  grid = [];
  dying.forEach(d => scene.remove(d.mesh)); dying = [];
  const cellW = 20 / COLS, cellH = 1.5;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const type = r === 0 ? 'A' : r < 3 ? 'B' : 'C';
      const mesh = makeInvader(type);
      const x = (c - (COLS-1)/2) * cellW;
      const y = 1.5 + (ROWS-1-r) * cellH;
      const z = -12;
      mesh.position.set(x, y, z);
      scene.add(mesh);
      grid.push({ mesh, row: r, col: c, type, alive: true, x, y, z });
    }
  }
  invDir = 1;
  invStepX = 0.13 + (level-1) * 0.015;
  invAdvZ  = 0.5  + (level-1) * 0.08;
  invTick  = Math.max(10, 38 - (level-1) * 3);
  invTimer = invTick;
  waveCleared = false;
  eBullets.forEach(b => scene.remove(b.mesh)); eBullets = [];
  eShootTimer = Math.max(40, 100 - level * 8);
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
  const bcolor = tripleTimer > 0 ? 0x00e5ff : rapidTimer > 0 ? 0xffcc00 : 0xffffff;
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
  if (tripleTimer > 0) {
    [[-0.55,-0.015],[0,0],[0.55,0.015]].forEach(([dx, vx]) => make(playerX+dx, vx));
  } else {
    make(playerX, 0);
  }
  beep(tripleTimer > 0 ? 700 : 900, 0.07);
}

function spawnEBullet(inv) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff3300 }));
  m.position.set(inv.x, inv.y, inv.z + 0.5);
  scene.add(m);
  eBullets.push({ mesh: m, x: inv.x, y: inv.y, z: inv.z+0.5, vz: 0.28+(level-1)*0.03 });
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
function maybeDrop(x, y, z) {
  if (Math.random() > 0.18) return;
  const type = PU_TYPES[Math.floor(Math.random()*4)];
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 12, 10),
    new THREE.MeshStandardMaterial({ color: PU_COL[type], emissive: PU_COL[type], emissiveIntensity: 3.0, transparent:true, opacity:0.95 })
  );
  m.position.set(x, y, z); scene.add(m);
  powerUps.push({ mesh:m, type, x, y, z, vz:0.045 });
  spawnFloat(x, y+1.2, z, {rapid:'⚡',triple:'≡',life:'♥',bomb:'✸'}[type], PU_CHX[type]);
}

function collectPU(type, x, y, z) {
  spawnExplosion(x, y, z, PU_COL[type], true);
  beep(660,0.06); beep(880,0.1); beep(1100,0.15);
  spawnFloat(x, y+1.2, z, {rapid:'⚡RAPID',triple:'≡TRIPLE',life:'♥LIFE',bomb:'✸BOMB'}[type], PU_CHX[type]);
  triggerFlash(PU_CHX[type], 0.3);
  if      (type==='rapid')  { rapidTimer  = 60*8; }
  else if (type==='triple') { tripleTimer = 60*8; }
  else if (type==='life')   { lives=Math.min(5,lives+1); }
  else if (type==='bomb') {
    const alive=grid.filter(i=>i.alive).sort((a,b)=>b.row-a.row);
    const maxR=alive.length?alive[0].row:0;
    grid.forEach(inv=>{
      if(!inv.alive||inv.row<maxR-1)return;
      score+=(inv.type==='A'?30:inv.type==='B'?20:10)*mult();
      spawnExplosion(inv.x,inv.y,inv.z, new THREE.Color(CH[inv.type]).getHex(), false);
      killInvader(inv);
    });
    triggerFlash('#ffffff', 0.65); saveHi(); shakeTimer=18; shakeAmt=0.25; beep(100,0.4,'sawtooth');
  }
  updateHUD();
}

// ── UFO ───────────────────────────────────────────────────────────────────
const UFO_PTS=[50,100,150,200,300];
let ufo=null, ufoTimer=1200+Math.floor(Math.random()*1200);
function spawnUFO() {
  const dir=Math.random()<0.5?1:-1;
  const g=new THREE.Group();
  const bMat=new THREE.MeshStandardMaterial({color:0xcc1144,emissive:0xff0044,emissiveIntensity:1.8});
  const body=new THREE.Mesh(new THREE.SphereGeometry(0.9,16,8),bMat); body.scale.set(1,0.32,1); g.add(body);
  const dome=new THREE.Mesh(new THREE.SphereGeometry(0.52,12,8),new THREE.MeshStandardMaterial({color:0xff5588,emissive:0xff2266,emissiveIntensity:1.5,transparent:true,opacity:0.8}));
  dome.position.y=0.22; g.add(dome);
  for(let i=0;i<6;i++){
    const a=(i/6)*Math.PI*2;
    const l=new THREE.Mesh(new THREE.SphereGeometry(0.1,6,4),new THREE.MeshBasicMaterial({color:i%2===0?0xffdd00:0xff6600}));
    l.position.set(Math.cos(a)*0.8,-0.05,Math.sin(a)*0.8); g.add(l);
  }
  g.position.set(dir===1?-15:15, 5.5, -5); scene.add(g);
  ufo={mesh:g, dir, x:dir===1?-15:15, y:5.5, z:-5, speed:0.12, pts:UFO_PTS[Math.floor(Math.random()*5)]};
  beep(440,0.08,'sawtooth',0.03);
}
function updateUFO() {
  if(!ufo){ if(--ufoTimer<=0){spawnUFO();ufoTimer=1200+Math.floor(Math.random()*1200);} return; }
  ufo.x+=ufo.speed*ufo.dir; ufo.mesh.position.x=ufo.x; ufo.mesh.rotation.y+=0.05;
  if(frame%40===0) beep(1000,0.05,'sine',0.02);
  if((ufo.dir===1&&ufo.x>15)||(ufo.dir===-1&&ufo.x<-15)){scene.remove(ufo.mesh);ufo=null;}
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
  dying.forEach(d=>scene.remove(d.mesh)); dying.length=0;
  rapidTimer=0;tripleTimer=0;shootCooldown=0;streak=0;streakTimer=0;shakeTimer=0;flashTimer=0;
  if(ufo){scene.remove(ufo.mesh);ufo=null;}
  ufoTimer=1200+Math.floor(Math.random()*1200);
  playerX=0;playerY=0.5;
  playerMesh.position.set(0,playerY,PLAYER_Z); playerMesh.rotation.z=0;
  initGrid();initBarriers();
  hideOverlay();hudEl.classList.add('visible');
  if(legendEl) legendEl.classList.add('visible');
  updateHUD();startBGM();
}

function nextLevel(){
  level++;frame=0;
  [bullets,eBullets,powerUps].forEach(arr=>{arr.forEach(o=>scene.remove(o.mesh));arr.length=0;});
  dying.forEach(d=>scene.remove(d.mesh)); dying.length=0;
  rapidTimer=0;tripleTimer=0;streak=0;streakTimer=0;
  if(ufo){scene.remove(ufo.mesh);ufo=null;}
  initGrid();initBarriers();updateHUD();
}

// ── Collision helper ──────────────────────────────────────────────────────
function dXZ(a,b){return Math.sqrt((a.x-b.x)**2+(a.z-b.z)**2);}

// ── Update ────────────────────────────────────────────────────────────────
function update(){
  if(transState!==0){updateTransition();updateFloats();return;}
  frame++;
  if(rapidTimer >0)rapidTimer--;
  if(tripleTimer>0)tripleTimer--;
  if(streakTimer>0&&--streakTimer===0)streak=0;
  updateUFO();updateFloats();updateParticles();updateDying();

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
  const maxB=rapidTimer>0?3:1, cd=rapidTimer>0?5:15;
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
    const pu=powerUps[i]; pu.z+=pu.vz; pu.mesh.position.z=pu.z; pu.mesh.rotation.y+=0.06;
    if(pu.z>15){scene.remove(pu.mesh);powerUps.splice(i,1);continue;}
    if(Math.abs(pu.x-playerX)<1.3&&Math.abs(pu.z-PLAYER_Z)<1.5){
      collectPU(pu.type,pu.x,pu.y,pu.z);scene.remove(pu.mesh);powerUps.splice(i,1);
    }
  }

  if(--invTimer<=0){invTimer=invTick;stepInvaders();if(state!=='playing')return;}

  if(--eShootTimer<=0){
    eShootTimer=Math.max(30,80-level*6)+Math.floor(Math.random()*30);
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
    triggerFlash('#ffaa44', 0.55);
    startTransition(`WAVE ${level} CLEAR!`,()=>nextLevel());
  }
}

function stepInvaders(){
  const alive=grid.filter(i=>i.alive);
  if(!alive.length)return;
  const maxX=Math.max(...alive.map(i=>i.x)), minX=Math.min(...alive.map(i=>i.x));
  let advance=false;
  if(invDir===1 &&maxX+invStepX>9.5){invDir=-1;advance=true;}
  if(invDir===-1&&minX-invStepX<-9.5){invDir=1; advance=true;}
  alive.forEach(inv=>{
    inv.x+=invStepX*invDir;
    if(advance){inv.z+=invAdvZ;invTick=Math.max(5,invTick-0.35);}
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
        triggerFlash('#ff3366',0.4); addStreak(ufo.x,ufo.y,ufo.z);
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
        score+=p;saveHi();invTick=Math.max(4,invTick-0.3);
        spawnExplosion(inv.x,inv.y,inv.z,new THREE.Color(CH[inv.type]).getHex(),false);
        spawnFloat(inv.x,inv.y+0.9,inv.z,`+${p}`,CH[inv.type]);
        beep(250+Math.random()*250,0.14);
        maybeDrop(inv.x,inv.y,inv.z); addStreak(inv.x,inv.y,inv.z);
        triggerFlash(CH[inv.type],0.2); shakeTimer=6;shakeAmt=0.12;
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
      triggerFlash('#ff4444',0.45);
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

  // Stars fade in/out around dawn and dusk
  let starOp;
  if (timeOfDay < 0.23) starOp = 1;
  else if (timeOfDay < 0.31) starOp = 1 - (timeOfDay - 0.23) / 0.08;
  else if (timeOfDay > 0.77) starOp = Math.min(1, (timeOfDay - 0.77) / 0.07);
  else starOp = 0;
  starMesh.material.opacity = Math.max(0, starOp);

  // Lighting
  ambLight.color.copy(p.aC);
  ambLight.intensity = p.aI;
  sunLight.color.copy(p.sC);
  sunLight.intensity = p.sI;
  sunLight.position.copy(sunObj.position).normalize().multiplyScalar(100);
  moonLight.intensity = (timeOfDay < 0.23 || timeOfDay > 0.78) ? 0.35 : 0;

  // Fog + clear color
  scene.fog.color.copy(p.fog);
  scene.fog.density = p.fd;
  renderer.setClearColor(p.fog);

  // Water — darker at night, horizon-tinted emissive
  const nightness = Math.max(0, 1 - p.sI / 2.0);
  waterMat.color.lerpColors(new THREE.Color(0x1a3a5c), new THREE.Color(0x03070e), nightness);
  waterMat.emissive.lerpColors(new THREE.Color(0x0a1828), new THREE.Color(0x100408), nightness);
  waterMat.emissiveIntensity = 0.15 + nightness * 0.35;

  // Night factor for city lights (starts when sun sets below ~sI<1.0)
  const nightFactor = Math.max(0, Math.min(1, (1.0 - p.sI) * 1.4 - 0.3));

  // Building emissive glow (warm window light)
  nightEmissiveMats.forEach(m => { m.emissiveIntensity = nightFactor * 0.85; });

  // Window planes
  nightWindowMats.forEach(m => { m.opacity = nightFactor * 0.82; });

  // Rainbow bridge lights
  bridgeLightMats.forEach(m => { m.opacity = nightFactor * 0.9; });

  // City ambient fill light
  cityGlow.intensity = nightFactor * 2.8;

  // Cloud color and drift
  cloudGroups.forEach(c => {
    c.position.x += c._wind;
    if (c.position.x > 130) c.position.x = -130;
    else if (c.position.x < -130) c.position.x = 130;
    const brightness = Math.max(0.18, Math.min(1.0, p.sI / 3.0));
    const warmth = (timeOfDay > 0.22 && timeOfDay < 0.32) ? 0.12 :
                   (timeOfDay > 0.72 && timeOfDay < 0.82) ? 0.10 : 0;
    c.children.forEach(ch => {
      if (ch.isMesh && ch.material) {
        ch.material.color.setRGB(brightness + warmth, brightness + warmth * 0.5, brightness);
      }
    });
  });

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
  if(flashTimer>0){
    flashTimer--;
    if(flashTimer===0&&flashEl){ flashEl.style.transition='opacity 0.18s ease-out'; flashEl.style.opacity=0; }
  }
  renderer.render(scene,camera);
}

// ── Init ──────────────────────────────────────────────────────────────────
initGrid();
showOverlay('LEGACY<br>INVADER 3D','SLIDE・TAP to play','TAP TO START');
animate();
