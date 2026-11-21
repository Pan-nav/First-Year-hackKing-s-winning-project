// OWNER builds this (tasks O2-O4): game loop, spawning, physics, swept-collision slicing,
// rounds, lives, scoring. It listens for blade:* and ui:* events and emits the events in docs/CONTRACT.md.
// For now it only draws the blade so hand tracking can be checked (green trail follows your fingertip).
import { bus } from '../bus.js';

export function createEngine({ canvas }) {
  const ctx = canvas.getContext('2d');
  const resize = () => {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
  };
  window.addEventListener('resize', resize);
  resize();

  const trails = new Map(); // id -> [{ x, y, t }]
  bus.on('blade:point', ({ id, x, y, t }) => {
    const trail = trails.get(id) ?? [];
    trail.push({ x, y, t });
    trails.set(id, trail);
  });
  bus.on('blade:end', ({ id }) => trails.set(id, []));

  let running = false;
  function frame(now) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (running) {
      ctx.fillStyle = '#39ff14';
      ctx.font = '24px monospace';
      ctx.fillText('ENGINE STUB: hand tracking check. Wave your index finger.', 40, 60);
      ctx.strokeStyle = '#39ff14';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      for (const [id, trail] of trails) {
        while (trail.length && now - trail[0].t > 250) trail.shift();
        ctx.beginPath();
        trail.forEach((p, i) => (i ? ctx.lineTo(p.x * canvas.width, p.y * canvas.height) : ctx.moveTo(p.x * canvas.width, p.y * canvas.height)));
        ctx.stroke();
        if (trail.length === 0) trails.delete(id);
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    start({ deck, brainrot }) {
      running = true;
      console.log('engine.start', deck.id, `${brainrot.length} brainrot words`);
      bus.emit('game:start', { deckId: deck.id, deckTitle: deck.title, totalRounds: deck.rounds.length });
    },
    stop() {
      running = false;
    },
  };
}
