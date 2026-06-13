const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// ── Sizing ──────────────────────────────────────────────────────────────
function resize() {
  canvas.width  = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
  if (state !== 'title') {
    player.init();
    initGrid();
    initBarriers();
  }
}

window.addEventListener('resize', resize);

// ── Audio ────────────────────────────────────────────────────────────────
let _ac;
function ac() {
  return _ac || (_ac = new (window.AudioContext || window.webkitAudioContext)());
}
function beep(freq, dur, type = 'square', vol = 0.07) {
  try {
    const o = ac().createOscillator(), g = ac().createGain();
    o.connect(g); g.connect(ac().destination);
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, ac().currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac().currentTime + dur);
    o.start(); o.stop(ac().currentTime + dur);
  } catch (e) {}
}

// ── Input ────────────────────────────────────────────────────────────────
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

function btn(id, down, up) {
  const el = document.getElementById(id);
  const d = ev => { ev.preventDefault(); down(); };
  const u = ev => { ev.preventDefault(); if (up) up(); };
  el.addEventListener('touchstart',  d, { passive: false });
  el.addEventListener('touchend',    u, { passive: false });
  el.addEventListener('touchcancel', u, { passive: false });
  el.addEventListener('mousedown', d);
  el.addEventListener('mouseup',   u);
  el.addEventListener('mouseleave', u);
}

btn('btn-left',
  () => inp.left  = true,
  () => inp.left  = false
);
btn('btn-right',
  () => inp.right = true,
  () => inp.right = false
);
btn('btn-shoot',
  () => { inp.shoot = true;  action(); },
  () => inp.shoot = false
);

// ── State ────────────────────────────────────────────────────────────────
let state   = 'title'; // title | playing | dead | win
let score   = 0;
let hiscore = 0;
let lives   = 3;
let level   = 1;
let frame   = 0;

function action() {
  if (state === 'title' || state === 'dead') startGame();
  else if (state === 'win') nextLevel();
}

// ── Player ───────────────────────────────────────────────────────────────
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

let bullet       = null; // single player bullet
let shootCooldown = 0;

// ── Invaders ─────────────────────────────────────────────────────────────
const ROWS = 5, COLS = 11;
let grid = [];
let invDir  = 1;
let invStep = 0;   // px per step
let invDrop = 0;   // px to drop when wall hit
let invTick = 0;   // frames between steps (decreases as aliens die)
let invTimer = 0;
let eBullets = [];
let eShootTimer = 0, eShootInterval = 0;

function initGrid() {
  grid = [];
  const margin = canvas.width * 0.04;
  const cw     = (canvas.width - margin * 2) / COLS;
  const ch     = cw * 0.78;
  const startY = canvas.height * 0.10;

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      grid.push({
        x: margin + c * cw + cw * 0.1,
        y: startY + r * ch,
        w: cw * 0.8,
        h: ch * 0.75,
        row: r, col: c,
        alive: true,
        af: 0,
        type: r === 0 ? 'A' : r < 3 ? 'B' : 'C',
      });
    }
  }

  invStep  = Math.max(1, canvas.width  * 0.012 * (1 + (level - 1) * 0.2));
  invDrop  = Math.max(4, canvas.height * 0.025);
  invTick  = Math.max(4, 22 - (level - 1) * 2);
  invTimer = invTick;
  invDir   = 1;
  eBullets = [];
  eShootInterval = Math.max(35, 100 - level * 8);
  eShootTimer    = eShootInterval;
}

// ── Barriers ─────────────────────────────────────────────────────────────
let barriers = [];
function initBarriers() {
  barriers = [];
  const count = 4;
  const bw  = Math.max(36, canvas.width * 0.09);
  const gap = (canvas.width - count * bw) / (count + 1);
  const by  = player.y - Math.max(10, canvas.height * 0.08);
  const bs  = Math.max(3, Math.round(bw / 5));
  const bcols = Math.round(bw / bs);
  const brows = 3;

  for (let i = 0; i < count; i++) {
    const bx = gap + i * (bw + gap);
    for (let r = 0; r < brows; r++) {
      for (let c = 0; c < bcols; c++) {
        if (r === 0 && (c === 0 || c === bcols - 1)) continue;
        barriers.push({ x: bx + c * bs, y: by + r * bs, s: bs, hp: 4 });
      }
    }
  }
}

// ── AABB collision ───────────────────────────────────────────────────────
function overlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

// ── Game flow ────────────────────────────────────────────────────────────
function startGame() {
  score  = 0; lives = 3; level = 1;
  state  = 'playing'; frame = 0;
  bullet = null; shootCooldown = 0;
  player.init();
  initGrid();
  initBarriers();
}

