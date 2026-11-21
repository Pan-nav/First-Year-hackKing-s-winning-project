import { bus } from '../bus.js';

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
  let deepFryTimer;
  let shakeTimer;
  let consequenceTimer;
  // Original emoji/CSS interpretations: no external meme artwork or audio.
  const consequences = {
    'rizz': { emoji: '💔', title: 'RIZZ REJECTED', subtitle: '-1000 AURA (JUST KIDDING)', style: 'hearts' },
    'skibidi': { emoji: '🚽', title: 'SKIBIDI ALERT', subtitle: 'THE TOILET HAS ENTERED THE CHAT', style: 'bounce' },
    'sigma': { emoji: '😎', title: 'NOT VERY SIGMA', subtitle: 'THE BRAIN HAS SUNGLASSES NOW', style: 'cool' },
    'ohio': { emoji: '🙃', title: 'ONLY IN OHIO', subtitle: 'YOUR WORLD IS A LITTLE SIDEWAYS', style: 'tilt' },
    'aura': { emoji: '💀', title: '-9999 AURA', subtitle: 'YOUR VIBES HAVE BEEN AUDITED', style: 'bounce' },
    'aura farming': { emoji: '💀', title: '-9999 AURA', subtitle: 'YOUR VIBES HAVE BEEN AUDITED', style: 'bounce' },
    'gyatt': { emoji: '🍟', title: 'EXTRA CRISPY', subtitle: 'MAXIMUM DEEP FRY', style: 'fry' },
    'tralalero': { emoji: '🦈', title: 'SHARK INVASION', subtitle: 'TRALALERO SWIMS BY', style: 'swim' },
    'cappuccina': { emoji: '☕', title: 'COFFEE BREAK!', subtitle: 'THE CUP IS DANCING', style: 'tilt' },
    'tung tung sahur': { emoji: '🪵', title: 'TUNG TUNG TUNG', subtitle: 'BONK! TIME TO REVISE', style: 'bounce' },
    'bombardiro': { emoji: '🐊', title: 'CROCODILE FLYBY', subtitle: 'PIXEL CLOUDS INCOMING', style: 'swim' },
  };
  const consequenceOverlay = document.createElement('div');
  consequenceOverlay.id = 'brainrot-consequence';
  consequenceOverlay.setAttribute('aria-live', 'polite');
  consequenceOverlay.setAttribute('aria-atomic', 'true');
  consequenceOverlay.hidden = true;
  stage.append(consequenceOverlay);
  function showConsequence(term) {
    const effect = consequences[String(term ?? '').trim().toLowerCase()] || {
      emoji: '🧠', title: 'BRAINROT DETECTED', subtitle: 'KEEP THE KNOWLEDGE!', style: 'bounce'
    };
    // Set textContent instead of interpolating external term text into HTML.
    consequenceOverlay.replaceChildren();
    for (const [className, value] of [['consequence-emoji', effect.emoji], ['consequence-title', effect.title], ['consequence-subtitle', effect.subtitle]]) {
      const el = document.createElement('span'); el.className = className; el.textContent = value; consequenceOverlay.append(el);
    }
    consequenceOverlay.className = `consequence-${effect.style}`;
    consequenceOverlay.hidden = false;
    clearTimeout(consequenceTimer);
    consequenceTimer = setTimeout(() => { consequenceOverlay.hidden = true; consequenceOverlay.className = ''; }, 1450);
  }
  const resize = () => {
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(canvas.clientWidth * ratio);
    canvas.height = Math.round(canvas.clientHeight * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  };
  resize();
  window.addEventListener('resize', resize);
  bus.on('blade:point', ({ id = 0, x, y, t }) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const line = trails.get(id) || [];
    line.push({ x: x * canvas.clientWidth, y: y * canvas.clientHeight, t: performance.now() });
    if (line.length > 28) line.shift();
    trails.set(id, line);
  });
  bus.on('blade:end', ({ id = 0 }) => trails.delete(id));
  bus.on('item:slice', ({ term, kind, x = 0.5, y = 0.5, points = 0, combo = 0 }) => {
    const cx = x * canvas.clientWidth, cy = y * canvas.clientHeight;
    const color = kind === 'correct' ? '#56ff97' : kind === 'brainrot' ? '#ffcc39' : '#ff4f87';
    const count = reduced.matches ? 7 : kind === 'brainrot' ? 38 : kind === 'correct' ? 30 : 25;
    for (let i = 0; i < count && particles.length < 200; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 200;
      particles.push({ x: cx, y: cy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, born: performance.now(), life: 400 + Math.random() * 350, color, emoji: kind === 'brainrot' && i % 8 === 0 ? '💀' : '' });
    }
    popups.push({ x: cx, y: cy, born: performance.now(), points, color, kind });
    if (kind === 'correct') showCombo(Number(combo) || 0);
    else lastComboShown = 0;
    if (kind === 'wrong' || kind === 'brainrot') {
      if (!reduced.matches) {
        stage.classList.remove('shake'); void stage.offsetWidth; stage.classList.add('shake');
        clearTimeout(shakeTimer); shakeTimer = setTimeout(() => stage.classList.remove('shake'), 380);
      }
    }
    if (kind === 'brainrot') showConsequence(term);
    if (kind === 'brainrot' && !reduced.matches) {
      stage.classList.add('deepfried');
      clearTimeout(deepFryTimer);
      deepFryTimer = setTimeout(() => stage.classList.remove('deepfried'), 2000);
    }
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
        const alpha = Math.max(0, 1 - (now - fresh[i].t) / 250);
        const prev = fresh[i-1], point = fresh[i];
        ctx.shadowBlur = 18; ctx.shadowColor = id ? '#ff61cb' : '#00fff0';
        ctx.strokeStyle = id ? `rgba(255,97,203,${alpha})` : `rgba(0,255,240,${alpha})`;
        ctx.lineWidth = 2 + alpha * 6;
        ctx.beginPath(); ctx.moveTo(prev.x,prev.y); ctx.lineTo(point.x,point.y); ctx.stroke();
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
