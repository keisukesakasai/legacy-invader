import * as THREE from 'three';

// ── Renderer ──────────────────────────────────────────────────────────────
const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0x050815);

// ── Scene & Camera ────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x050815, 0.016);

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);
camera.position.set(0, 10, 22);
camera.lookAt(0, 2, 0);
let camTargetX = 0;

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ── Lights ────────────────────────────────────────────────────────────────
// City night: sky=deep blue, ground=warm orange (light pollution)
scene.add(new THREE.HemisphereLight(0x112244, 0xcc6622, 2.5));
const moonLight = new THREE.DirectionalLight(0x8899cc, 1.8);
moonLight.position.set(-5, 20, 10);
scene.add(moonLight);
const playerGlow = new THREE.PointLight(0x4fc3f7, 8, 14);
scene.add(playerGlow);
const invGlow = new THREE.PointLight(0xff4422, 3, 35);
invGlow.position.set(0, 4, -8);
scene.add(invGlow);
// City ambient warmth from below
const cityAmbient = new THREE.PointLight(0xff7722, 1.5, 60);
cityAmbient.position.set(0, -15, 0);
scene.add(cityAmbient);

// ── Stars (city: fewer, dimmer) ───────────────────────────────────────────
{
  const N = 250, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    const r = 70 + Math.random() * 30;
    pos[i*3]   = r * Math.sin(ph) * Math.cos(th);
    pos[i*3+1] = Math.abs(r * Math.cos(ph)) + 15;
    pos[i*3+2] = r * Math.sin(ph) * Math.sin(th);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xaabbdd, size: 0.2, sizeAttenuation: true, transparent: true, opacity: 0.45 })));
}

// ── City scene ────────────────────────────────────────────────────────────
{
  // Plaza / rooftop floor
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 120),
    new THREE.MeshStandardMaterial({ color: 0x0a0e18, roughness: 0.95 })
  );
  floor.rotation.x = -Math.PI / 2; floor.position.y = -1.0;
  scene.add(floor);

  // Street grid far below (city ground)
  const streetGrid = new THREE.GridHelper(300, 80, 0x1a2a10, 0x0d1808);
  streetGrid.position.y = -25;
  scene.add(streetGrid);
}

// ── Buildings ─────────────────────────────────────────────────────────────
function makeWinTex() {
  const rows=22, cols=10, c=document.createElement('canvas');
  c.width=cols*8; c.height=rows*8;
  const cx=c.getContext('2d');
  cx.fillStyle='#060a14'; cx.fillRect(0,0,c.width,c.height);
  for(let r=0;r<rows;r++) for(let cl=0;cl<cols;cl++) {
    if(Math.random()>0.48){
      cx.fillStyle=Math.random()>0.2?'#ffe090':'#88aaff';
      cx.globalAlpha=0.3+Math.random()*0.7;
      cx.fillRect(cl*8+1,r*8+1,6,6);
    }
  }
  cx.globalAlpha=1;
  const t=new THREE.CanvasTexture(c);
  t.wrapS=t.wrapT=THREE.RepeatWrapping; return t;
}

