const canvas = document.getElementById('canvas');
const ctx    = canvas.getContext('2d');

// ── Colors ────────────────────────────────────────────────────────────────
const INV_COLOR = { A: '#ff6b6b', B: '#ffd93d', C: '#6bcb77' };
const INV_GLOW  = { A: '#ff2222', B: '#ffaa00', C: '#22ff55' };
const PU_COLOR  = { rapid: '#ffcc00', triple: '#00e5ff', life: '#ff4d8b', bomb: '#bf5fff' };
const PU_LABEL  = { rapid: '⚡', triple: '≡', life: '♥', bomb: '✸' };
const PU_TYPES  = ['rapid', 'triple', 'life', 'bomb'];

// ── Sizing ────────────────────────────────────────────────────────────────
function resize() {
  canvas.width  = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
  if (state !== 'title') { player.init(); initGrid(); initBarriers(); }
}
window.addEventListener('resize', resize);

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

// ── State ─────────────────────────────────────────────────────────────────
let state   = 'title';
let score   = 0;
let hiscore = 0;
let lives   = 3;
let level   = 1;
let frame   = 0;

function action() {
  if (state === 'title' || state === 'dead') startGame();
  else if (state === 'win') nextLevel();
}

// ── Input ─────────────────────────────────────────────────────────────────
const inp = { left: false, right: false, shoot: false };

window.addEventListener('keydown', e => {
  if (e.code === 'ArrowLeft'  || e.code === 'KeyA') inp.left  = true;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') inp.right = true;
  if (e.code === 'Space') { e.preventDefault(); inp.shoot = true; }
  if (e.code === 'Enter') action();
});
window.addEventListener('keyup', e => {
  if (e.code === 'ArrowLeft'  || e.code === 'KeyA') inp.left  = false;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') inp.right = false;
  if (e.code === 'Space') inp.shoot = false;
});

let activePtr   = null;
let touchStartX = 0;
let touchMoved  = false;

canvas.style.touchAction = 'none';

canvas.addEventListener('pointerdown', e => {
  e.preventDefault();
  if (_ac && _ac.state === 'suspended') _ac.resume();
  if (state !== 'playing') { action(); return; }
  if (activePtr === null) {
    activePtr = e.pointerId;
    canvas.setPointerCapture(e.pointerId);
    touchStartX = e.clientX;
    touchMoved  = false;
  }
});
canvas.addEventListener('pointermove', e => {
  if (e.pointerId !== activePtr) return;
  const rect = canvas.getBoundingClientRect();
  const cx = (e.clientX - rect.left) * (canvas.width / rect.width);
  player.x = Math.max(0, Math.min(canvas.width - player.w, cx - player.w / 2));
  if (Math.abs(e.clientX - touchStartX) > 8) touchMoved = true;
});
canvas.addEventListener('pointerup', e => {
  if (e.pointerId !== activePtr) return;
  activePtr = null;
  if (!touchMoved && state === 'playing') inp.shoot = true;
});
canvas.addEventListener('pointercancel', e => {
  if (e.pointerId === activePtr) activePtr = null;
});

const fireBtn = document.getElementById('btn-shoot');
fireBtn.addEventListener('pointerdown', e => {
  e.preventDefault();
  if (_ac && _ac.state === 'suspended') _ac.resume();
  action();
  inp.shoot = true;
});
fireBtn.addEventListener('pointerup',     () => inp.shoot = false);
fireBtn.addEventListener('pointercancel', () => inp.shoot = false);
fireBtn.addEventListener('pointerleave',  () => inp.shoot = false);

// ── Player ────────────────────────────────────────────────────────────────
const player = {
  x: 0, y: 0, w: 0, h: 0, speed: 0,
  init() {
    this.w     = Math.max(28, canvas.width  * 0.08);
    this.h     = Math.max(16, canvas.height * 0.045);
    this.speed = Math.max(2,  canvas.width  * 0.006);
    this.x     = canvas.width  / 2 - this.w / 2;
    this.y     = canvas.height - this.h - Math.max(6, canvas.height * 0.04);
  },
};