function nextLevel() {
  level++;
  state  = 'playing'; frame = 0;
  bullet = null; shootCooldown = 0;
  player.init();
  initGrid();
  initBarriers();
}

// ── Update ───────────────────────────────────────────────────────────────
function update() {
  frame++;

  // Player move
  if (inp.left)  player.x = Math.max(0, player.x - player.speed);
  if (inp.right) player.x = Math.min(canvas.width - player.w, player.x + player.speed);

  // Player shoot
  if (shootCooldown > 0) shootCooldown--;
  if (inp.shoot && !bullet && shootCooldown === 0) {
    bullet = {
      x: player.x + player.w / 2,
      y: player.y,
      w: Math.max(2, canvas.width * 0.007),
      h: Math.max(8, canvas.height * 0.028),
      vy: canvas.height * 0.015,
    };
    beep(900, 0.07);
    shootCooldown = 12;
  }

  // Move player bullet
  if (bullet) {
    bullet.y -= bullet.vy;
    if (bullet.y + bullet.h < 0) bullet = null;
  }

  // Move enemy bullets
  for (let i = eBullets.length - 1; i >= 0; i--) {
    eBullets[i].y += eBullets[i].vy;
    if (eBullets[i].y > canvas.height) eBullets.splice(i, 1);
  }

  // Invader tick
  if (--invTimer <= 0) {
    invTimer = Math.max(2, invTick);
    stepInvaders();
    if (state !== 'playing') return;
  }

  // Enemy shoot
  if (--eShootTimer <= 0) {
    eShootTimer = eShootInterval + Math.floor(Math.random() * eShootInterval * 0.6);
    const col = Math.floor(Math.random() * COLS);
    const shooters = grid.filter(i => i.alive && i.col === col).sort((a, b) => b.row - a.row);
    const src = shooters[0] || grid.filter(i => i.alive)[0];
    if (src) {
      eBullets.push({
        x:  src.x + src.w / 2,
        y:  src.y + src.h,
        w:  Math.max(2, canvas.width  * 0.006),
        h:  Math.max(6, canvas.height * 0.022),
        vy: Math.max(2, canvas.height * 0.007 * (1 + (level - 1) * 0.18)),
      });
      beep(160, 0.13, 'sawtooth', 0.05);
    }
  }

  checkCollisions();

  if (grid.every(i => !i.alive)) {
    state = 'win';
    if (score > hiscore) hiscore = score;
    beep(523, 0.08); beep(659, 0.1); beep(784, 0.25);
  }
}

function stepInvaders() {
  const alive = grid.filter(i => i.alive);
  if (!alive.length) return;
  alive.forEach(i => { i.af ^= 1; });

  const right  = Math.max(...alive.map(i => i.x + i.w));
  const left   = Math.min(...alive.map(i => i.x));
  const margin = canvas.width * 0.01;
  let drop = false;

  if (invDir ===  1 && right + invStep > canvas.width  - margin) { invDir = -1; drop = true; }
  if (invDir === -1 && left  - invStep < margin)                  { invDir =  1; drop = true; }

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
  // Player bullet vs invaders
  if (bullet) {
    for (const inv of grid) {
      if (!inv.alive) continue;
      if (overlap(bullet.x - bullet.w/2, bullet.y, bullet.w, bullet.h,
                  inv.x, inv.y, inv.w, inv.h)) {
        inv.alive = false;
        bullet = null;
        const pts = inv.type === 'A' ? 30 : inv.type === 'B' ? 20 : 10;
        score += pts;
        if (score > hiscore) hiscore = score;
        invTick = Math.max(2, invTick - 0.4);
        beep(250 + Math.random() * 250, 0.14);
        break;
      }
    }
  }

  // Player bullet vs barriers
  if (bullet) {
    for (const b of barriers) {
      if (b.hp <= 0) continue;
      if (overlap(bullet.x - bullet.w/2, bullet.y, bullet.w, bullet.h,
                  b.x, b.y, b.s, b.s)) {
        b.hp--;
        bullet = null;
        break;
      }
    }
  }

  // Enemy bullets vs player & barriers
  for (let i = eBullets.length - 1; i >= 0; i--) {
    const eb = eBullets[i];
    const bx = eb.x - eb.w / 2;

    // vs barriers
    let blocked = false;
    for (const bar of barriers) {
      if (bar.hp <= 0) continue;
      if (overlap(bx, eb.y, eb.w, eb.h, bar.x, bar.y, bar.s, bar.s)) {
        bar.hp--;
        eBullets.splice(i, 1);
        blocked = true;
        break;
      }
    }
    if (blocked) continue;

    // vs player
    if (overlap(bx, eb.y, eb.w, eb.h, player.x, player.y, player.w, player.h)) {
      eBullets.splice(i, 1);
      lives--;
      beep(80, 0.45, 'sawtooth');
      if (lives <= 0) {
        state = 'dead';
        if (score > hiscore) hiscore = score;
        return;
      }
    }
  }

  // Invaders vs barriers (crush on contact)
  for (const inv of grid) {
    if (!inv.alive) continue;
    for (const bar of barriers) {
      if (bar.hp > 0 &&
          overlap(inv.x, inv.y, inv.w, inv.h, bar.x, bar.y, bar.s, bar.s)) {
        bar.hp = 0;
      }
    }
  }
}