{
  const texPool=[makeWinTex(),makeWinTex(),makeWinTex()];
  function addBuilding(x,z,w,d,h){
    const tex=texPool[Math.floor(Math.random()*3)];
    const faceMat=()=>new THREE.MeshStandardMaterial({map:tex.clone(),roughness:0.85,metalness:0.1,color:0x0d1520});
    const topMat=new THREE.MeshStandardMaterial({color:0x080c14,roughness:1});
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),[faceMat(),faceMat(),topMat,topMat,faceMat(),faceMat()]);
    mesh.position.set(x,h/2-1.0,z); scene.add(mesh);
    // Rooftop light
    if(Math.random()>0.55){
      const pl=new THREE.PointLight(Math.random()>0.5?0xff4400:0x4488ff,0.4+Math.random()*0.6,8);
      pl.position.set(x,h-1.0+0.5,z); scene.add(pl);
    }
  }
  const rn=(a,b)=>a+Math.random()*(b-a);
  // Left canyon wall
  for(let z=-28;z<=22;z+=rn(3,7)){
    addBuilding(rn(-14,-22),z,rn(2,5),rn(2,5),rn(5,32));
    if(Math.random()>0.45) addBuilding(rn(-22,-32),z+rn(-2,2),rn(3,7),rn(3,6),rn(4,22));
  }
  // Right canyon wall
  for(let z=-28;z<=22;z+=rn(3,7)){
    addBuilding(rn(14,22),z,rn(2,5),rn(2,5),rn(5,32));
    if(Math.random()>0.45) addBuilding(rn(22,32),z+rn(-2,2),rn(3,7),rn(3,6),rn(4,22));
  }
  // Background skyline
  for(let x=-30;x<=30;x+=rn(3,7)){
    addBuilding(x,rn(-25,-40),rn(3,8),rn(3,7),rn(12,50));
  }
  // Foreground accent (near camera)
  for(const sx of[-1,1]){
    addBuilding(sx*rn(13,16),rn(15,20),rn(3,5),rn(3,5),rn(4,14));
  }
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
const elScore = document.getElementById('hud-score');
const elHi    = document.getElementById('hud-hi');
const elLives = document.getElementById('hud-lives');
const elLevel = document.getElementById('hud-level');
const elPU    = document.getElementById('hud-pu');
const hudEl   = document.getElementById('hud');

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
  overlayT.innerHTML   = title;
  overlaySub.textContent  = sub;
  overlayHint.textContent = hint;
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
  if (transState === 1) {
    transAlpha = Math.min(1, transAlpha + 0.04);
    if (transAlpha >= 1) transState = 2;
  } else if (transState === 2) {
    if (++transHold >= 50) { transState = 3; if (transCallback) transCallback(); }
  } else {
    transAlpha = Math.max(0, transAlpha - 0.04);
    if (transAlpha <= 0) transState = 0;
  }
  transEl.style.opacity = transAlpha;
  transMsg.textContent  = transAlpha > 0.55 ? transText : '';
}

// ── Materials ─────────────────────────────────────────────────────────────
const C = { A: 0xff6b6b, B: 0xffd93d, C: 0x6bcb77 };
const E = { A: 0xdd1111, B: 0xaa6600, C: 0x117722 };
const CH = { A: '#ff6b6b', B: '#ffd93d', C: '#6bcb77' };

function invMat(type) {
  return new THREE.MeshStandardMaterial({ color: C[type], emissive: E[type], emissiveIntensity: 1.4, roughness: 0.35, metalness: 0.2 });
}

// ── Invader meshes ────────────────────────────────────────────────────────
function makeInvader(type) {
  const g = new THREE.Group();
  const m = invMat(type);
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

  if (type === 'A') {
    g.add(new THREE.Mesh(box(0.72, 0.5, 0.32), m));
    [-0.22, 0.22].forEach(x => {
      const ant = new THREE.Mesh(box(0.08, 0.32, 0.08), m.clone());
      ant.position.set(x, 0.41, 0); g.add(ant);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), m.clone());
      tip.position.set(x, 0.62, 0); g.add(tip);
    });
    [-0.46, 0.46].forEach(x => {
      const c = new THREE.Mesh(box(0.18, 0.18, 0.18), m.clone());
      c.position.set(x, -0.3, 0); g.add(c);
    });
  } else if (type === 'B') {
    g.add(new THREE.Mesh(box(0.92, 0.42, 0.32), m));
    [-0.64, 0.64].forEach(x => {
      const arm = new THREE.Mesh(box(0.22, 0.15, 0.15), m.clone());
      arm.position.set(x, 0.04, 0); g.add(arm);
    });
    [-0.3, 0, 0.3].forEach(x => {
      const leg = new THREE.Mesh(box(0.1, 0.24, 0.1), m.clone());
      leg.position.set(x, -0.32, 0); g.add(leg);
    });
  } else {
    g.add(new THREE.Mesh(box(0.88, 0.38, 0.32), m));
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), m.clone());
    top.scale.set(1, 0.55, 0.65); top.position.set(0, 0.24, 0); g.add(top);
    [-0.34, -0.12, 0.12, 0.34].forEach(x => {
      const leg = new THREE.Mesh(box(0.09, 0.22, 0.09), m.clone());
      leg.position.set(x, -0.28, 0); g.add(leg);
    });
  }

  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x050510 });
  [-0.18, 0.18].forEach(x => {
    const eye = new THREE.Mesh(box(0.1, 0.1, 0.08), eyeMat);
    eye.position.set(x, 0.06, 0.18); g.add(eye);
  });
  return g;
}

