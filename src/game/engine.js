// OWNER builds this (tasks O2-O4): game loop, spawning, physics, swept-collision slicing,
// rounds, lives, scoring. It listens for blade:* and ui:* events and emits the events in docs/CONTRACT.md.
import { bus } from '../bus.js';

export function createEngine({ canvas }) {
  const ctx = canvas.getContext('2d');
  const resize = () => {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
  };
  window.addEventListener('resize', resize);
  resize();

  let running = false;
  function frame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (running) {
      ctx.fillStyle = '#39ff14';
      ctx.font = '24px monospace';
      ctx.fillText('ENGINE STUB: the Owner is building this', 40, 60);
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