let bullets       = [];
let shootCooldown = 0;

// ── Power-up state ────────────────────────────────────────────────────────
let rapidTimer  = 0; // frames remaining
let tripleTimer = 0;

// ── Particles ─────────────────────────────────────────────────────────────
let particles = [];
function spawnExplosion(x, y, color, count = 14) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 0.8 + Math.random() * 3.5;
    particles.push({
      x, y,
      vx: Math.cos(a) * s, vy: Math.sin(a) * s - 0.5,
      life: 1.0, decay: 0.025 + Math.random() * 0.025,
      r: 1.5 + Math.random() * 3, color,
    });
  }
}

// ── Power-up drops ────────────────────────────────────────────────────────
let powerUps = [];
function maybeDrop(cx, y) {
  if (Math.random() > 0.18) return;
  const type = PU_TYPES[Math.floor(Math.random() * PU_TYPES.length)];
  const w = Math.max(36, canvas.width * 0.09);
  const h = w * 0.42;
  powerUps.push({ x: cx - w / 2, y, w, h, type, vy: Math.max(1.2, canvas.height * 0.0025) });
}

// ── Screen effects ────────────────────────────────────────────────────────
let flashTimer = 0, shakeTimer = 0, shakeAmt = 0;
function hitFlash()  { flashTimer = 12; shakeTimer = 10; shakeAmt = 5; }
function bombShake() { shakeTimer = 18; shakeAmt = 9; }

// ── Invaders ──────────────────────────────────────────────────────────────
const ROWS = 5, COLS = 11;
let grid = [];
let invDir = 1, invStep = 0, invDrop = 0, invTick = 0, invTimer = 0;
let eBullets = [], eShootTimer = 0, eShootInterval = 0;

function initGrid() {
  grid = [];
  const margin = canvas.width * 0.04;
  const cw = (canvas.width - margin * 2) / COLS;
  const ch = cw * 0.78;
  const startY = canvas.height * 0.10;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      grid.push({
        x: margin + c * cw + cw * 0.1, y: startY + r * ch,
        w: cw * 0.8, h: ch * 0.75,
        row: r, col: c, alive: true, af: 0,
        type: r === 0 ? 'A' : r < 3 ? 'B' : 'C',
      });
    }
  }
  invStep = Math.max(1, canvas.width * 0.012 * (1 + (level - 1) * 0.2));
  invDrop = Math.max(4, canvas.height * 0.025);
  invTick = Math.max(4, 22 - (level - 1) * 2);
  invTimer = invTick; invDir = 1; eBullets = [];
  eShootInterval = Math.max(35, 100 - level * 8);
  eShootTimer = eShootInterval;
}

// ── Barriers ──────────────────────────────────────────────────────────────
let barriers = [];
function initBarriers() {
  barriers = [];
  const count = 4, bw = Math.max(36, canvas.width * 0.09);
  const gap = (canvas.width - count * bw) / (count + 1);
  const by = player.y - Math.max(10, canvas.height * 0.08);
  const bs = Math.max(3, Math.round(bw / 5));
  const bcols = Math.round(bw / bs);
  for (let i = 0; i < count; i++) {
    const bx = gap + i * (bw + gap);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < bcols; c++) {
        if (r === 0 && (c === 0 || c === bcols - 1)) continue;
        barriers.push({ x: bx + c * bs, y: by + r * bs, s: bs, hp: 4 });
      }
    }
  }
}

