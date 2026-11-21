// PARTNER builds this (task P1): start screen, round summary, game-over + leaderboard.
// Listens for round:end and game:over; emits ui:start and ui:continue. See docs/CONTRACT.md and AGENTS.md.
import { bus } from '../bus.js';
import { loadDeckIndex } from '../decks.js';

export async function initScreens() {
  const root = document.getElementById('screens');
  const decks = await loadDeckIndex();

  root.innerHTML = `
    <div class="screen">
      <h1>SLICE THE ROT</h1>
      <p>scaffold OK: pick a deck</p>
      ${decks.map((d) => `<button data-deck="${d.id}">${d.title}</button>`).join('')}
    </div>`;

  root.addEventListener('click', (e) => {
    const deckId = e.target?.dataset?.deck;
    if (!deckId) return;
    root.innerHTML = '';
    bus.emit('ui:start', { deckId });
  });
}