// ── Drawing ───────────────────────────────────────────────────────────────
const COLORS = { A: '#ff6b6b', B: '#ffd93d', C: '#6bcb77' };

function drawInvader(inv) {
  const { x, y, w, h, type, af } = inv;
  ctx.fillStyle = COLORS[type];

  if (type === 'A') {
    // Crab – two frames
    ctx.fillRect(x+w*.3,  y,       w*.4, h*.2);
    ctx.fillRect(x+w*.1,  y+h*.2,  w*.8, h*.5);
    ctx.fillRect(x,       y+h*.38, w,    h*.32);
    if (af === 0) {
      ctx.fillRect(x,       y+h*.7,  w*.18, h*.3);
      ctx.fillRect(x+w*.82, y+h*.7,  w*.18, h*.3);
    } else {
      ctx.fillRect(x+w*.12, y+h*.7,  w*.18, h*.3);
      ctx.fillRect(x+w*.7,  y+h*.7,  w*.18, h*.3);
    }
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(x+w*.25, y+h*.3,  w*.14, h*.2);
    ctx.fillRect(x+w*.61, y+h*.3,  w*.14, h*.2);
  } else if (type === 'B') {
    // Squid
    ctx.fillRect(x+w*.2,  y,       w*.6, h*.18);
    ctx.fillRect(x+w*.1,  y+h*.18, w*.8, h*.55);
    ctx.fillRect(x,       y+h*.32, w,    h*.38);
    if (af === 0) {
      ctx.fillRect(x,       y+h*.7,  w*.16, h*.3);
      ctx.fillRect(x+w*.38, y+h*.68, w*.24, h*.32);
      ctx.fillRect(x+w*.84, y+h*.7,  w*.16, h*.3);
    } else {
      ctx.fillRect(x+w*.1,  y+h*.7,  w*.16, h*.3);
      ctx.fillRect(x+w*.38, y+h*.68, w*.24, h*.32);
      ctx.fillRect(x+w*.74, y+h*.7,  w*.16, h*.3);
    }
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(x+w*.26, y+h*.22, w*.14, h*.2);
    ctx.fillRect(x+w*.6,  y+h*.22, w*.14, h*.2);
  } else {
    // Octopus
    ctx.fillRect(x+w*.15, y,       w*.7, h*.5);
    ctx.fillRect(x,       y+h*.28, w,    h*.42);
    if (af === 0) {
      ctx.fillRect(x,       y+h*.7,  w*.22, h*.3);
      ctx.fillRect(x+w*.3,  y+h*.65, w*.16, h*.35);
      ctx.fillRect(x+w*.54, y+h*.65, w*.16, h*.35);
      ctx.fillRect(x+w*.78, y+h*.7,  w*.22, h*.3);
    } else {
      ctx.fillRect(x+w*.1,  y+h*.7,  w*.22, h*.3);
      ctx.fillRect(x+w*.3,  y+h*.65, w*.16, h*.35);
      ctx.fillRect(x+w*.54, y+h*.65, w*.16, h*.35);
      ctx.fillRect(x+w*.68, y+h*.7,  w*.22, h*.3);
    }
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(x+w*.3,  y+h*.1,  w*.12, h*.22);
    ctx.fillRect(x+w*.58, y+h*.1,  w*.12, h*.22);
  }
}

function drawPlayer() {
  const { x, y, w, h } = player;
  ctx.fillStyle = '#4fc3f7';
  ctx.fillRect(x+w*.44, y,       w*.12, h*.38);  // cannon
  ctx.fillRect(x+w*.18, y+h*.32, w*.64, h*.42);  // body
  ctx.fillRect(x,       y+h*.56, w,     h*.44);  // base
}

function drawStars() {
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (let i = 0; i < 60; i++) {
    const sx = (i * 173.7 + 19) % canvas.width;
    const sy = (i * 97.1  + i * i * 0.11) % (canvas.height * 0.95);
    ctx.fillRect(sx, sy, 1 + i % 2, 1 + i % 2);
  }
}