// ── Collision ─────────────────────────────────────────────────────────────
function hit(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

// ── Game flow ─────────────────────────────────────────────────────────────
function startGame() {
  score = 0; lives = 3; level = 1; state = 'playing'; frame = 0;
  bullets = []; shootCooldown = 0;
  powerUps = []; particles = [];
  rapidTimer = 0; tripleTimer = 0;
  flashTimer = 0; shakeTimer = 0;
  player.init(); initGrid(); initBarriers();
}

function nextLevel() {
  level++; state = 'playing'; frame = 0;
  bullets = []; shootCooldown = 0;
  powerUps = []; particles = [];
  rapidTimer = 0; tripleTimer = 0;
  player.init(); initGrid(); initBarriers();
}

// ── Power-up collect ──────────────────────────────────────────────────────
function collectPowerUp(type, cx, cy) {
  spawnExplosion(cx, cy, PU_COLOR[type], 22);
  beep(660, 0.06); beep(880, 0.1); beep(1100, 0.15);

  if (type === 'rapid') {
    rapidTimer = 60 * 8;
  } else if (type === 'triple') {
    tripleTimer = 60 * 8;
  } else if (type === 'life') {
    lives = Math.min(5, lives + 1);
  } else if (type === 'bomb') {
    const alive = grid.filter(i => i.alive).sort((a, b) => b.row - a.row);
    const maxRow = alive.length ? alive[0].row : 0;
    grid.forEach(inv => {
      if (!inv.alive || inv.row < maxRow - 1) return;
      inv.alive = false;
      spawnExplosion(inv.x + inv.w / 2, inv.y + inv.h / 2, INV_COLOR[inv.type], 10);
      score += inv.type === 'A' ? 30 : inv.type === 'B' ? 20 : 10;
    });
    if (score > hiscore) hiscore = score;
    bombShake();
    beep(100, 0.4, 'sawtooth');
  }
}

// ── Update ────────────────────────────────────────────────────────────────
function update() {
  frame++;
  if (flashTimer  > 0) flashTimer--;
  if (shakeTimer  > 0) shakeTimer--;
  if (rapidTimer  > 0) rapidTimer--;
  if (tripleTimer > 0) tripleTimer--;

  // Player move
  if (inp.left)  player.x = Math.max(0, player.x - player.speed);
  if (inp.right) player.x = Math.min(canvas.width - player.w, player.x + player.speed);

  // Shoot
  if (shootCooldown > 0) shootCooldown--;
  const maxB = rapidTimer > 0 ? 3 : 1;
  const cd   = rapidTimer > 0 ? 4 : 12;
  if (inp.shoot && bullets.length < maxB && shootCooldown === 0) {
    const bx  = player.x + player.w / 2;
    const bw  = Math.max(2, canvas.width * 0.007);
    const bh  = Math.max(8, canvas.height * 0.028);
    const bvy = canvas.height * 0.015;
    if (tripleTimer > 0) {
      const sp = canvas.width * 0.028;
      [[-sp, -1.5], [0, 0], [sp, 1.5]].forEach(([dx, vx]) => {
        bullets.push({ x: bx + dx, y: player.y, w: bw, h: bh, vy: bvy, vx });
      });
    } else {
      bullets.push({ x: bx, y: player.y, w: bw, h: bh, vy: bvy, vx: 0 });
    }
    beep(tripleTimer > 0 ? 700 : 900, 0.07);
    shootCooldown = cd;
  }
  // Tap-to-shoot fires for one frame only
  if (inp.shoot && activePtr === null) inp.shoot = false;

  // Move player bullets
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.y -= b.vy;
    if (b.vx) b.x += b.vx;
    if (b.y + b.h < 0 || b.x < -60 || b.x > canvas.width + 60) bullets.splice(i, 1);
  }

  // Move enemy bullets
  for (let i = eBullets.length - 1; i >= 0; i--) {
    eBullets[i].y += eBullets[i].vy;
    if (eBullets[i].y > canvas.height) eBullets.splice(i, 1);
  }

  // Particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy; p.vy += 0.1;
    p.life -= p.decay;
    if (p.life <= 0) particles.splice(i, 1);
  }

  // Power-ups
  for (let i = powerUps.length - 1; i >= 0; i--) {
    const pu = powerUps[i];
    pu.y += pu.vy;
    if (pu.y > canvas.height) { powerUps.splice(i, 1); continue; }
    if (hit(pu.x, pu.y, pu.w, pu.h, player.x, player.y, player.w, player.h)) {
      collectPowerUp(pu.type, pu.x + pu.w / 2, pu.y + pu.h / 2);
      powerUps.splice(i, 1);
    }
  }

  // Invader tick
  if (--invTimer <= 0) {
    invTimer = Math.max(2, invTick);
    stepInvaders();
    if (state !== 'playing') return;
  }

  // Enemy shoot
  if (--eShootTimer <= 0) {
    eShootTimer = eShootInterval + Math.floor(Math.random() * eShootInterval * 0.5);
    const col = Math.floor(Math.random() * COLS);
    const src = grid.filter(i => i.alive && i.col === col).sort((a, b) => b.row - a.row)[0]
             || grid.find(i => i.alive);
    if (src) {
      eBullets.push({
        x: src.x + src.w / 2, y: src.y + src.h,
        w: Math.max(2, canvas.width * 0.006),
        h: Math.max(6, canvas.height * 0.022),
        vy: Math.max(2, canvas.height * 0.007 * (1 + (level - 1) * 0.18)),
      });
      beep(160, 0.13, 'sawtooth', 0.05);
    }
  }

  checkCollisions();

  if (grid.every(i => !i.alive)) {
    state = 'win';
    if (score > hiscore) hiscore = score;
    spawnExplosion(canvas.width / 2, canvas.height * 0.4, '#fff', 40);
    beep(523, 0.08); beep(659, 0.1); beep(784, 0.25);
  }
}