// ── Player mesh ───────────────────────────────────────────────────────────
const playerMat = new THREE.MeshStandardMaterial({ color: 0x4fc3f7, emissive: 0x0055bb, emissiveIntensity: 2.0, roughness: 0.2, metalness: 0.5 });
const playerMesh = (() => {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.24, 2.2), playerMat));
  const wing = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.1, 1.0), playerMat.clone());
  wing.position.set(0, -0.05, 0.35); g.add(wing);
  const cannonMat = new THREE.MeshStandardMaterial({ color: 0xaaaaff, emissive: 0x8888ff, emissiveIntensity: 2.5 });
  const cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.1, 8), cannonMat);
  cannon.rotation.x = Math.PI / 2; cannon.position.set(0, 0.22, -0.6); g.add(cannon);
  const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.14, 0.22, 8), new THREE.MeshBasicMaterial({ color: 0x4fc3f7 }));
  eng.position.set(0, 0, 1.1); g.add(eng);
  return g;
})();
playerMesh.position.set(0, 0.5, 12);
scene.add(playerMesh);

// ── Game state ────────────────────────────────────────────────────────────
let state = 'title', score = 0, lives = 3, level = 1, frame = 0;
let waveCleared = false, playerX = 0, playerVX = 0;
let rapidTimer = 0, tripleTimer = 0, shootCooldown = 0;
let streak = 0, streakTimer = 0;
let shakeTimer = 0, shakeAmt = 0;

const PLAYER_LIMIT = 10, PLAYER_SPEED = 0.18, PLAYER_Z = 12;
const ROWS = 5, COLS = 11;

// ── Grid ──────────────────────────────────────────────────────────────────
let grid = [], invDir = 1, invStepX = 0.14, invAdvZ = 0.55;
let invTick = 38, invTimer = 38;

function initGrid() {
  grid.forEach(inv => scene.remove(inv.mesh));
  grid = [];
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

// ── Bullets ───────────────────────────────────────────────────────────────
let bullets = [], eBullets = [], eShootTimer = 80;
const PU_TYPES = ['rapid', 'triple', 'life', 'bomb'];
const PU_COL = { rapid: 0xffcc00, triple: 0x00e5ff, life: 0xff4d8b, bomb: 0xbf5fff };
const PU_CHX = { rapid: '#ffcc00', triple: '#00e5ff', life: '#ff4d8b', bomb: '#bf5fff' };

function spawnBullets() {
  const bcolor = tripleTimer > 0 ? 0x00e5ff : rapidTimer > 0 ? 0xffcc00 : 0xffffff;
  const mat = new THREE.MeshBasicMaterial({ color: bcolor });
  const bz = playerMesh.position.z - 1.2;
  const by = 0.8;
  // Aim toward center of alive invader formation
  const alive = grid.filter(i => i.alive);
  const targetZ = alive.length ? Math.min(...alive.map(i => i.z)) - 1 : -12;
  const targetY = alive.length ? alive.reduce((s, i) => s + i.y, 0) / alive.length : 4.5;
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
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff3300 }));
  m.position.set(inv.x, inv.y, inv.z + 0.5);
  scene.add(m);
  eBullets.push({ mesh: m, x: inv.x, y: inv.y, z: inv.z+0.5, vz: 0.28+(level-1)*0.03 });
  beep(160, 0.13, 'sawtooth', 0.05);
}

// ── Particles ─────────────────────────────────────────────────────────────
let pSystems = [];

