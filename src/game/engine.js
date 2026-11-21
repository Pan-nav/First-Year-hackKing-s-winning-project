// OWNER (tasks O2-O4): game loop, spawning, physics, swept-collision slicing,
// rounds, lives, scoring. Listens for blade:* and ui:* events and emits the events in docs/CONTRACT.md.
//
// Coordinates: the logical play field is always 720 px tall; its width follows the canvas aspect
// (1280 at 16:9). One uniform scale maps it to the canvas, so text never stretches and normalised
// blade points map straight onto it.
import { bus } from '../bus.js';
import { CONFIG } from '../config.js';
import { pickWeighted } from './adaptive.js';

const MONO = 'ui-monospace, "Cascadia Mono", Consolas, Menlo, monospace';
const FONT = `bold ${Math.max(36, CONFIG.chipFontPx)}px ${MONO}`;
// "Show the learning": definition cards on mistakes, REVIEW tags, and a round-start callout.
const CARD_TITLE_FONT = `bold 21px ${MONO}`;
const CARD_BODY_FONT = `bold 18px ${MONO}`;
const BANNER_TITLE_FONT = `bold 24px ${MONO}`;
const BANNER_SUB_FONT = `bold 20px ${MONO}`;
const TAG_FONT = `bold 17px ${MONO}`;
const CARD_MAX_W = 620;
const CARD_MAX = 2;
const CARD_PAD = 10;
const CARD_TITLE_H = 26;
const CARD_LINE_H = 23;
const CARD_MS = 3400;
const BANNER_MS = 3200;
const CARD_COLOR = { wrong: '#ff4f87', miss: '#ffcc39' };
const REVIEW_COLOR = '#ffcc39';
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
const CHIP_PAD_X = 26;
const CHIP_H = Math.max(36, CONFIG.chipFontPx) + 30;
const TIMER_EVERY = 0.25; // seconds between timer:update events
const BAG_SIZE = 8; // spawn kinds are dealt from shuffled bags of this size (see refillBag)
const FIRST_SPAWN_DELAY = 1.6; // let the rule banner be read first
const MAX_STROKE_GAP_MS = 480; // longer gaps between blade points start a new stroke (handTracker HAND_LOST_MS is 450)

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
  let freezeLeft = 0; // seconds of brainrot hit-stop left (CONFIG.brainrotFreezeMs): no physics, timer or slicing
  let score = 0;
  let combo = 0;
  let lastCorrectAt = -Infinity;
  let lives = CONFIG.maxLives;
  let misses = 0;
  let items = [];
  let halves = [];
  let termStats = {}; // this game only: { term: { seen, errors } }
  let startHistory = {}; // stored stats when the game started (to spot terms mastered this game)
  let learn = { correctTotal: 0, correctSliced: 0, wrongTotal: 0, wrongSliced: 0 }; // for game:over learning
  let warmupTime = 0;
  let menuTarget = null; // hands-free NEXT / PLAY AGAIN target
  const menuTrails = new Map(); // id -> recent blade points, drawn on the menu layer
  let pickStats = {}; // stats used to weight term picks (O4 merges history in)
  let missed = new Map();
  let wrongSliced = new Map();
  let diff = {};
  let spawned = { correct: 0, wrong: 0, brainrot: 0, characters: 0 }; // this round's mix (logged at round end)
  let characterShown = false; // has this game shown a brainrot character yet (see CONFIG.brainrotCharacters)
  let bag = []; // shuffled kinds still to deal this round (see refillBag)
  let nextId = 1;
  let cards = []; // definition cards: { x, y, w, h, title, lines, color, born }
  let banner = null; // round-start review callout: { title, sub, born }

  const measureCtx = document.createElement('canvas').getContext('2d');
  const chipWidth = (term) => {
    measureCtx.font = FONT;
    return Math.ceil(measureCtx.measureText(term).width) + CHIP_PAD_X * 2;
  };

  const definition = (term) => deck?.definitions?.[term] ?? '';
  const isReview = (term) => (pickStats[term]?.errors ?? 0) > 0;

  // ---- definition cards ----
  function wrap(text, font, maxW) {
    measureCtx.font = font;
    const lines = [];
    let line = '';
    for (const word of text.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && measureCtx.measureText(next).width > maxW) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
    return lines;
  }

  // Cards live in one strip at the bottom centre (between the mascot and the camera preview),
  // newest at the bottom, at most CARD_MAX alive. Chips are drawn over them, so play is never hidden.
  function addCard({ title, body, color }) {
    const same = cards.find((c) => c.title === title);
    if (same) {
      same.born = clock;
      return;
    }
    const maxW = Math.max(260, Math.min(CARD_MAX_W, W - 460));
    const lines = body ? wrap(body, CARD_BODY_FONT, maxW - CARD_PAD * 2) : [];
    measureCtx.font = CARD_TITLE_FONT;
    let inner = measureCtx.measureText(title).width;
    measureCtx.font = CARD_BODY_FONT;
    for (const l of lines) inner = Math.max(inner, measureCtx.measureText(l).width);
    const w = Math.min(Math.ceil(inner) + CARD_PAD * 2, maxW);
    const h = CARD_PAD * 2 + CARD_TITLE_H + lines.length * CARD_LINE_H;
    cards.push({ w, h, title, lines, color, born: clock });
    if (cards.length > CARD_MAX) cards.shift();
  }
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
      wrong: Math.min(0.35, CONFIG.wrongChance + 0.03 * i),
      brainrot: Math.min(0.3, CONFIG.brainrotChance + 0.02 * i),
      double: Math.min(0.5, CONFIG.doubleSpawnChance + 0.1 * i),
    };
  }

  // The summary's own PLAY AGAIN button (mouse) leaves the game: drop the hands-free target with it.
  document.addEventListener('click', (e) => {
    if (e.target.closest?.('#screens [data-action="again"]')) menuTarget = null;
  });

  function startRound(i) {
    menuTarget = null;
    menuTrails.clear();
    roundIndex = i;
    state = 'playing';
    roundTime = 0;
    timerAcc = 0;
    misses = 0; // a fresh round forgives partial miss progress
    spawnTimer = FIRST_SPAWN_DELAY;
    spawned = { correct: 0, wrong: 0, brainrot: 0, characters: 0 };
    bag = [];
    missed = new Map();
    wrongSliced = new Map();
    diff = difficulty(i);
    // Terms in this round the player got wrong before (any game): adaptive repetition made visible.
    const round = deck.rounds[i];
    const review = [...round.correct, ...round.wrong].filter((t) => isReview(t));
    banner = review.length
      ? {
          title: `↻ ${review.length} TERM${review.length > 1 ? 'S' : ''} YOU GOT WRONG ${review.length > 1 ? 'ARE' : 'IS'} BACK`,
          sub: review.slice(0, 3).join(' · ') + (review.length > 3 ? ' …' : ''),
          born: clock,
        }
      : null;
    bus.emit('round:start', { index: i, total: deck.rounds.length, rule: round.rule, seconds: CONFIG.roundSeconds, review });
    bus.emit('timer:update', { secondsLeft: CONFIG.roundSeconds });
  }

  const logMix = () =>
    console.info(
      `[engine] round ${roundIndex + 1}: spawned ${spawned.correct} correct, ${spawned.wrong} wrong, ` +
        `${spawned.brainrot} brainrot (${spawned.characters} of them characters)`,
    );

  function endRound() {
    logMix();
    if (roundIndex >= deck.rounds.length - 1) return gameOver();
    state = 'summary';
    const list = (m) => [...m.keys()].map((term) => ({ term, definition: definition(term) }));
    bus.emit('round:end', { index: roundIndex, missed: list(missed), wrongSliced: list(wrongSliced) });
    showMenuTarget('NEXT ROUND ▶', 'continue');
  }

  /** What this game taught: share of right decisions, and terms got right now that were wrong before. */
  function learningSummary() {
    const total = learn.correctTotal + learn.wrongTotal;
    const wrongAvoided = Math.max(0, learn.wrongTotal - learn.wrongSliced);
    const improved = Object.entries(termStats)
      .filter(([term, s]) => s.seen > 0 && s.errors === 0 && (startHistory[term]?.errors ?? 0) > 0)
      .map(([term]) => ({ term, definition: definition(term) }));
    return {
      accuracy: total ? Math.round((100 * (learn.correctSliced + wrongAvoided)) / total) : null,
      correctSliced: learn.correctSliced,
      correctTotal: learn.correctTotal,
      wrongAvoided,
      wrongTotal: learn.wrongTotal,
      improved,
    };
  }

  // ---- hands-free menu target (NEXT ROUND / PLAY AGAIN), drawn on its own layer above the screens ----
  const menuCanvas = document.createElement('canvas');
  menuCanvas.id = 'menu-targets';
  menuCanvas.setAttribute('aria-hidden', 'true');
  Object.assign(menuCanvas.style, {
    position: 'absolute', inset: '0', width: '100%', height: '100%', zIndex: '20', pointerEvents: 'none',
  });
  canvas.parentElement?.append(menuCanvas);
  const mctx = menuCanvas.getContext('2d');
  const menuTargetX = ({ action, w }) => action === 'again' ? W / 2 : W - w / 2 - 40;

  function showMenuTarget(label, action) {
    if (!CONFIG.handsFreeMenus) return;
    measureCtx.font = FONT;
    const w = Math.ceil(measureCtx.measureText(label).width) + CHIP_PAD_X * 2;
    menuTarget = { label, action, w, h: CHIP_H, y: H * (action === 'again' ? 0.5 : 0.45), born: clock, learning: null };
    if (action === 'again') menuTarget.learning = learningSummary();
  }

  function checkMenuHit(prev, here) {
    if (!prev || clock - menuTarget.born < CONFIG.menuArmMs) return; // armed after a moment: no accidental skip
    const dt = here.t - prev.t;
    if (dt <= 0 || dt > MAX_STROKE_GAP_MS) return;
    const dist = Math.hypot(here.x - prev.x, here.y - prev.y);
    if (dist / W / (dt / 1000) < CONFIG.minSliceSpeed) return;
    const m = menuTarget;
    const half = Math.max(0, m.w / 2 - m.h / 2);
    const r = m.h / 2 + CONFIG.hitPad;
    const x = menuTargetX(m);
    const y = m.y + menuBob();
    if (segSegDist2(prev.x, prev.y, here.x, here.y, x - half, y, x + half, y) <= r * r) triggerMenu(x, y);
  }
  const menuBob = () => Math.sin(clock / 300) * 8;

  function drawMenu(now) {
    if (menuCanvas.width !== canvas.width || menuCanvas.height !== canvas.height) {
      menuCanvas.width = canvas.width;
      menuCanvas.height = canvas.height;
    }
    mctx.setTransform(1, 0, 0, 1, 0, 0);
    mctx.clearRect(0, 0, menuCanvas.width, menuCanvas.height);
    if (!menuTarget) return;
    mctx.setTransform(scale, 0, 0, scale, 0, 0);
    const m = menuTarget;
    const armed = clock - m.born >= CONFIG.menuArmMs;
    const x = menuTargetX(m);
    const y = m.y + menuBob();
    // the blade trail (the effects layer is hidden under the screens)
    mctx.strokeStyle = 'rgba(57, 255, 20, 0.9)';
    mctx.lineWidth = 6;
    mctx.lineCap = 'round';
    for (const [id, tr] of menuTrails) {
      while (tr.length && now - tr[0].t > 220) tr.shift();
      if (tr.length < 2) {
        if (!tr.length) menuTrails.delete(id);
        continue;
      }
      mctx.beginPath();
      tr.forEach((p, i) => (i ? mctx.lineTo(p.x, p.y) : mctx.moveTo(p.x, p.y)));
      mctx.stroke();
    }
    mctx.globalAlpha = armed ? 1 : 0.4;
    roundRectPath(mctx, x - m.w / 2, y - m.h / 2, m.w, m.h, 14);
    mctx.fillStyle = 'rgba(8, 14, 24, 0.95)';
    mctx.fill();
    mctx.lineWidth = 5;
    mctx.strokeStyle = '#39ff14';
    mctx.shadowColor = '#39ff14';
    mctx.shadowBlur = armed ? 18 + Math.sin(now / 150) * 8 : 0;
    mctx.stroke();
    mctx.shadowBlur = 0;
    mctx.font = FONT;
    mctx.textAlign = 'center';
    mctx.textBaseline = 'middle';
    mctx.fillStyle = '#39ff14';
    mctx.fillText(m.label, x, y + 2);
    mctx.font = TAG_FONT;
    mctx.fillStyle = '#e8f0ff';
    mctx.fillText('SWIPE TO SELECT', x, y + m.h / 2 + 18);
    if (m.learning?.accuracy != null) {
      const l = m.learning;
      mctx.font = CARD_TITLE_FONT;
      mctx.fillStyle = '#ffcc39';
      mctx.fillText(`${l.accuracy}% RIGHT CALLS`, x, y - m.h / 2 - 50);
      mctx.font = TAG_FONT;
      mctx.fillText(
        l.improved.length ? `${l.improved.length} TERM${l.improved.length > 1 ? 'S' : ''} MASTERED THIS GAME` : 'PLAY AGAIN TO MASTER YOUR WEAK TERMS',
        x,
        y - m.h / 2 - 22,
      );
    }
    mctx.globalAlpha = 1;
  }

  function triggerMenu(x, y) {
    const { action } = menuTarget;
    menuTarget = null;
    menuTrails.clear();
    bus.emit('item:slice', { term: action, kind: 'correct', x: x / W, y: y / H, points: 0, combo: 0, definition: '' });
    if (action === 'continue') {
      // Press the summary screen's own NEXT ROUND button, so the screen closes exactly as on a click.
      const button = document.querySelector('#screens [data-action="continue"]');
      if (button) button.click();
      else bus.emit('ui:continue', {});
    } else if (action === 'again') {
      bus.emit('ui:start', { deckId: deck.id });
    }
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
    const learning = learningSummary();
    console.info('[engine] learning', JSON.stringify({ ...learning, improved: learning.improved.map((i) => i.term) }));
    bus.emit('game:over', { score, rounds: roundIndex + 1, termStats, weakTerms, learning });
    onGameOver?.(termStats);
    showMenuTarget('PLAY AGAIN ▶', 'again');
  }
  let onGameOver = null;

  function loseLife() {
    if (lives <= 0) return;
    lives--;
    bus.emit('lives:update', { lives, max: CONFIG.maxLives });
    if (lives <= 0) {
      logMix();
      gameOver();
    }
  }

  // ---- spawning ----
  function pickTerm(pool, weighted = true) {
    const onScreen = new Set(items.map((it) => it.term));
    const fresh = pool.filter((t) => !onScreen.has(t));
    const from = fresh.length ? fresh : pool;
    return weighted ? pickWeighted(from, pickStats) : from[Math.floor(Math.random() * from.length)];
  }

  // Spawn kinds are dealt from a shuffled bag of BAG_SIZE, so every stretch of the round has the same
  // mix (pure chance gave rounds like 8 brainrot vs 4 correct). With the default chances a bag is
  // 4 correct, 2 wrong, 2 brainrot; later rounds trade a correct for a wrong.
  function refillBag() {
    const hasBrainrot = brainrot.length > 0 || CONFIG.brainrotCharacters.length > 0;
    const b = hasBrainrot ? Math.max(1, Math.round(BAG_SIZE * diff.brainrot)) : 0;
    const w = Math.round(BAG_SIZE * diff.wrong);
    bag = [
      ...Array(Math.max(1, BAG_SIZE - b - w)).fill('correct'),
      ...Array(w).fill('wrong'),
      ...Array(b).fill('brainrot'),
    ];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
  }

  function spawnOne() {
    const round = deck.rounds[roundIndex];
    const chars = CONFIG.brainrotCharacters;
    if (!bag.length) refillBag();
    // Safety net: every round shows at least minBrainrotPerRound brainrot words. If the bag has not
    // dealt the first by 1/3 of the round (the second by 2/3), take one out of the bag now.
    const need = CONFIG.minBrainrotPerRound;
    const due =
      (brainrot.length > 0 || chars.length > 0) &&
      spawned.brainrot < need &&
      roundTime >= (CONFIG.roundSeconds * (spawned.brainrot + 1)) / (need + 1);
    // Demo guarantee: every game shows the star character (chars[0]) once, early in round 1.
    const characterDue =
      chars.length > 0 && !characterShown && roundIndex === 0 && roundTime >= CONFIG.roundSeconds * CONFIG.characterGuaranteeAt;
    let kind;
    if (due || characterDue) {
      const i = bag.indexOf('brainrot');
      if (i >= 0) bag.splice(i, 1);
      kind = 'brainrot';
    } else {
      kind = bag.pop();
    }
    spawned[kind]++;
    let term;
    let character = false;
    if (kind === 'brainrot') {
      // Brainrot characters (their names match the Partner's consequence animations in ui/effects.js)
      // are a share of the brainrot spawns, on top of the guaranteed one.
      character = chars.length > 0 && (characterDue || !brainrot.length || Math.random() < CONFIG.characterShare);
      term = character ? (characterDue ? chars[0] : pickTerm(chars, false)) : pickTerm(brainrot, false);
      if (character) {
        characterShown = true;
        spawned.characters++;
      }
    } else {
      term = pickTerm(round[kind]);
    }
    const review = kind !== 'brainrot' && isReview(term);
    if (kind !== 'brainrot') {
      stat(term).seen++;
      (pickStats[term] ??= { seen: 0, errors: 0 }).seen++;
      if (kind === 'correct') learn.correctTotal++;
      else learn.wrongTotal++;
    }
    launch(term, kind, { review, character });
  }

  /** Throw one chip up from below the screen (physics shared by rounds and the warm-up). */
  function launch(term, kind, extra) {
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
      ...extra,
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
  // /?debug draws every blade sample as a dot, plus tracking gaps: green = swept across, red = ignored.
  const debugBlade = CONFIG.drawBladeDebug || new URLSearchParams(location.search).has('debug');
  const debugGaps = [];

  function onBladePoint({ id, x, y, t, src }) {
    const lx = x * W;
    const ly = y * H;
    if (debugBlade) {
      const tr = trails.get(id) ?? [];
      tr.push({ x: lx, y: ly, t, src });
      trails.set(id, tr);
    }
    const prev = blades.get(id);
    const here = { x: lx, y: ly, t, v: null, src };
    blades.set(id, here);
    if (menuTarget) {
      const tr = menuTrails.get(id) ?? [];
      tr.push({ x: lx, y: ly, t });
      menuTrails.set(id, tr);
      checkMenuHit(prev, here);
      return;
    }
    if (!prev || paused || freezeLeft > 0 || (state !== 'playing' && state !== 'ending' && state !== 'warmup')) return;
    const dt = t - prev.t;
    if (dt <= 0 || dt > MAX_STROKE_GAP_MS) return;
    const dx = lx - prev.x;
    const dy = ly - prev.y;
    const dist = Math.hypot(dx, dy);
    here.v = { x: dx / dt, y: dy / dt }; // px per ms, used to judge the next gap
    const speed = dist / W / (dt / 1000); // screen widths per second
    const pv = prev.v;
    const cosPrev = pv && dist > 0 ? (pv.x * dx + pv.y * dy) / (Math.hypot(pv.x, pv.y) * dist || 1) : -1;
    const ignore = () => {
      here.v = null; // a correction says nothing about where the hand is heading
    };
    // A long jump at an impossible speed is a tracking glitch (e.g. ids swapped between two hands).
    if (dist > CONFIG.maxJump * W && speed > CONFIG.maxBladeSpeed) return ignore();
    // Switching between the hand tracker and the body tracker (src 'pose'): the two disagree by a few
    // centimetres, and pose lags in a fast swipe. A switch jump that carries on in the direction of
    // travel is the blade catching up with the real swipe, so it slices; a sideways or backwards one is
    // just the estimate being corrected, so it does not.
    if ((prev.src === 'pose') !== (src === 'pose') && dist > CONFIG.switchMaxJump * W && cosPrev < 0.5) return ignore();
    // One pose frame jumping a third of the screen is the body tracker glitching on a blurred arm.
    if (prev.src === 'pose' && src === 'pose' && dist > CONFIG.poseMaxStep * W) return ignore();
    // A long gap means the tracker lost the hand, usually to motion blur in a fast swipe. Sweep across
    // it only if the hand was already moving fast in roughly this direction; otherwise it is a hand
    // that reappeared somewhere else, which must not slice everything in between.
    if (dt > CONFIG.bridgeAfterMs) {
      const pSpeed = pv ? (Math.hypot(pv.x, pv.y) * 1000) / W : 0;
      const movingThatWay = pSpeed >= CONFIG.bridgeMinSpeed && cosPrev >= 0.5;
      // The fastest swipes blur from the very first frame, so there is no "already moving" sample.
      // But a hand that vanishes and reappears far away within a short gap can only have got there
      // by moving fast, so that is a swipe too.
      const fastShortGap = dt <= CONFIG.bridgeFastGapMs && speed >= CONFIG.bridgeImpliedSpeed;
      if (!movingThatWay && !fastShortGap) {
        if (debugBlade) debugGaps.push({ ax: prev.x, ay: prev.y, bx: lx, by: ly, t, ok: false });
        return ignore();
      }
      if (debugBlade) debugGaps.push({ ax: prev.x, ay: prev.y, bx: lx, by: ly, t, ok: true });
    }
    // Speed of the stroke, not just this segment: at 30 fps one segment of a real swipe is often slow
    // (the hand decelerating over the word, or smoothing), so the previous segment's speed counts too.
    here.speed = speed;
    if (Math.max(speed, prev.speed ?? 0) < CONFIG.minSliceSpeed) return;

    // Sweep in each word's own frame: the word moved during dt too (a lot, over a tracking gap), so
    // compare the blade path with where the word was at the start and end of that same interval.
    const dts = dt / 1000;
    const g = CONFIG.gravity;
    for (const it of items) {
      if (state === 'over') break; // slicing brainrot can end the game mid-stroke
      if (it.sliced) continue;
      const half = Math.max(0, it.w / 2 - it.h / 2);
      const ax = Math.cos(it.rot) * half;
      const ay = Math.sin(it.rot) * half;
      const r = it.h / 2 + CONFIG.hitPad;
      const pastX = it.x - it.vx * dts;
      const pastY = it.y - (it.vy * dts - 0.5 * g * dts * dts);
      const hit = segSegDist2(prev.x - pastX, prev.y - pastY, lx - it.x, ly - it.y, -ax, -ay, ax, ay) <= r * r;
      if (hit) slice(it, dx, dy);
    }
    items = items.filter((it) => !it.sliced);
  }

  function slice(it, dx, dy) {
    it.sliced = true;
    if (it.kind === 'warmup') {
      // Practice target: sparks and sound (sent as a 0-point correct slice), no score, stats or lives.
      split(it, dx, dy);
      bus.emit('item:slice', { term: it.term, kind: 'correct', x: it.x / W, y: it.y / H, points: 0, combo: 0, definition: '' });
      return;
    }
    if (it.kind === 'correct') learn.correctSliced++;
    if (it.kind === 'wrong') learn.wrongSliced++;
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
        addCard({ title: `✗ NOT IT: ${it.term}`, body: definition(it.term), color: CARD_COLOR.wrong });
      }
    }
    score = Math.max(0, score + points);
    split(it, dx, dy);
    const def = it.kind === 'brainrot' ? '' : definition(it.term);
    bus.emit('item:slice', { term: it.term, kind: it.kind, x: it.x / W, y: it.y / H, points, combo, definition: def });
    bus.emit('score:update', { score, combo });
    if (it.kind === 'brainrot') {
      loseLife();
      if (state !== 'over') freezeLeft = CONFIG.brainrotFreezeMs / 1000;
    }
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
    addCard({ title: `MISSED: ${it.term}`, body: definition(it.term), color: CARD_COLOR.miss });
    bus.emit('item:miss', { term: it.term, definition: definition(it.term) });
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

    if (state === 'warmup') {
      warmupTime += dt;
      spawnTimer -= dt;
      if (spawnTimer <= 0 && warmupTime < CONFIG.warmupSeconds - 1) {
        launch('SLICE ME', 'warmup', {});
        spawnTimer = 0.7;
      }
      if (warmupTime >= CONFIG.warmupSeconds) {
        for (const it of items) burst(it);
        items = [];
        bus.emit('warmup:end', {});
        startRound(0);
      }
    }

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
    cards = cards.filter((c) => clock - c.born < CARD_MS);
    if (banner && clock - banner.born > BANNER_MS) banner = null;

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
    const edge = it.kind === 'warmup' ? '#39ff14' : '#00e5ff';
    ctx.strokeStyle = edge;
    ctx.shadowColor = edge;
    ctx.shadowBlur = 14;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#f4f8ff';
    ctx.fillText(it.term, 0, 2);
    // Terms you got wrong before wear a tab. Correct and wrong terms both can, so it gives nothing away.
    if (it.review) {
      ctx.font = TAG_FONT;
      const label = '↻ REVIEW';
      const tw = ctx.measureText(label).width + 16;
      roundRectPath(ctx, -w / 2 + 12, -h / 2 - 24, tw, 26, 6);
      ctx.fillStyle = REVIEW_COLOR;
      ctx.fill();
      ctx.fillStyle = '#1a1200';
      ctx.fillText(label, -w / 2 + 12 + tw / 2, -h / 2 - 10);
      ctx.font = FONT;
    }
  }

  function drawCards() {
    let bottom = H - 14;
    for (let i = cards.length - 1; i >= 0; i--) {
      const c = cards[i];
      const age = clock - c.born;
      ctx.globalAlpha = clamp(Math.min(age / 150, (CARD_MS - age) / 500), 0, 1);
      const x = W / 2 - c.w / 2;
      const y = bottom - c.h;
      bottom = y - 8;
      roundRectPath(ctx, x, y, c.w, c.h, 8);
      ctx.fillStyle = 'rgba(6, 10, 20, 0.88)';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = c.color;
      ctx.stroke();
      ctx.textAlign = 'left';
      ctx.font = CARD_TITLE_FONT;
      ctx.fillStyle = c.color;
      ctx.fillText(c.title, x + CARD_PAD, y + CARD_PAD + CARD_TITLE_H / 2);
      ctx.font = CARD_BODY_FONT;
      ctx.fillStyle = '#e8f0ff';
      c.lines.forEach((l, k) =>
        ctx.fillText(l, x + CARD_PAD, y + CARD_PAD + CARD_TITLE_H + CARD_LINE_H / 2 + k * CARD_LINE_H),
      );
    }
    ctx.globalAlpha = 1;
  }

  function drawBanner(b) {
    const age = clock - b.born;
    ctx.globalAlpha = clamp(Math.min(age / 200, (BANNER_MS - age) / 500), 0, 1);
    ctx.font = BANNER_TITLE_FONT;
    const w1 = ctx.measureText(b.title).width;
    ctx.font = BANNER_SUB_FONT;
    const w2 = ctx.measureText(b.sub).width;
    const w = Math.min(W - 24, Math.max(w1, w2) + 40);
    const h = 84;
    const y = H * 0.68;
    roundRectPath(ctx, W / 2 - w / 2, y - h / 2, w, h, 10);
    ctx.fillStyle = 'rgba(6, 10, 20, 0.92)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = REVIEW_COLOR;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.font = BANNER_TITLE_FONT;
    ctx.fillStyle = REVIEW_COLOR;
    ctx.fillText(b.title, W / 2, y - 14);
    ctx.font = BANNER_SUB_FONT;
    ctx.fillStyle = '#e8f0ff';
    ctx.fillText(b.sub, W / 2, y + 20);
    ctx.globalAlpha = 1;
  }

  function drawBrainrot(it, t) {
    const { w, h } = it;
    const calm = reducedMotion?.matches; // no per-frame jitter or torn bands for reduced motion
    const jx = calm ? 0 : rand(-2.5, 2.5);
    const jy = calm ? 0 : rand(-2, 2);
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
    if (!calm && Math.random() < 0.5) {
      const by = rand(-h / 2, h / 2 - 10);
      ctx.save();
      ctx.beginPath();
      ctx.rect(-w / 2 - 20, by, w + 40, rand(5, 12));
      ctx.clip();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(it.term, rand(-14, 14), 2);
      ctx.restore();
    }
    // Brainrot characters get a tab so judges notice the rare one (slicing it still costs a life).
    if (it.character) {
      ctx.font = TAG_FONT;
      const label = '★ RARE BRAINROT';
      const tw = ctx.measureText(label).width + 16;
      roundRectPath(ctx, -w / 2 + 12, -h / 2 - 24, tw, 26, 6);
      ctx.fillStyle = '#ff2bd6';
      ctx.fill();
      ctx.fillStyle = '#16001a';
      ctx.fillText(label, -w / 2 + 12 + tw / 2, -h / 2 - 10);
      ctx.font = FONT;
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
    const keep = 700; // ms of history, long enough to see what happened during a fast swipe
    for (const [id, tr] of trails) {
      while (tr.length && now - tr[0].t > keep) tr.shift();
      if (!tr.length) {
        trails.delete(id);
        continue;
      }
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.beginPath();
      tr.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
      // One dot per tracked camera frame: white/orange from the hand tracker (hand 0/1), cyan where
      // the body (pose) tracker filled in while the hand was lost.
      for (const p of tr) {
        ctx.fillStyle = p.src === 'pose' ? '#00e5ff' : id ? '#ff9f1c' : '#ffffff';
        ctx.fillRect(p.x - 4, p.y - 4, 8, 8);
      }
    }
    while (debugGaps.length && now - debugGaps[0].t > keep) debugGaps.shift();
    ctx.lineWidth = 6;
    for (const gp of debugGaps) {
      ctx.strokeStyle = gp.ok ? '#39ff14' : '#ff3355'; // green: gap swept across, red: gap ignored
      ctx.beginPath();
      ctx.moveTo(gp.ax, gp.ay);
      ctx.lineTo(gp.bx, gp.by);
      ctx.stroke();
    }
  }

  function draw(now) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.textBaseline = 'middle';
    // Learning overlays go underneath, so flying chips always stay visible and sliceable.
    drawCards();
    if (banner) drawBanner(banner);
    ctx.font = FONT;
    ctx.textAlign = 'center';
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
    if (debugBlade) drawBlade(now);
    if (state === 'warmup') {
      const left = Math.max(0, Math.ceil(CONFIG.warmupSeconds - warmupTime));
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.textAlign = 'center';
      ctx.font = BANNER_TITLE_FONT;
      ctx.fillStyle = '#39ff14';
      ctx.fillText(`WARM-UP: SWIPE THROUGH THE WORDS · ${left}`, W / 2, H * 0.28);
      ctx.font = BANNER_SUB_FONT;
      ctx.fillStyle = '#e8f0ff';
      ctx.fillText('No points, no lives. Just get the feel.', W / 2, H * 0.28 + 34);
      ctx.font = FONT;
    }
    drawMenu(now);
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!paused && state !== 'idle') {
      if (freezeLeft > 0) freezeLeft -= dt;
      else update(dt);
    }
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
      cards = [];
      banner = null;
      termStats = {};
      pickStats = structuredClone(history);
      characterShown = false;
      startHistory = structuredClone(history);
      learn = { correctTotal: 0, correctSliced: 0, wrongTotal: 0, wrongSliced: 0 };
      menuTarget = null;
      menuTrails.clear();
      paused = false;
      freezeLeft = 0;
      blades.clear();
      bus.emit('game:start', { deckId: deck.id, deckTitle: deck.title, totalRounds: deck.rounds.length });
      bus.emit('score:update', { score, combo });
      bus.emit('lives:update', { lives, max: CONFIG.maxLives });
      if (CONFIG.warmupSeconds > 0) {
        // Practice: a few "SLICE ME" targets, no score or lives, so first-time players learn the gesture.
        state = 'warmup';
        warmupTime = 0;
        spawnTimer = 0.3;
        bus.emit('warmup:start', { seconds: CONFIG.warmupSeconds });
      } else {
        startRound(0);
      }
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
