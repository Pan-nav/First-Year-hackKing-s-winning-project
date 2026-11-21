import { bus } from '../bus.js';
import { CONFIG } from '../config.js';

export function initFx(canvas) {
  const ctx = canvas.getContext('2d');
  const stage = document.getElementById('stage');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const trails = new Map();
  const particles = [];
  const popups = [];
  let lastComboShown = 0;
  const comboFlash = document.createElement('div');
  comboFlash.className = 'slice-combo-flash';
  comboFlash.hidden = true;
  comboFlash.setAttribute('aria-live', 'polite');
  stage.append(comboFlash);
  let comboTimer;
  function showCombo(combo) {
    if (combo < 3 || combo <= lastComboShown) return;
    lastComboShown = combo;
    comboFlash.textContent = combo >= 10 ? `UNSTOPPABLE! ×${combo}` : combo >= 5 ? `MEGA COMBO! ×${combo}` : `TRIPLE SLICE! ×${combo}`;
    comboFlash.hidden = false;
    comboFlash.classList.remove('combo-pop');
    if (!reduced.matches) { void comboFlash.offsetWidth; comboFlash.classList.add('combo-pop'); }
    clearTimeout(comboTimer);
    comboTimer = setTimeout(() => { comboFlash.hidden = true; }, 950);
  }
  bus.on('game:start', () => { lastComboShown = 0; comboFlash.hidden = true; });
  bus.on('round:start', () => { lastComboShown = 0; });
  let shakeTimer;
  let takeoverTimer;
  // Original emoji/CSS interpretations: no external meme artwork or audio.
  // style picks the big emoji's animation; extra is the emoji that rains (or bursts) around it.
  const consequences = {
    'rizz': { emoji: '💔', title: 'RIZZ REJECTED', subtitle: '-1000 AURA (JUST KIDDING)', style: 'pulse', extra: '💔' },
    'skibidi': { emoji: '🚽', title: 'SKIBIDI ALERT', subtitle: 'THE TOILET HAS ENTERED THE CHAT', style: 'bounce', extra: '🧻' },
    'sigma': { emoji: '😎', title: 'NOT VERY SIGMA', subtitle: 'THE BRAIN HAS SUNGLASSES NOW', style: 'pulse', extra: '🕶️' },
    'ohio': { emoji: '🙃', title: 'ONLY IN OHIO', subtitle: 'YOUR WORLD IS A LITTLE SIDEWAYS', style: 'tilt', extra: '🌽' },
    'aura': { emoji: '💀', title: '-9999 AURA', subtitle: 'YOUR VIBES HAVE BEEN AUDITED', style: 'bounce', extra: '💀' },
    'aura farming': { emoji: '💀', title: '-9999 AURA', subtitle: 'YOUR VIBES HAVE BEEN AUDITED', style: 'bounce', extra: '💀' },
    'tralalero': { emoji: '🦈', title: 'TRALALERO TRALALA', subtitle: 'A SHARK IN SNEAKERS SWAM OFF WITH YOUR FOCUS', style: 'swim', extra: '👟' },
    'bombardiro': { emoji: '🐊', title: 'BOMBARDIRO CROCODILO', subtitle: 'BOMBS AWAY ON YOUR REVISION', style: 'fly', extra: '💣' },
    'cappuccina': { emoji: '☕', title: 'BALLERINA CAPPUCCINA', subtitle: 'SHE PIROUETTED THROUGH YOUR BRAIN CELLS', style: 'spin', extra: '✨' },
    'tung tung sahur': { emoji: '🪵', title: 'TUNG TUNG TUNG SAHUR', subtitle: 'BONK! TIME TO REVISE', style: 'bonk', extra: '💥' },
  };
  // Full-screen takeover after a brainrot slice. The engine freezes play for CONFIG.brainrotFreezeMs
  // at the same moment, so covering the whole screen hides nothing that is still moving.
  // Tailwind utilities; the keyframes live in src/styles/tailwind.css. Only transform and opacity are
  // animated (no filters), so it stays cheap over the camera feed. Class strings must stay literal so
  // Tailwind can find them.
  const EMOJI_ANIM = {
    bonk: 'animate-rot-bonk origin-bottom',
    swim: 'animate-rot-swim',
    fly: 'animate-rot-fly',
    spin: 'animate-rot-spin',
    bounce: 'animate-rot-bounce',
    tilt: 'animate-rot-tilt',
    pulse: 'animate-rot-pulse',
  };
  const TRAVELS = new Set(['swim', 'fly']); // these cross the whole screen during the takeover
  const DROP_LEFTS = { fly: [88, 74, 60, 46, 32, 18], other: [10, 82, 28, 66, 46, 90] }; // fly: bombs follow the croc
  const BURSTS = [[58, 30], [34, 22], [62, 14]]; // bonk: one impact burst per swing (left%, top%)
  const takeover = document.createElement('div');
  takeover.id = 'rot-takeover';
  takeover.className = 'pointer-events-none absolute inset-0 z-10 overflow-hidden';
  takeover.setAttribute('aria-live', 'assertive');
  takeover.setAttribute('aria-atomic', 'true');
  takeover.hidden = true;
  stage.append(takeover);
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    node.className = className;
    if (text != null) node.textContent = text; // textContent: terms are never parsed as HTML
    return node;
  };
  const hideTakeover = () => {
    clearTimeout(takeoverTimer);
    takeover.hidden = true;
    takeover.replaceChildren();
  };
  function showTakeover(term, points) {
    const name = String(term ?? '').trim();
    const fx = consequences[name.toLowerCase()] || {
      emoji: '🧠', title: `${(name || 'BRAINROT').toUpperCase()}?!`, subtitle: 'THAT IS BRAINROT. KEEP THE KNOWLEDGE!', style: 'pulse', extra: '💀',
    };
    const ms = Math.max(600, Number(CONFIG.brainrotFreezeMs) || 1500);
    const marquee = ' ⚠ BRAINROT DETECTED ⚠ '.repeat(8);
    const strip = (place, reverse) => {
      const band = el('div', `absolute -left-[5%] w-[110%] bg-rot-yellow py-[0.7vh] font-arcade text-[clamp(10px,1.6vw,20px)] text-black whitespace-nowrap shadow-[0_0_24px_#ff59be] ${place}`);
      const run = el('div', 'w-max animate-rot-marquee', marquee + marquee);
      if (reverse) run.style.animationDirection = 'reverse';
      band.append(run);
      return band;
    };
    const emoji = el('span', `block leading-none text-[min(32vh,30vw)] ${EMOJI_ANIM[fx.style] || EMOJI_ANIM.pulse}`, fx.emoji);
    if (TRAVELS.has(fx.style)) emoji.style.animationDuration = `${ms}ms`;
    const pts = Number(points);
    const center = el('div', 'absolute inset-0 flex flex-col items-center justify-center gap-[1.5vh] px-[4vw] text-center animate-rot-pop');
    center.append(
      emoji,
      el('span', 'font-arcade text-[clamp(18px,4vw,56px)] leading-tight text-rot-yellow [text-shadow:0.08em_0.08em_0_#b5286c] animate-rot-glitch', fx.title),
      el('span', 'font-mono font-bold text-[clamp(14px,2vw,26px)] tracking-wide text-white', fx.subtitle),
      el('span', 'font-arcade text-[clamp(12px,2.2vw,28px)] text-rot-pink', `${Number.isFinite(pts) && pts ? `${pts} POINTS · ` : ''}-1 🧠`),
    );
    const layers = [
      el('div', 'absolute inset-0 bg-[radial-gradient(ellipse_at_center,#3b0a52f0_0%,#0b0214f7_72%)]'),
      el('div', 'absolute inset-0 opacity-25 bg-[repeating-linear-gradient(120deg,#ff4f00_0_14px,transparent_14px_28px)]'),
      strip('top-[9%] -rotate-2', false),
      strip('bottom-[9%] rotate-2', true),
      center,
    ];
    if (!reduced.matches) {
      if (fx.style === 'bonk') {
        BURSTS.forEach(([left, top], i) => {
          const burst = el('span', 'absolute text-[clamp(60px,16vh,180px)] animate-rot-burst', fx.extra);
          Object.assign(burst.style, { left: `${left}%`, top: `${top}%`, animationDelay: `${0.23 + 0.42 * i}s` });
          layers.push(burst);
        });
      } else {
        (DROP_LEFTS[fx.style] || DROP_LEFTS.other).forEach((left, i) => {
          const drop = el('span', 'absolute top-0 text-[clamp(32px,8vh,90px)] animate-rot-drop', fx.extra);
          Object.assign(drop.style, { left: `${left}%`, animationDelay: `${0.12 * i}s` });
          layers.push(drop);
        });
      }
    }
    // Fresh children and a re-added class restart every animation, even for the same character twice.
    clearTimeout(takeoverTimer);
    takeover.classList.remove('animate-rot-takeover');
    takeover.replaceChildren(...layers);
    takeover.style.animationDuration = `${ms}ms`;
    takeover.hidden = false;
    void takeover.offsetWidth;
    takeover.classList.add('animate-rot-takeover');
    takeoverTimer = setTimeout(hideTakeover, ms);
  }
  bus.on('game:start', hideTakeover);
  const resize = () => {
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(canvas.clientWidth * ratio);
    canvas.height = Math.round(canvas.clientHeight * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  };
  resize();
  window.addEventListener('resize', resize);
  // The trail only joins points the engine would also slice along (onBladePoint in src/game/engine.js):
  // an impossible jump, a sideways switch between hand and body tracker, or a pose glitch starts a new
  // line instead of drawing a zig-zag across the screen.
  bus.on('blade:point', ({ id = 0, x, y, t, src }) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const w = canvas.clientWidth || 1;
    const now = performance.now();
    const line = trails.get(id) || [];
    const p = { x: x * w, y: y * canvas.clientHeight, t: now, at: Number.isFinite(t) ? t : now, pose: src === 'pose', dx: 0, dy: 0, gap: false };
    const prev = line.at(-1);
    if (prev) {
      p.dx = p.x - prev.x;
      p.dy = p.y - prev.y;
      const dist = Math.hypot(p.dx, p.dy) / w; // screen widths, as the engine measures
      const speed = dist / Math.max((p.at - prev.at) / 1000, 1e-3);
      const turn = (prev.dx * p.dx + prev.dy * p.dy) / (Math.hypot(prev.dx, prev.dy) * Math.hypot(p.dx, p.dy) || 1);
      p.gap = (dist > CONFIG.maxJump && speed > CONFIG.maxBladeSpeed)
        || (prev.pose !== p.pose && dist > CONFIG.switchMaxJump && turn < 0.5)
        || (prev.pose && p.pose && dist > CONFIG.poseMaxStep);
      if (p.gap) { p.dx = 0; p.dy = 0; }
    }
    line.push(p);
    if (line.length > 28) line.shift();
    trails.set(id, line);
  });
  bus.on('blade:end', ({ id = 0 }) => trails.delete(id));
  bus.on('item:slice', ({ term, kind, x = 0.5, y = 0.5, points = 0, combo = 0 }) => {
    const cx = x * canvas.clientWidth, cy = y * canvas.clientHeight;
    const color = kind === 'correct' ? '#56ff97' : kind === 'brainrot' ? '#ffcc39' : '#ff4f87';
    const count = reduced.matches ? 7 : kind === 'brainrot' ? 24 : kind === 'correct' ? 30 : 25;
    for (let i = 0; i < count && particles.length < 200; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 200;
      particles.push({ x: cx, y: cy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, born: performance.now(), life: 400 + Math.random() * 350, color, emoji: kind === 'brainrot' && i % 6 === 0 ? '💀' : '' });
    }
    if (points) popups.push({ x: cx, y: cy, born: performance.now(), points, color, kind }); // no floating 0 for warm-up / menu slices
    if (kind === 'correct') showCombo(Number(combo) || 0);
    else lastComboShown = 0;
    if (kind === 'wrong' || kind === 'brainrot') {
      if (!reduced.matches) {
        stage.classList.remove('shake'); void stage.offsetWidth; stage.classList.add('shake');
        clearTimeout(shakeTimer); shakeTimer = setTimeout(() => stage.classList.remove('shake'), 380);
      }
    }
    if (kind === 'brainrot') showTakeover(term, points);
  });
  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.04); last = now;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    for (const [id, trail] of trails) {
      const fresh = trail.filter(p => now - p.t < 250);
      if (!fresh.length) { trails.delete(id); continue; }
      trails.set(id, fresh);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (let i = 1; i < fresh.length; i++) {
        if (fresh[i].gap) continue; // a glitch jump: don't draw a line across it
        const alpha = Math.max(0, 1 - (now - fresh[i].t) / 250);
        const prev = fresh[i-1], point = fresh[i];
        // Fake the glow with a wide translucent stroke: shadowBlur per segment was the costliest thing drawn each frame.
        const rgb = id ? '255,97,203' : '0,255,240';
        ctx.beginPath(); ctx.moveTo(prev.x,prev.y); ctx.lineTo(point.x,point.y);
        ctx.strokeStyle = `rgba(${rgb},${alpha * 0.25})`; ctx.lineWidth = 10 + alpha * 12; ctx.stroke();
        ctx.strokeStyle = `rgba(${rgb},${alpha})`; ctx.lineWidth = 2 + alpha * 6; ctx.stroke();
      }
      ctx.shadowBlur = 0;
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i], age = now - p.born;
      if (age > p.life) { particles.splice(i,1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 270 * dt;
      ctx.globalAlpha = Math.max(0, 1 - age / p.life);
      if (p.emoji) { ctx.font = '20px sans-serif'; ctx.fillText(p.emoji, p.x, p.y); }
      else { ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, 4, 4); }
    }
    for (let i = popups.length - 1; i >= 0; i--) {
      const p = popups[i], age = now - p.born;
      if (age > 750) { popups.splice(i,1); continue; }
      ctx.globalAlpha = 1 - age / 750;
      ctx.fillStyle = p.color;
      ctx.font = `bold ${p.kind === 'correct' ? 34 : 30}px monospace`;
      ctx.textAlign = 'center';
      ctx.shadowColor = p.color; ctx.shadowBlur = reduced.matches ? 0 : 18;
      const label = `${p.points > 0 ? '+' : ''}${p.points}`;
      ctx.fillText(label, p.x, p.y - age * 0.065);
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0; ctx.textAlign = 'start';
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