function stepInvaders() {
  const alive = grid.filter(i => i.alive);
  if (!alive.length) return;
  alive.forEach(i => { i.af ^= 1; });

  const right = Math.max(...alive.map(i => i.x + i.w));
  const left  = Math.min(...alive.map(i => i.x));
  const margin = canvas.width * 0.01;
  let drop = false;
  if (invDir ===  1 && right + invStep > canvas.width - margin) { invDir = -1; drop = true; }
  if (invDir === -1 && left  - invStep < margin)                { invDir =  1; drop = true; }

  alive.forEach(i => {
    if (drop) i.y += invDrop;
    i.x += invStep * invDir;
    if (i.y + i.h > player.y + player.h * 0.4) {
      state = 'dead';
      if (score > hiscore) hiscore = score;
    }
  });
}

function checkCollisions() {
  // Player bullets vs invaders
  outer: for (let bi = bullets.length - 1; bi >= 0; bi--) {
    const b = bullets[bi];
    for (const inv of grid) {
      if (!inv.alive) continue;
      if (hit(b.x - b.w / 2, b.y, b.w, b.h, inv.x, inv.y, inv.w, inv.h)) {
        inv.alive = false;
        bullets.splice(bi, 1);
        score += inv.type === 'A' ? 30 : inv.type === 'B' ? 20 : 10;
        if (score > hiscore) hiscore = score;
        invTick = Math.max(2, invTick - 0.4);
        spawnExplosion(inv.x + inv.w / 2, inv.y + inv.h / 2, INV_COLOR[inv.type]);
        beep(250 + Math.random() * 250, 0.14);
        maybeDrop(inv.x + inv.w / 2, inv.y + inv.h);
        continue outer;
      }
    }
  }

  // Player bullets vs barriers
  outer2: for (let bi = bullets.length - 1; bi >= 0; bi--) {
    const b = bullets[bi];
    for (const bar of barriers) {
      if (bar.hp <= 0) continue;
      if (hit(b.x - b.w / 2, b.y, b.w, b.h, bar.x, bar.y, bar.s, bar.s)) {
        bar.hp--; bullets.splice(bi, 1); continue outer2;
      }
    }
  }

  // Enemy bullets vs barriers & player
  for (let i = eBullets.length - 1; i >= 0; i--) {
    const eb = eBullets[i], bx = eb.x - eb.w / 2;
    let blocked = false;
    for (const bar of barriers) {
      if (bar.hp <= 0) continue;
      if (hit(bx, eb.y, eb.w, eb.h, bar.x, bar.y, bar.s, bar.s)) {
        bar.hp--; eBullets.splice(i, 1); blocked = true; break;
      }
    }
    if (blocked) continue;
    if (hit(bx, eb.y, eb.w, eb.h, player.x, player.y, player.w, player.h)) {
      eBullets.splice(i, 1);
      lives--;
      hitFlash();
      beep(80, 0.45, 'sawtooth');
      if (lives <= 0) { state = 'dead'; if (score > hiscore) hiscore = score; return; }
    }
  }

  // Invaders vs barriers
  for (const inv of grid) {
    if (!inv.alive) continue;
    for (const bar of barriers) {
      if (bar.hp > 0 && hit(inv.x, inv.y, inv.w, inv.h, bar.x, bar.y, bar.s, bar.s)) bar.hp = 0;
    }
  }
}