function spawnExplosion(x, y, z, color) {
  const N = 22, pos = new Float32Array(N*3), vels = [];
  for (let i = 0; i < N; i++) {
    pos[i*3]=x; pos[i*3+1]=y; pos[i*3+2]=z;
    const a=Math.random()*Math.PI*2, b=(Math.random()-0.5)*Math.PI, s=0.04+Math.random()*0.13;
    vels.push({ vx:Math.cos(a)*Math.cos(b)*s, vy:Math.sin(b)*s+0.02, vz:Math.sin(a)*Math.cos(b)*s });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size:0.22, sizeAttenuation:true, transparent:true }));
  scene.add(pts);
  pSystems.push({ pts, geo, vels, posArr:pos, life:1.0 });
}

function updateParticles() {
  for (let i = pSystems.length-1; i >= 0; i--) {
    const p = pSystems[i]; p.life -= 0.024;
    if (p.life <= 0) { scene.remove(p.pts); pSystems.splice(i,1); continue; }
    p.pts.material.opacity = p.life;
    for (let j=0; j<p.vels.length; j++) {
      p.posArr[j*3]   += p.vels[j].vx;
      p.posArr[j*3+1] += p.vels[j].vy;
      p.posArr[j*3+2] += p.vels[j].vz;
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
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), new THREE.MeshStandardMaterial({ color: PU_COL[type], emissive: PU_COL[type], emissiveIntensity: 2.5, transparent:true, opacity:0.9 }));
  m.position.set(x, y, z); scene.add(m);
  powerUps.push({ mesh:m, type, x, y, z, vz:0.045 });
}