function drawHUD() {
  const fs = Math.max(11, Math.min(18, canvas.height * 0.038));
  ctx.font = `${fs}px monospace`;
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'left';
  ctx.fillText(`SCORE  ${score}`,   canvas.width * 0.02, fs * 1.3);
  ctx.textAlign = 'right';
  ctx.fillText(`BEST  ${hiscore}`,  canvas.width * 0.98, fs * 1.3);
  ctx.textAlign = 'center';
  // lives as small ships
  const hearts = '♥'.repeat(Math.max(0, lives));
  ctx.fillStyle = '#ff6b6b';
  ctx.fillText(hearts, canvas.width / 2, fs * 1.3);
  ctx.textAlign = 'left';
}

function drawTitle() {
  const cx = canvas.width / 2;
  ctx.textAlign = 'center';

  ctx.fillStyle = '#4fc3f7';
  ctx.font = `bold ${Math.min(70, canvas.height * 0.09)}px monospace`;
  ctx.fillText('LEGACY',  cx, canvas.height * 0.28);
  ctx.fillText('INVADER', cx, canvas.height * 0.40);

  const fs = Math.max(11, canvas.height * 0.032);
  ctx.font = `${fs}px monospace`;
  const tx = canvas.width * 0.5;
  const scoreY = canvas.height * 0.56;

  ctx.fillStyle = COLORS.A; ctx.fillText('▼ ▼ ▼  =  30 pts', tx, scoreY);
  ctx.fillStyle = COLORS.B; ctx.fillText('▼ ▼ ▼  =  20 pts', tx, scoreY + fs * 1.7);
  ctx.fillStyle = COLORS.C; ctx.fillText('▼ ▼ ▼  =  10 pts', tx, scoreY + fs * 3.4);

  ctx.fillStyle = '#ffd93d';
  ctx.font = `${Math.max(12, canvas.height * 0.036)}px monospace`;
  ctx.fillText('TAP  ●  TO START', cx, canvas.height * 0.86);

  ctx.fillStyle = 'rgba(180,180,180,0.7)';
  ctx.font = `${Math.max(9, canvas.height * 0.024)}px monospace`;
  ctx.fillText('Arrow keys / Space on desktop', cx, canvas.height * 0.92);
  ctx.textAlign = 'left';
}

function drawOverlay(title, sub, hint, tc) {
  ctx.fillStyle = 'rgba(0,0,0,0.62)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const cx = canvas.width / 2;
  ctx.textAlign = 'center';
  ctx.fillStyle = tc;
  ctx.font = `bold ${Math.min(60, canvas.height * 0.075)}px monospace`;
  ctx.fillText(title, cx, canvas.height * 0.38);
  ctx.fillStyle = '#fff';
  ctx.font = `${Math.max(12, canvas.height * 0.042)}px monospace`;
  ctx.fillText(sub, cx, canvas.height * 0.52);
  ctx.fillStyle = '#ffd93d';
  ctx.font = `${Math.max(10, canvas.height * 0.03)}px monospace`;
  ctx.fillText(hint, cx, canvas.height * 0.64);
  ctx.textAlign = 'left';
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#0a0a1a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawStars();

  if (state === 'title') { drawTitle(); return; }

  drawHUD();

  // Ground line
  ctx.fillStyle = '#4fc3f7';
  ctx.fillRect(0, player.y + player.h + 2, canvas.width, 2);

  // Barriers
  barriers.forEach(b => {
    if (b.hp <= 0) return;
    ctx.fillStyle = `rgba(80,220,120,${0.2 + (b.hp / 4) * 0.8})`;
    ctx.fillRect(b.x, b.y, b.s, b.s);
  });

  // Invaders
  grid.forEach(inv => { if (inv.alive) drawInvader(inv); });

  // Player (flicker while dying)
  if (state !== 'dead' || frame % 10 < 6) drawPlayer();

  // Player bullet
  if (bullet) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(bullet.x - bullet.w / 2, bullet.y, bullet.w, bullet.h);
  }

  // Enemy bullets
  ctx.fillStyle = '#ff4444';
  eBullets.forEach(b => ctx.fillRect(b.x - b.w / 2, b.y, b.w, b.h));

  // Overlays
  if (state === 'dead') drawOverlay('GAME OVER', `SCORE  ${score}`, 'TAP  ●  TO RETRY',     '#ff6b6b');
  if (state === 'win')  drawOverlay('YOU WIN!',  `SCORE  ${score}`, 'TAP  ●  FOR NEXT WAVE', '#6bcb77');
}

// ── Loop ─────────────────────────────────────────────────────────────────
function loop() {
  if (state === 'playing') update();
  draw();
  requestAnimationFrame(loop);
}

// ── Boot ─────────────────────────────────────────────────────────────────
resize();
loop();
