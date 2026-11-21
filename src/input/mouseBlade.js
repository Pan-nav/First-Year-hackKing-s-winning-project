// Reference blade input: mouse or touch. Emits blade:point / blade:end (docs/CONTRACT.md).
// Hold the button and drag to slice. Used for testing and as the fallback when the camera fails.
import { bus } from '../bus.js';

export function startMouseBlade(el) {
  let down = false;

  const norm = (e) => {
    const r = el.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  const emitPoint = (e) => bus.emit('blade:point', { id: 0, ...norm(e), t: performance.now() });

  const onDown = (e) => {
    down = true;
    emitPoint(e);
  };
  const onMove = (e) => {
    if (down) emitPoint(e);
  };
  const onUp = () => {
    if (down) bus.emit('blade:end', { id: 0 });
    down = false;
  };

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);

  return () => {
    el.removeEventListener('pointerdown', onDown);
    el.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  };
}