function collectPU(type, x, y, z) {
  spawnExplosion(x, y, z, PU_COL[type]);
  beep(660,0.06); beep(880,0.1); beep(1100,0.15);
  spawnFloat(x, y+1, z, {rapid:'⚡RAPID',triple:'≡TRIPLE',life:'♥LIFE',bomb:'✸BOMB'}[type], PU_CHX[type]);
  if      (type==='rapid')  { rapidTimer  = 60*8; }
  else if (type==='triple') { tripleTimer = 60*8; }
  else if (type==='life')   { lives=Math.min(5,lives+1); }
  else if (type==='bomb') {
    const alive=grid.filter(i=>i.alive).sort((a,b)=>b.row-a.row);
    const maxR=alive.length?alive[0].row:0;
    grid.forEach(inv=>{
      if(!inv.alive||inv.row<maxR-1)return;
      inv.alive=false; inv.mesh.visible=false;
      score+=(inv.type==='A'?30:inv.type==='B'?20:10)*mult();
      spawnExplosion(inv.x,inv.y,inv.z, new THREE.Color(CH[inv.type]).getHex());
    });
    saveHi(); shakeTimer=18; shakeAmt=0.25; beep(100,0.4,'sawtooth');
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
  const body=new THREE.Mesh(new THREE.SphereGeometry(0.9,16,8),bMat);
  body.scale.set(1,0.32,1); g.add(body);
  const dome=new THREE.Mesh(new THREE.SphereGeometry(0.52,12,8),new THREE.MeshStandardMaterial({color:0xff5588,emissive:0xff2266,emissiveIntensity:1.5,transparent:true,opacity:0.8}));
  dome.position.y=0.22; g.add(dome);
  for(let i=0;i<6;i++){
    const a=(i/6)*Math.PI*2;
    const l=new THREE.Mesh(new THREE.SphereGeometry(0.1,6,4),new THREE.MeshBasicMaterial({color:i%2===0?0xffdd00:0xff6600}));
    l.position.set(Math.cos(a)*0.8,-0.05,Math.sin(a)*0.8); g.add(l);
  }
  g.position.set(dir===1?-15:15, 5.5, -5);
  scene.add(g);
  ufo={mesh:g, dir, x:dir===1?-15:15, y:5.5, z:-5, speed:0.12, pts:UFO_PTS[Math.floor(Math.random()*5)]};
  beep(440,0.08,'sawtooth',0.03);
}

function updateUFO() {
  if(!ufo){
    if(--ufoTimer<=0){spawnUFO();ufoTimer=1200+Math.floor(Math.random()*1200);}
    return;
  }
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
  scene.add(sp); floats.push({sp,mat:sp.material,life:1.0,vy:0.03});
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
}
function mult(){ return streak>=3?2:1; }

// ── Input ─────────────────────────────────────────────────────────────────
const inp={left:false,right:false,shoot:false};

window.addEventListener('keydown',e=>{
  if(e.code==='ArrowLeft' ||e.code==='KeyA') inp.left =true;
  if(e.code==='ArrowRight'||e.code==='KeyD') inp.right=true;
  if(e.code==='Space'){e.preventDefault();inp.shoot=true;}
  if(e.code==='Enter') action();
  if(e.code==='KeyM')  toggleBGM();
});
window.addEventListener('keyup',e=>{
  if(e.code==='ArrowLeft' ||e.code==='KeyA') inp.left =false;
  if(e.code==='ArrowRight'||e.code==='KeyD') inp.right=false;
  if(e.code==='Space') inp.shoot=false;
});

let activePtr=null,touchInitX=0,touchLastX=0,touchMoved=false;

canvas.addEventListener('pointerdown',e=>{
  e.preventDefault();
  if(_ac&&_ac.state==='suspended')_ac.resume();
  if(transState!==0) return;
  if(state!=='playing'){action();return;}
  if(activePtr===null){
    activePtr=e.pointerId; canvas.setPointerCapture(e.pointerId);
    touchInitX=e.clientX; touchLastX=e.clientX; touchMoved=false;
  }
});
canvas.addEventListener('pointermove',e=>{
  if(e.pointerId!==activePtr) return;
  const dx=e.clientX-touchLastX; touchLastX=e.clientX;
  playerX=Math.max(-PLAYER_LIMIT,Math.min(PLAYER_LIMIT,playerX+dx*0.045));
  if(Math.abs(e.clientX-touchInitX)>6) touchMoved=true;
});
canvas.addEventListener('pointerup',e=>{
  if(e.pointerId!==activePtr) return;
  activePtr=null;
  if(!touchMoved&&state==='playing') inp.shoot=true;
});
canvas.addEventListener('pointercancel',e=>{if(e.pointerId===activePtr)activePtr=null;});

const fireBtn=document.getElementById('btn-shoot');
fireBtn.addEventListener('pointerdown',e=>{
  e.preventDefault();
  if(_ac&&_ac.state==='suspended')_ac.resume();
  action(); inp.shoot=true;
});
fireBtn.addEventListener('pointerup',    ()=>inp.shoot=false);
fireBtn.addEventListener('pointercancel',()=>inp.shoot=false);
fireBtn.addEventListener('pointerleave', ()=>inp.shoot=false);

const muteBtn=document.getElementById('btn-mute');
if(muteBtn){
  muteBtn.textContent=bgmEnabled?'🔊':'🔇';
  muteBtn.addEventListener('pointerdown',e=>{
    e.preventDefault();
    if(_ac&&_ac.state==='suspended')_ac.resume();
    toggleBGM();
  });
}

// ── Game flow ─────────────────────────────────────────────────────────────
function action(){
  if(state==='title'||state==='dead') startGame();
}

function startGame(){
  score=0;lives=3;level=1;state='playing';frame=0;
  [bullets,eBullets,powerUps,pSystems,floats].forEach(arr=>{
    arr.forEach(o=>scene.remove(o.mesh||o.pts||o.sp)); arr.length=0;
  });
  rapidTimer=0;tripleTimer=0;shootCooldown=0;
  streak=0;streakTimer=0;shakeTimer=0;
  if(ufo){scene.remove(ufo.mesh);ufo=null;}
  ufoTimer=1200+Math.floor(Math.random()*1200);
  playerX=0;playerMesh.position.set(0,0.5,PLAYER_Z);playerMesh.rotation.z=0;
  initGrid();initBarriers();
  hideOverlay();hudEl.classList.add('visible');updateHUD();startBGM();
}

function nextLevel(){
  level++;frame=0;
  [bullets,eBullets,powerUps].forEach(arr=>{arr.forEach(o=>scene.remove(o.mesh));arr.length=0;});
  rapidTimer=0;tripleTimer=0;streak=0;streakTimer=0;
  if(ufo){scene.remove(ufo.mesh);ufo=null;}
  initGrid();initBarriers();updateHUD();
}

// ── Collision helpers ─────────────────────────────────────────────────────
function dXZ(a,b){return Math.sqrt((a.x-b.x)**2+(a.z-b.z)**2);}

// ── Update ────────────────────────────────────────────────────────────────
function update(){
  if(transState!==0){updateTransition();updateFloats();return;}
  frame++;
  if(rapidTimer >0)rapidTimer--;
  if(tripleTimer>0)tripleTimer--;
  if(streakTimer>0&&--streakTimer===0)streak=0;
  updateUFO();updateFloats();updateParticles();

  // Player movement
  if(inp.left)  playerX=Math.max(-PLAYER_LIMIT,playerX-PLAYER_SPEED);
  if(inp.right) playerX=Math.min( PLAYER_LIMIT,playerX+PLAYER_SPEED);
  const prevX=playerMesh.position.x;
  playerMesh.position.x+=(playerX-playerMesh.position.x)*0.18;
  playerVX=playerMesh.position.x-prevX;
  playerMesh.rotation.z=-playerVX*0.55;
  camTargetX=playerX*0.18;
  camera.position.x+=(camTargetX-camera.position.x)*0.05;
  camera.lookAt(playerX*0.1,2,0);
  playerGlow.position.set(playerMesh.position.x,1.5,PLAYER_Z);

  // Shoot
  if(shootCooldown>0)shootCooldown--;
  const maxB=rapidTimer>0?3:1, cd=rapidTimer>0?5:12;
  if(inp.shoot&&bullets.length<maxB&&shootCooldown===0){spawnBullets();shootCooldown=cd;}
  if(inp.shoot&&activePtr===null)inp.shoot=false;

  // Move bullets
  for(let i=bullets.length-1;i>=0;i--){
    const b=bullets[i]; b.z+=b.vz; b.x+=b.vx; b.y+=b.vy;
    b.mesh.position.z=b.z; b.mesh.position.x=b.x; b.mesh.position.y=b.y;
    if(b.z<-17){scene.remove(b.mesh);bullets.splice(i,1);}
  }
  for(let i=eBullets.length-1;i>=0;i--){
    const b=eBullets[i]; b.z+=b.vz; b.mesh.position.z=b.z;
    if(b.z>15){scene.remove(b.mesh);eBullets.splice(i,1);}
  }

  // Power-ups
  for(let i=powerUps.length-1;i>=0;i--){
    const pu=powerUps[i]; pu.z+=pu.vz; pu.mesh.position.z=pu.z; pu.mesh.rotation.y+=0.06;
    if(pu.z>15){scene.remove(pu.mesh);powerUps.splice(i,1);continue;}
    if(Math.abs(pu.x-playerX)<1.3&&Math.abs(pu.z-PLAYER_Z)<1.5){
      collectPU(pu.type,pu.x,pu.y,pu.z);scene.remove(pu.mesh);powerUps.splice(i,1);
    }
  }

  // Invader tick
  if(--invTimer<=0){invTimer=invTick;stepInvaders();if(state!=='playing')return;}

  // Enemy shoot
  if(--eShootTimer<=0){
    eShootTimer=Math.max(30,80-level*6)+Math.floor(Math.random()*30);
    const alive=grid.filter(i=>i.alive);
    if(alive.length){
      // Pick frontmost in a random column
      const cols=[...new Set(alive.map(i=>i.col))];
      const col=cols[Math.floor(Math.random()*cols.length)];
      const colInvs=alive.filter(i=>i.col===col).sort((a,b)=>b.z-a.z);
      if(colInvs.length) spawnEBullet(colInvs[0]);
    }
  }

  checkCollisions();

  // Hover animation
  grid.forEach(inv=>{
    if(!inv.alive)return;
    inv.mesh.position.y=inv.y+Math.sin(frame*0.04+inv.col*0.7)*0.1;
  });

  // Wave clear
  if(!waveCleared&&grid.every(i=>!i.alive)){
    waveCleared=true; if(ufo){scene.remove(ufo.mesh);ufo=null;} saveHi();
    spawnExplosion(0,3,-5,0xffffff); beep(523,0.08);beep(659,0.1);beep(784,0.25);
    startTransition(`WAVE ${level} CLEAR!`,()=>nextLevel());
  }
}

function stepInvaders(){
  const alive=grid.filter(i=>i.alive);
  if(!alive.length)return;
  const maxX=Math.max(...alive.map(i=>i.x));
  const minX=Math.min(...alive.map(i=>i.x));
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
  // Bullets vs UFO
  if(ufo){
    for(let bi=bullets.length-1;bi>=0;bi--){
      const b=bullets[bi];
      if(dXZ(b,ufo)<1.3&&Math.abs(b.y-ufo.y)<1.0){
        const p=ufo.pts*mult(); score+=p; saveHi();
        spawnFloat(ufo.x,ufo.y+1,ufo.z,`+${p}`,'#ff3366');
        spawnExplosion(ufo.x,ufo.y,ufo.z,0xff3366);
        beep(880,0.08);beep(660,0.12);beep(440,0.18);
        addStreak(ufo.x,ufo.y,ufo.z);
        scene.remove(ufo.mesh);ufo=null;scene.remove(b.mesh);bullets.splice(bi,1);break;
      }
    }
  }

  // Bullets vs invaders
  outer:for(let bi=bullets.length-1;bi>=0;bi--){
    const b=bullets[bi];
    for(const inv of grid){
      if(!inv.alive)continue;
      if(dXZ(b,inv)<0.92&&Math.abs(b.y-inv.y)<3.0){
        inv.alive=false;inv.mesh.visible=false;
        scene.remove(b.mesh);bullets.splice(bi,1);
        const p=(inv.type==='A'?30:inv.type==='B'?20:10)*mult();
        score+=p;saveHi();
        invTick=Math.max(4,invTick-0.3);
        spawnExplosion(inv.x,inv.y,inv.z,new THREE.Color(CH[inv.type]).getHex());
        spawnFloat(inv.x,inv.y+0.9,inv.z,`+${p}`,CH[inv.type]);
        beep(250+Math.random()*250,0.14);
        maybeDrop(inv.x,inv.y,inv.z);
        addStreak(inv.x,inv.y,inv.z);
        continue outer;
      }
    }
  }

  // Bullets vs barriers
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

  // Enemy bullets vs barriers & player
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
    if(dXZ(b,{x:playerX,z:PLAYER_Z})<1.2&&Math.abs(b.y-0.5)<0.8){
      lives--;shakeTimer=10;shakeAmt=0.18;beep(80,0.45,'sawtooth');
      scene.remove(b.mesh);eBullets.splice(i,1);updateHUD();
      if(lives<=0){state='dead';saveHi();showOverlay('GAME OVER',String(score).padStart(6,'0'),'TAP TO RETRY');}
    }
  }

  // Invaders crush barriers
  for(const inv of grid){
    if(!inv.alive)continue;
    for(const bar of barriers)
      if(bar.hp>0&&dXZ(inv,bar)<0.75)bar.hp=0,bar.mesh.visible=false;
  }
}

