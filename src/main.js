// OWNER owns this file: wires the modules together.
import { bus } from './bus.js';
import { loadDeck, loadBrainrot } from './decks.js';
import { createEngine } from './game/engine.js';
import { startHandTracker } from './input/handTracker.js';
import { startMouseBlade } from './input/mouseBlade.js';
import { initAudio } from './ui/audio.js';
import { initFx } from './ui/effects.js';
import { initHud } from './ui/hud.js';
import { initScreens } from './ui/screens.js';

window.bus = bus; // handy for testing in the console: bus.emit('round:start', { ... })

const params = new URLSearchParams(location.search);
const defaultInput = params.get('input') === 'mouse' ? 'mouse' : 'hands';

const stage = document.getElementById('stage');
const engine = createEngine({ canvas: document.getElementById('game') });

initScreens();
initHud();
initFx(document.getElementById('fx'));
initAudio();

let stopInput = null;
async function useInput(kind) {
  if (stopInput) stopInput();
  stopInput = null;
  if (kind === 'hands') {
    try {
      stopInput = await startHandTracker({ video: document.getElementById('cam') });
      return;
    } catch (err) {
      console.warn('Hand tracking unavailable, falling back to mouse:', err);
    }
  }
  stopInput = startMouseBlade(stage);
}

bus.on('ui:start', async ({ deckId, input = defaultInput }) => {
  await useInput(input);
  const [deck, brainrot] = await Promise.all([loadDeck(deckId), loadBrainrot()]);
  engine.start({ deck, brainrot });
});

// Dev shortcut: /?input=mouse&deck=sql-databases starts straight into a game (no start screen needed).
if (params.get('deck')) bus.emit('ui:start', { deckId: params.get('deck') });
