// OWNER (tasks O2-O4): game loop, spawning, physics, swept-collision slicing,
// rounds, lives, scoring. Listens for blade:* and ui:* events and emits the events in docs/CONTRACT.md.
//
// Coordinates: the logical play field is always 720 px tall; its width follows the canvas aspect
// (1280 at 16:9). One uniform scale maps it to the canvas, so text never stretches and normalised
// blade points map straight onto it.
import { bus } from '../bus.js';
import { CONFIG } from '../config.js';
import { pickWeighted } from './adaptive.js';

const FONT = `bold ${Math.max(36, CONFIG.chipFontPx)}px ui-monospace, "Cascadia Mono", Consolas, Menlo, monospace`;
const CHIP_PAD_X = 26;
const CHIP_H = Math.max(36, CONFIG.chipFontPx) + 30;
const TIMER_EVERY = 0.25; // seconds between timer:update events
const FIRST_SPAWN_DELAY = 1.6; // let the rule banner be read first
const MAX_STROKE_GAP_MS = 150; // longer gaps between blade points start a new stroke

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** Squared distance between segments p1-q1 and p2-q2 (Ericson, Real-Time Collision Detection 5.1.9). */
function segSegDist2(p1x, p1y, q1x, q1y, p2x, p2y, q2x, q2y) {
  const d1x = q1x - p1x, d1y = q1y - p1y, d2x = q2x - p2x, d2y = q2y - p2y;
  const rx = p1x - p2x, ry = p1y - p2y;
  const a = d1x * d1x + d1y * d1y, e = d2x * d2x + d2y * d2y, f = d2x * rx + d2y * ry;
  const EPS = 1e-9;
  let s, t;
  if (a <= EPS && e <= EPS) {
    s = t = 0;
  } else if (a <= EPS) {
    s = 0;
    t = clamp(f / e, 0, 1);
  } else {
    const c = d1x * rx + d1y * ry;
    if (e <= EPS) {
      t = 0;
      s = clamp(-c / a, 0, 1);
    } else {
      const b = d1x * d2x + d1y * d2y;
      const denom = a * e - b * b;
      s = denom !== 0 ? clamp((b * f - c * e) / denom, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp(-c / a, 0, 1);
      } else if (t > 1) {
        t = 1;
        s = clamp((b - c) / a, 0, 1);
      }
    }
  }
  const cx = p1x + d1x * s - (p2x + d2x * t);
  const cy = p1y + d1y * s - (p2y + d2y * t);
  return cx * cx + cy * cy;
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function createEngine({ canvas }) {
  const ctx = canvas.getContext('2d');
  const H = CONFIG.logicalHeight;
  let W = CONFIG.logicalWidth;
  let scale = 1;

  const resize = () => {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
    canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    scale = canvas.height / H;
    W = canvas.width / scale;
  };
  window.addEventListener('resize', resize);
  resize();

  // ---- game state ----
  let state = 'idle'; // idle | playing | ending | summary | over
  let paused = false;
  let deck = null;
  let brainrot = [];
  let roundIndex = 0;
  let roundTime = 0;
  let timerAcc = 0;
  let spawnTimer = 0;
  let clock = 0; // game time in ms, frozen while paused
  let score = 0;
  let combo = 0;
  let lastCorrectAt = -Infinity;
  let lives = CONFIG.maxLives;
  let misses = 0;
  let items = [];
  let halves = [];
  let termStats = {}; // this game only: { term: { seen, errors } }
  let pickStats = {}; // stats used to weight term picks (O4 merges history in)
  let missed = new Map();
  let wrongSliced = new Map();
  let diff = {};
  let nextId = 1;

  const measureCtx = document.createElement('canvas').getContext('2d');
  measureCtx.font = FONT;
  const chipWidth = (term) => Math.ceil(measureCtx.measureText(term).width) + CHIP_PAD_X * 2;

  const definition = (term) => deck?.definitions?.[term] ?? '';
  const stat = (term) => (termStats[term] ??= { seen: 0, errors: 0 });
  const addError = (term) => {
    stat(term).errors++;
    const p = (pickStats[term] ??= { seen: 0, errors: 0 });
    p.errors++;
  };

  // ---- rounds ----
  function difficulty(i) {
    return {
      interval: Math.max(CONFIG.spawnIntervalMin, CONFIG.spawnIntervalStart - CONFIG.spawnIntervalStep * i),
      wrong: Math.min(0.45, CONFIG.wrongChance + 0.03 * i),
      brainrot: Math.min(0.25, CONFIG.brainrotChance + 0.02 * i),
      double: Math.min(0.5, CONFIG.doubleSpawnChance + 0.1 * i),
    };
  }

  function startRound(i) {
    roundIndex = i;
    state = 'playing';
    roundTime = 0;
    timerAcc = 0;
    misses = 0; // a fresh round forgives partial miss progress
    spawnTimer = FIRST_SPAWN_DELAY;
    missed = new Map();
    wrongSliced = new Map();
    diff = difficulty(i);
    bus.emit('round:start', { index: i, total: deck.rounds.length, rule: deck.rounds[i].rule, seconds: CONFIG.roundSeconds });
    bus.emit('timer:update', { secondsLeft: CONFIG.roundSeconds });
  }

  function endRound() {
    if (roundIndex >= deck.rounds.length - 1) return gameOver();
    state = 'summary';
    const list = (m) => [...m.keys()].map((term) => ({ term, definition: definition(term) }));
    bus.emit('round:end', { index: roundIndex, missed: list(missed), wrongSliced: list(wrongSliced) });
  }

  function gameOver() {
    if (state === 'over') return;
    state = 'over';
    paused = false;
    for (const it of items) burst(it); // clear the field with a flourish
    items = [];
    const weakTerms = Object.entries(termStats)
      .filter(([, s]) => s.errors > 0)
      .sort((a, b) => b[1].errors - a[1].errors || b[1].errors / b[1].seen - a[1].errors / a[1].seen)
      .slice(0, 5)
      .map(([term]) => ({ term, definition: definition(term) }));
    bus.emit('game:over', { score, rounds: roundIndex + 1, termStats, weakTerms });
    onGameOver?.(termStats);
  }
  let onGameOver = null;

  function loseLife() {
    if (lives <= 0) return;
    lives--;
    bus.emit('lives:update', { lives, max: CONFIG.maxLives });
    if (lives <= 0) gameOver();
  }

  // ---- spawning ----
  function pickTerm(pool) {
    const onScreen = new Set(items.map((it) => it.term));
    const fresh = pool.filter((t) => !onScreen.has(t));
    return pickWeighted(fresh.length ? fresh : pool, pickStats);
  }

  function spawnOne() {
    const round = deck.rounds[roundIndex];
    const r = Math.random();
    let kind = 'correct';
    if (r < diff.brainrot && brainrot.length) kind = 'brainrot';
    else if (r < diff.brainrot + diff.wrong) kind = 'wrong';
    const pool = kind === 'brainrot' ? brainrot : round[kind];
    const term = kind === 'brainrot' ? pool[Math.floor(Math.random() * pool.length)] : pickTerm(pool);
    if (kind !== 'brainrot') {
      stat(term).seen++;
      (pickStats[term] ??= { seen: 0, errors: 0 }).seen++;
    }

    const w = chipWidth(term);
    const h = CHIP_H;
    const g = CONFIG.gravity;
    const apexY = H * (1 - rand(CONFIG.apexMin, CONFIG.apexMax));
    const y0 = H + h / 2 + 4;
    const vy = -Math.sqrt(2 * g * (y0 - apexY));
    const airtime = (2 * -vy) / g;
    const margin = Math.min(w / 2 + 24, W / 2);

    // Start where the nearest low item is furthest away, so chips do not stack on launch.
    let x0 = rand(margin, W - margin);
    let best = -1;
    for (let k = 0; k < 6; k++) {
      const cx = rand(margin, W - margin);
      const d = Math.min(Infinity, ...items.filter((it) => it.y > H * 0.5).map((it) => Math.abs(it.x - cx)));
      if (d > best) (best = d), (x0 = cx);
    }
    const x1 = rand(margin, W - margin);

    items.push({
      id: nextId++,
      term,
      kind,
      x: x0,
      y: y0,
      vx: (x1 - x0) / Math.max(airtime, CONFIG.minAirtime),
      vy,
      rot: rand(-0.08, 0.08),
      vrot: rand(-0.12, 0.12),
      w,
      h,
      born: clock,
    });
  }

  // ---- slicing ----
  const blades = new Map(); // id -> last point { x, y, t } in logical px
  const trails = new Map(); // id -> [{ x, y, t }] (debug draw only)

  function onBladePoint({ id, x, y, t }) {
    const lx = x * W;
    const ly = y * H;
    if (CONFIG.drawBladeDebug) {
      const tr = trails.get(id) ?? [];
      tr.push({ x: lx, y: ly, t });
      trails.set(id, tr);
    }
    const prev = blades.get(id);
    blades.set(id, { x: lx, y: ly, t });
    if (!prev || paused || (state !== 'playing' && state !== 'ending')) return;
    const dt = t - prev.t;
    if (dt <= 0 || dt > MAX_STROKE_GAP_MS) return;
    // A huge jump in one sample is a tracking glitch (hand ids swapped, hand re-acquired), not a swipe.
    if (Math.hypot(lx - prev.x, ly - prev.y) > CONFIG.maxJump * W) return;
    const speed = Math.hypot(lx - prev.x, ly - prev.y) / W / (dt / 1000); // screen widths per second
    if (speed < CONFIG.minSliceSpeed) return;

    for (const it of items) {
      if (state === 'over') break; // slicing brainrot can end the game mid-stroke
      if (it.sliced) continue;
      const half = Math.max(0, it.w / 2 - it.h / 2);
      const ax = Math.cos(it.rot) * half;
      const ay = Math.sin(it.rot) * half;
      const r = it.h / 2 + CONFIG.hitPad;
      if (segSegDist2(prev.x, prev.y, lx, ly, it.x - ax, it.y - ay, it.x + ax, it.y + ay) <= r * r) {
        slice(it, lx - prev.x, ly - prev.y);
      }
    }
    items = items.filter((it) => !it.sliced);
  }

  function slice(it, dx, dy) {
    it.sliced = true;
    let points;
    if (it.kind === 'correct') {
      combo = clock - lastCorrectAt <= CONFIG.comboWindowMs ? combo + 1 : 1;
      lastCorrectAt = clock;
      points = CONFIG.pointsCorrect * Math.min(combo, CONFIG.comboMax);
    } else {
      combo = 0;
      lastCorrectAt = -Infinity;
      points = -(it.kind === 'wrong' ? CONFIG.penaltyWrong : CONFIG.penaltyBrainrot);
      if (it.kind === 'wrong') {
        addError(it.term);
        wrongSliced.set(it.term, true);
      }
    }
    score = Math.max(0, score + points);
    split(it, dx, dy);
    bus.emit('item:slice', { term: it.term, kind: it.kind, x: it.x / W, y: it.y / H, points, combo });
    bus.emit('score:update', { score, combo });
    if (it.kind === 'brainrot') loseLife();
  }

  function split(it, dx, dy) {
    const len = Math.hypot(dx, dy) || 1;
    const push = 120 + Math.min(len * 4, 200);
    for (const side of [-1, 1]) {
      halves.push({
        ...it,
        side,
        vx: it.vx * 0.4 + side * push + (dx / len) * 80,
        vy: Math.min(it.vy, 0) * 0.4 - 160 + (dy / len) * 80,
        vrot: side * rand(2, 4),
        age: 0,
      });
    }
  }

  function burst(it) {
    split(it, 0, -1);
  }

  function miss(it) {
    addError(it.term);
    missed.set(it.term, true);
    bus.emit('item:miss', { term: it.term });
    if (combo) {
      combo = 0;
      bus.emit('score:update', { score, combo });
    }
    misses++;
    if (misses % CONFIG.missesPerLife === 0) loseLife();
  }

  // ---- loop ----
  function update(dt) {
    clock += dt * 1000;
    const g = CONFIG.gravity;

    if (state === 'playing') {
      roundTime += dt;
      timerAcc += dt;
      if (timerAcc >= TIMER_EVERY) {
        timerAcc = 0;
        bus.emit('timer:update', { secondsLeft: Math.max(0, Math.round((CONFIG.roundSeconds - roundTime) * 10) / 10) });
      }
      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        spawnOne();
        if (Math.random() < diff.double) spawnOne();
        spawnTimer = diff.interval * rand(0.85, 1.15);
      }
      if (roundTime >= CONFIG.roundSeconds) {
        state = 'ending';
        bus.emit('timer:update', { secondsLeft: 0 });
      }
    }

    for (const it of items) {
      it.vy += g * dt;
      it.x += it.vx * dt;
      it.y += it.vy * dt;
      it.rot += it.vrot * dt;
    }
    const fallen = items.filter((it) => it.vy > 0 && it.y - it.h / 2 > H + 4);
    if (fallen.length) {
      items = items.filter((it) => !fallen.includes(it));
      for (const it of fallen) if (it.kind === 'correct' && state !== 'over') miss(it);
    }

    for (const hf of halves) {
      hf.vy += g * 1.4 * dt;
      hf.x += hf.vx * dt;
      hf.y += hf.vy * dt;
      hf.rot += hf.vrot * dt;
      hf.age += dt;
    }
    halves = halves.filter((hf) => hf.age < 1.6 && hf.y < H + 200);

    if (state === 'ending' && items.length === 0) endRound();
  }

  // ---- drawing ----
  function drawChip(it, t) {
    const { w, h } = it;
    if (it.kind === 'brainrot') return drawBrainrot(it, t);
    roundRectPath(ctx, -w / 2, -h / 2, w, h, 14);
    ctx.fillStyle = 'rgba(8, 14, 24, 0.92)';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#00e5ff';
    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur = 14;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#f4f8ff';
    ctx.fillText(it.term, 0, 2);
  }

  function drawBrainrot(it, t) {
    const { w, h } = it;
    const jx = rand(-2.5, 2.5);
    const jy = rand(-2, 2);
    const hue = (t / 6 + it.id * 47) % 360;
    roundRectPath(ctx, -w / 2 + jx, -h / 2 + jy, w, h, 4);
    ctx.fillStyle = `hsla(${hue}, 90%, 18%, 0.95)`;
    ctx.fill();
    ctx.setLineDash([10, 6]);
    ctx.lineDashOffset = -t / 20;
    ctx.lineWidth = 4;
    ctx.strokeStyle = `hsl(${(hue + 180) % 360}, 100%, 60%)`;
    ctx.stroke();
    ctx.setLineDash([]);
    // RGB split
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255, 0, 90, 0.85)';
    ctx.fillText(it.term, -4 + jx, 2 + jy);
    ctx.fillStyle = 'rgba(0, 255, 230, 0.85)';
    ctx.fillText(it.term, 4 - jx, 2 - jy);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#ffee00';
    ctx.fillText(it.term, 0, 2);
    // a torn scanline band, shifted sideways
    if (Math.random() < 0.5) {
      const by = rand(-h / 2, h / 2 - 10);
      ctx.save();
      ctx.beginPath();
      ctx.rect(-w / 2 - 20, by, w + 40, rand(5, 12));
      ctx.clip();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(it.term, rand(-14, 14), 2);
      ctx.restore();
    }
  }

  const SLICED_COLOR = { correct: '#39ff14', wrong: '#ff3355' };

  function drawHalf(hf, t) {
    ctx.globalAlpha = clamp(1.6 - hf.age, 0, 1);
    ctx.beginPath();
    ctx.rect(hf.side < 0 ? -hf.w / 2 - 30 : 0, -hf.h, hf.w / 2 + 30, hf.h * 2);
    ctx.clip();
    ctx.translate(-hf.side * 6, 0);
    if (hf.kind === 'brainrot') {
      drawBrainrot(hf, t);
    } else {
      // after the cut, reveal the verdict
      roundRectPath(ctx, -hf.w / 2, -hf.h / 2, hf.w, hf.h, 14);
      ctx.fillStyle = 'rgba(8, 14, 24, 0.92)';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = SLICED_COLOR[hf.kind];
      ctx.stroke();
      ctx.fillStyle = SLICED_COLOR[hf.kind];
      ctx.fillText(hf.term, 0, 2);
    }
  }

  function drawBlade(now) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const [id, tr] of trails) {
      while (tr.length && now - tr[0].t > 200) tr.shift();
      if (tr.length < 2) {
        if (!tr.length) trails.delete(id);
        continue;
      }
      ctx.beginPath();
      tr.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
    }
  }

  function draw(now) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.font = FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const hf of halves) {
      ctx.save();
      ctx.translate(hf.x, hf.y);
      ctx.rotate(hf.rot);
      drawHalf(hf, now);
      ctx.restore();
    }
    for (const it of items) {
      ctx.save();
      ctx.translate(it.x, it.y);
      ctx.rotate(it.rot);
      drawChip(it, now);
      ctx.restore();
    }
    if (CONFIG.drawBladeDebug) drawBlade(now);
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!paused && state !== 'idle') update(dt);
    draw(now);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---- events ----
  bus.on('blade:point', onBladePoint);
  bus.on('blade:end', ({ id }) => blades.delete(id));
  bus.on('ui:continue', () => {
    if (state === 'summary') startRound(roundIndex + 1);
  });
  bus.on('ui:pause', () => {
    if (state === 'playing' || state === 'ending') paused = true;
  });
  bus.on('ui:resume', () => {
    paused = false;
    blades.clear(); // do not slice along the jump from where the hand was before the pause
  });

  return {
    /** Start or restart a game. `history` is the stored term stats used to weight picks. */
    start({ deck: d, brainrot: words, history = {} }) {
      deck = d;
      brainrot = words ?? [];
      score = 0;
      combo = 0;
      lastCorrectAt = -Infinity;
      lives = CONFIG.maxLives;
      misses = 0;
      items = [];
      halves = [];
      termStats = {};
      pickStats = structuredClone(history);
      paused = false;
      blades.clear();
      bus.emit('game:start', { deckId: deck.id, deckTitle: deck.title, totalRounds: deck.rounds.length });
      bus.emit('score:update', { score, combo });
      bus.emit('lives:update', { lives, max: CONFIG.maxLives });
      startRound(0);
    },
    /** Called with this game's termStats when the game ends (used to persist them). */
    onGameOver(fn) {
      onGameOver = fn;
    },
    stop() {
      state = 'idle';
      items = [];
      halves = [];
    },
  };
}
