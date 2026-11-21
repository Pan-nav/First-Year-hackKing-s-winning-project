import { bus } from '../bus.js';

export function initFx(canvas) {
  const ctx = canvas.getContext('2d');
  const stage = document.getElementById('stage');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const trails = new Map();
  const particles = [];
  const popups = [];
  let deepFryTimer;
  let shakeTimer;
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
  bus.on('item:slice', ({ kind, x = 0.5, y = 0.5, points = 0 }) => {
    const cx = x * canvas.clientWidth, cy = y * canvas.clientHeight;
    const color = kind === 'correct' ? '#56ff97' : kind === 'brainrot' ? '#ffcc39' : '#ff4f87';
    const count = reduced.matches ? 7 : kind === 'brainrot' ? 38 : 22;
    for (let i = 0; i < count && particles.length < 200; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 200;
      particles.push({ x: cx, y: cy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, born: performance.now(), life: 400 + Math.random() * 350, color, emoji: kind === 'brainrot' && i % 8 === 0 ? '💀' : '' });
    }
    popups.push({ x: cx, y: cy, born: performance.now(), points, color });
    if (kind === 'wrong' || kind === 'brainrot') {
      if (!reduced.matches) {
        stage.classList.remove('shake'); void stage.offsetWidth; stage.classList.add('shake');
        clearTimeout(shakeTimer); shakeTimer = setTimeout(() => stage.classList.remove('shake'), 380);
      }
    }
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
      ctx.fillStyle = p.color; ctx.font = 'bold 22px monospace'; ctx.textAlign = 'center';
      ctx.fillText(`${p.points > 0 ? '+' : ''}${p.points}`, p.x, p.y - age * 0.05);
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0; ctx.textAlign = 'start';
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
