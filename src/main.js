// OWNER owns this file: wires the modules together.
import { bus } from './bus.js';
import { loadDeck, loadBrainrot } from './decks.js';
import { createEngine } from './game/engine.js';
import { startHandTracker } from './input/handTracker.js';
import { startMouseBlade } from './input/mouseBlade.js';
import { getTermStats, saveTermStats } from './storage.js';
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

// The running input is kept between games: restarting the camera and rebuilding the hand model
// on every PLAY AGAIN costs seconds. It is only swapped when the requested kind changes.
let stopInput = null;
let requestedInput = null;
async function useInput(kind) {
  if (kind === requestedInput && stopInput) return;
  if (stopInput) stopInput();
  stopInput = null;
  requestedInput = kind;
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

// O6: paste a job description, get a deck. Generated decks and the player's API key live in memory
// only: nothing is saved, and a reload forgets both. The SDK is loaded on first use, so it costs
// nothing for players who never open the job-spec panel.
const generatedDecks = new Map(); // deckId -> deck
// Demo laptop: a key in .env.local (git-ignored) is used when the player leaves the key field empty.
// Dev server only: import.meta.env.DEV is false in `npm run build`, so the key never reaches dist/.
const devKey = import.meta.env.DEV ? (import.meta.env.VITE_GEMINI_API_KEY ?? '') : '';
let apiKeyInMemory = devKey;
bus.emit('deck:keyStatus', { hasKey: Boolean(devKey) });
let generating = false;
bus.on('ui:generateDeck', async ({ jobText, apiKey }) => {
  if (generating) return;
  generating = true;
  if (apiKey) apiKeyInMemory = String(apiKey).trim();
  bus.emit('deck:generating', {});
  try {
    const [{ generateDeck }, brainrot] = await Promise.all([import('./game/deckGen.js'), loadBrainrot()]);
    const { deck, dropped } = await generateDeck({ jobText, apiKey: apiKeyInMemory, brainrot });
    if (dropped.length) console.info('[deckGen] dropped while validating:', dropped);
    generatedDecks.set(deck.id, deck);
    // Demo backup: copy(JSON.stringify(lastGeneratedDeck, null, 2)) in DevTools, save it to public/decks.
    window.lastGeneratedDeck = deck;
    bus.emit('deck:ready', {
      deckId: deck.id,
      title: deck.title,
      rounds: deck.rounds.map((r) => r.rule),
    });
  } catch (err) {
    console.warn('[deckGen]', err.cause ?? err);
    bus.emit('deck:error', { message: err.message });
  } finally {
    generating = false;
  }
});

let starting = false; // ignore double clicks on START while the camera and deck load
bus.on('ui:start', async ({ deckId, input = defaultInput }) => {
  if (starting) return;
  starting = true;
  try {
    await useInput(input);
    const [deck, brainrot] = await Promise.all([generatedDecks.get(deckId) ?? loadDeck(deckId), loadBrainrot()]);
    engine.start({ deck, brainrot, history: getTermStats() });
  } catch (err) {
    console.error('Could not start the game:', err);
  } finally {
    starting = false;
  }
});

// O4 adaptive repetition: fold this game's stats into the stored history (local only, no accounts).
engine.onGameOver((gameStats) => {
  const all = getTermStats();
  for (const [term, s] of Object.entries(gameStats)) {
    const prev = all[term] ?? { seen: 0, errors: 0 };
    all[term] = { seen: prev.seen + s.seen, errors: prev.errors + s.errors };
  }
  saveTermStats(all);
});

// Dev shortcut: /?input=mouse&deck=sql-databases starts straight into a game (no start screen needed).
if (params.get('deck')) bus.emit('ui:start', { deckId: params.get('deck') });