// ── Title idle animation ───────────────────────────────────────────────────
let idleT = 0;
function idleAnimate(){
  idleT += 0.008;
  camera.position.x = Math.sin(idleT*0.4)*2.5;
  camera.position.y = 10 + Math.sin(idleT*0.3)*0.5;
  camera.lookAt(0,2,0);
  grid.forEach((inv,i)=>{
    if(!inv.alive)return;
    inv.mesh.position.y=inv.y+Math.sin(idleT*2+i*0.4)*0.12;
    inv.mesh.rotation.y=Math.sin(idleT*1.5+i*0.2)*0.18;
  });
}

// ── Render loop ───────────────────────────────────────────────────────────
function animate(){
  requestAnimationFrame(animate);
  if(state==='playing') update();
  else if(state==='title') idleAnimate();
  else if(state==='dead'){ updateParticles(); updateFloats(); }
  if(shakeTimer>0){
    shakeTimer--;
    camera.position.x+=(Math.random()-0.5)*shakeAmt;
    camera.position.y+=(Math.random()-0.5)*shakeAmt*0.5;
  }
  renderer.render(scene,camera);
}

// ── Init ──────────────────────────────────────────────────────────────────
initGrid();
showOverlay('LEGACY<br>INVADER 3D','SLIDE・TAP to play','TAP TO START');
animate();