// ── Drawing helpers ───────────────────────────────────────────────────────
function setGlow(color, blur) { ctx.shadowColor = color; ctx.shadowBlur = blur; }
function noGlow() { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; }

// ── Invader drawing ───────────────────────────────────────────────────────
function drawInvader({ x, y, w, h, type, af }) {
  ctx.save();
  setGlow(INV_GLOW[type], 14);
  ctx.fillStyle = INV_COLOR[type];

  if (type === 'A') {
    ctx.fillRect(x+w*.3,  y,       w*.4, h*.2);
    ctx.fillRect(x+w*.1,  y+h*.2,  w*.8, h*.5);
    ctx.fillRect(x,       y+h*.38, w,    h*.32);
    if (af === 0) { ctx.fillRect(x,       y+h*.7, w*.18,h*.3); ctx.fillRect(x+w*.82,y+h*.7,w*.18,h*.3); }
    else          { ctx.fillRect(x+w*.12, y+h*.7, w*.18,h*.3); ctx.fillRect(x+w*.7, y+h*.7,w*.18,h*.3); }
    noGlow(); ctx.fillStyle = '#050510';
    ctx.fillRect(x+w*.25,y+h*.3,w*.14,h*.2); ctx.fillRect(x+w*.61,y+h*.3,w*.14,h*.2);
  } else if (type === 'B') {
    ctx.fillRect(x+w*.2,  y,       w*.6, h*.18);
    ctx.fillRect(x+w*.1,  y+h*.18, w*.8, h*.55);
    ctx.fillRect(x,       y+h*.32, w,    h*.38);
    if (af === 0) { ctx.fillRect(x,       y+h*.7, w*.16,h*.3); ctx.fillRect(x+w*.38,y+h*.68,w*.24,h*.32); ctx.fillRect(x+w*.84,y+h*.7,w*.16,h*.3); }
    else          { ctx.fillRect(x+w*.1,  y+h*.7, w*.16,h*.3); ctx.fillRect(x+w*.38,y+h*.68,w*.24,h*.32); ctx.fillRect(x+w*.74,y+h*.7,w*.16,h*.3); }
    noGlow(); ctx.fillStyle = '#050510';
    ctx.fillRect(x+w*.26,y+h*.22,w*.14,h*.2); ctx.fillRect(x+w*.6,y+h*.22,w*.14,h*.2);
  } else {
    ctx.fillRect(x+w*.15, y,       w*.7, h*.5);
    ctx.fillRect(x,       y+h*.28, w,    h*.42);
    if (af === 0) { ctx.fillRect(x,       y+h*.7,  w*.22,h*.3); ctx.fillRect(x+w*.3, y+h*.65,w*.16,h*.35); ctx.fillRect(x+w*.54,y+h*.65,w*.16,h*.35); ctx.fillRect(x+w*.78,y+h*.7, w*.22,h*.3); }
    else          { ctx.fillRect(x+w*.1,  y+h*.7,  w*.22,h*.3); ctx.fillRect(x+w*.3, y+h*.65,w*.16,h*.35); ctx.fillRect(x+w*.54,y+h*.65,w*.16,h*.35); ctx.fillRect(x+w*.68,y+h*.7, w*.22,h*.3); }
    noGlow(); ctx.fillStyle = '#050510';
    ctx.fillRect(x+w*.3, y+h*.1,w*.12,h*.22); ctx.fillRect(x+w*.58,y+h*.1,w*.12,h*.22);
  }
  ctx.restore();
}

// ── Player drawing ────────────────────────────────────────────────────────
function drawPlayer() {
  const { x, y, w, h } = player;
  const col = rapidTimer > 0 ? '#ffcc00' : tripleTimer > 0 ? '#00e5ff' : '#4fc3f7';
  const glw = rapidTimer > 0 ? '#ff8800' : tripleTimer > 0 ? '#00aaff' : '#0088cc';
  ctx.save();
  setGlow(glw, 18);
  ctx.fillStyle = col;
  ctx.fillRect(x+w*.44, y,       w*.12, h*.38);
  ctx.fillRect(x+w*.18, y+h*.32, w*.64, h*.42);
  ctx.fillRect(x,       y+h*.56, w,     h*.44);
  ctx.restore();
}

// ── Particles ─────────────────────────────────────────────────────────────
function drawParticles() {
  particles.forEach(p => {
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life);
    setGlow(p.color, 6);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(0.5, p.r * p.life), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
  noGlow();
}

// ── Power-up items ────────────────────────────────────────────────────────
function drawPowerUps() {
  powerUps.forEach(pu => {
    const pulse = 0.7 + 0.3 * Math.sin(frame * 0.15);
    ctx.save();
    setGlow(PU_COLOR[pu.type], 18 * pulse);
    ctx.fillStyle = 'rgba(5,5,20,0.85)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(pu.x, pu.y, pu.w, pu.h, pu.h / 2);
    else ctx.rect(pu.x, pu.y, pu.w, pu.h);
    ctx.fill();
    ctx.strokeStyle = PU_COLOR[pu.type];
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(pu.x, pu.y, pu.w, pu.h, pu.h / 2);
    else ctx.rect(pu.x, pu.y, pu.w, pu.h);
    ctx.stroke();
    noGlow();
    ctx.fillStyle = PU_COLOR[pu.type];
    ctx.font = `bold ${Math.round(pu.h * 0.62)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(PU_LABEL[pu.type], pu.x + pu.w / 2, pu.y + pu.h / 2);
    ctx.restore();
  });
}

// ── Active power-up timer bars ────────────────────────────────────────────
function drawPowerUpBars() {
  const bw = Math.min(160, canvas.width * 0.34);
  const bh = Math.max(5, canvas.height * 0.013);
  const bx = canvas.width / 2 - bw / 2;
  const fs = Math.max(7, bh * 0.9);
  let by = canvas.height * 0.062;

  const renderBar = (timer, maxT, color, label) => {
    ctx.save();
    setGlow(color, 8);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = color;
    ctx.fillRect(bx, by, bw * (timer / maxT), bh);
    noGlow();
    ctx.fillStyle = color;
    ctx.font = `${fs}px monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(label, canvas.width / 2, by + bh + 1);
    ctx.restore();
    by += bh + Math.max(14, bh * 2.8);
  };

  if (rapidTimer  > 0) renderBar(rapidTimer,  60 * 8, PU_COLOR.rapid,  PU_LABEL.rapid  + ' RAPID');
  if (tripleTimer > 0) renderBar(tripleTimer, 60 * 8, PU_COLOR.triple, PU_LABEL.triple + ' TRIPLE');
}

// ── Background ────────────────────────────────────────────────────────────
function drawBackground() {
  // Grid
  const gs = Math.max(28, canvas.width * 0.07);
  ctx.strokeStyle = 'rgba(0,50,200,0.055)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= canvas.width;  x += gs) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,canvas.height); ctx.stroke(); }
  for (let y = 0; y <= canvas.height; y += gs) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(canvas.width,y); ctx.stroke(); }

  // Stars (twinkling)
  for (let i = 0; i < 70; i++) {
    const sx = (i * 173.7 + 19) % canvas.width;
    const sy = (i * 97.1  + i * i * 0.11) % (canvas.height * 0.95);
    const tw = 0.3 + 0.7 * Math.abs(Math.sin(frame * 0.018 + i * 0.85));
    ctx.globalAlpha = tw * (0.3 + (i % 3) * 0.15);
    ctx.fillStyle = '#fff';
    ctx.fillRect(sx, sy, 1 + i % 2, 1 + i % 2);
  }
  ctx.globalAlpha = 1;
}

// ── HUD ───────────────────────────────────────────────────────────────────
function drawHUD() {
  const fs = Math.max(9, Math.min(15, canvas.height * 0.032));
  ctx.font = `${fs}px 'Press Start 2P', monospace`;
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'left';
  ctx.fillText(String(score).padStart(6, '0'), canvas.width * 0.02, canvas.height * 0.015);
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(150,150,210,0.5)';
  ctx.fillText(`HI ${String(hiscore).padStart(6, '0')}`, canvas.width * 0.98, canvas.height * 0.015);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff4d8b';
  ctx.fillText('♥'.repeat(Math.max(0, lives)), canvas.width / 2, canvas.height * 0.015);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
}

// ── Title screen ──────────────────────────────────────────────────────────
function drawTitle() {
  const cx = canvas.width / 2;
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';

  ctx.save();
  setGlow('#00aaff', 34);
  ctx.fillStyle = '#00e5ff';
  ctx.font = `bold ${Math.min(50, canvas.height * 0.074)}px 'Press Start 2P', monospace`;
  ctx.fillText('LEGACY', cx, canvas.height * 0.26);
  setGlow('#ffffff', 20);
  ctx.fillStyle = '#ffffff';
  ctx.fillText('INVADER', cx, canvas.height * 0.37);
  ctx.restore();

  // Score table
  const fs = Math.max(7, canvas.height * 0.023);
  ctx.font = `${fs}px 'Press Start 2P', monospace`;
  const sy = canvas.height * 0.49;
  (['A','B','C']).forEach((t, i) => {
    const pts = t === 'A' ? 30 : t === 'B' ? 20 : 10;
    ctx.save(); setGlow(INV_GLOW[t], 10);
    ctx.fillStyle = INV_COLOR[t];
    ctx.fillText(`▼  ${pts} pts`, cx, sy + i * fs * 2.3);
    ctx.restore();
  });

  // Power-up legend
  const pfs = Math.max(7, canvas.height * 0.021);
  ctx.font = `${pfs}px monospace`;
  const py = canvas.height * 0.66;
  const pw = canvas.width * 0.36;
  [['⚡ RAPID','rapid'],['≡ TRIPLE','triple'],['♥ LIFE','life'],['✸ BOMB','bomb']].forEach(([lbl, key], i) => {
    ctx.save(); setGlow(PU_COLOR[key], 8); ctx.fillStyle = PU_COLOR[key];
    ctx.fillText(lbl, cx + (i % 2 === 0 ? -pw/2 : pw/2), py + Math.floor(i/2) * pfs * 2.4);
    ctx.restore();
  });

  ctx.fillStyle = '#ffd93d';
  ctx.font = `${Math.max(8, canvas.height * 0.026)}px 'Press Start 2P', monospace`;
  ctx.fillText('TAP TO START', cx, canvas.height * 0.85);
  ctx.fillStyle = 'rgba(150,150,190,0.65)';
  ctx.font = `${Math.max(7, canvas.height * 0.019)}px monospace`;
  ctx.fillText('SLIDE to move  /  TAP to shoot', cx, canvas.height * 0.91);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}

// ── Overlay (game over / win) ─────────────────────────────────────────────
function drawOverlay(title, sub, hint, tc) {
  ctx.fillStyle = 'rgba(0,0,0,0.68)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const cx = canvas.width / 2;
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';

  ctx.save(); setGlow(tc, 30);
  ctx.fillStyle = tc;
  ctx.font = `bold ${Math.min(42, canvas.height * 0.063)}px 'Press Start 2P', monospace`;
  ctx.fillText(title, cx, canvas.height * 0.37);
  ctx.restore();

  ctx.fillStyle = '#fff';
  ctx.font = `${Math.max(9, canvas.height * 0.028)}px 'Press Start 2P', monospace`;
  ctx.fillText(sub, cx, canvas.height * 0.51);
  ctx.fillStyle = '#ffd93d';
  ctx.font = `${Math.max(7, canvas.height * 0.021)}px monospace`;
  ctx.fillText(hint, cx, canvas.height * 0.62);
  ctx.textAlign = 'left';
}

// ── Main draw ─────────────────────────────────────────────────────────────
function draw() {
  const sx = shakeTimer > 0 ? (Math.random() - 0.5) * shakeAmt : 0;
  const sy = shakeTimer > 0 ? (Math.random() - 0.5) * shakeAmt : 0;

  ctx.save();
  ctx.translate(sx, sy);
  ctx.clearRect(-20, -20, canvas.width + 40, canvas.height + 40);
  ctx.fillStyle = '#050510';
  ctx.fillRect(-20, -20, canvas.width + 40, canvas.height + 40);

  drawBackground();

  if (flashTimer > 0) {
    ctx.fillStyle = `rgba(255,50,50,${(flashTimer / 12) * 0.28})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  if (state === 'title') { drawTitle(); ctx.restore(); return; }

  drawHUD();
  drawPowerUpBars();

  // Ground line
  ctx.save(); setGlow('#4fc3f7', 8); ctx.fillStyle = '#4fc3f7';
  ctx.fillRect(0, player.y + player.h + 2, canvas.width, 2);
  ctx.restore();

  // Barriers
  barriers.forEach(b => {
    if (b.hp <= 0) return;
    const a = 0.25 + (b.hp / 4) * 0.75;
    ctx.save(); setGlow('#00ff66', 5 * a);
    ctx.fillStyle = `rgba(80,220,120,${a})`;
    ctx.fillRect(b.x, b.y, b.s, b.s);
    ctx.restore();
  });

  grid.forEach(inv => { if (inv.alive) drawInvader(inv); });

  if (state !== 'dead' || frame % 10 < 6) drawPlayer();

  // Player bullets
  const bc = tripleTimer > 0 ? '#00e5ff' : rapidTimer > 0 ? '#ffcc00' : '#ffffff';
  const bg = tripleTimer > 0 ? '#00aaff' : rapidTimer > 0 ? '#ff8800' : '#8888ff';
  ctx.save(); setGlow(bg, 10); ctx.fillStyle = bc;
  bullets.forEach(b => ctx.fillRect(b.x - b.w / 2, b.y, b.w, b.h));
  ctx.restore();

  // Enemy bullets
  ctx.save(); setGlow('#ff2200', 8); ctx.fillStyle = '#ff5544';
  eBullets.forEach(b => ctx.fillRect(b.x - b.w / 2, b.y, b.w, b.h));
  ctx.restore();

  drawPowerUps();
  drawParticles();

  if (state === 'dead') drawOverlay('GAME OVER', String(score).padStart(6,'0'), 'TAP TO RETRY',      '#ff4444');
  if (state === 'win')  drawOverlay('YOU WIN!',  String(score).padStart(6,'0'), 'TAP FOR NEXT WAVE', '#6bcb77');

  ctx.restore();
}

// ── Loop ──────────────────────────────────────────────────────────────────
function loop() {
  if (state === 'playing') update();
  draw();
  requestAnimationFrame(loop);
}

resize();
loop();
