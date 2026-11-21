import { bus } from '../bus.js';
import { loadDeckIndex } from '../decks.js';
import { addHighScore, getHighScores } from '../storage.js';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const listMarkup = (items, empty) => items?.length ? `<ul class="term-list">${items.map(({term,definition}) => `<li><strong>${escapeHtml(term)}</strong><span>${escapeHtml(definition)}</span></li>`).join('')}</ul>` : `<p class="muted">${empty}</p>`;

export async function initScreens() {
  const root = document.getElementById('screens');
  let decks = [];
  let deckId = '';
  let input = new URLSearchParams(location.search).get('input') === 'mouse' ? 'mouse' : 'hands';
  let mainAction = null;
  let screen = 'start';

  const setScreen = (name, html, action) => {
    screen = name;
    mainAction = action;
    root.innerHTML = `<div class="screen screen-${name}"><div class="screen-panel">${html}</div></div>`;
  };
  const start = () => {
    if (!deckId) return;
    root.innerHTML = '';
    screen = 'playing';
    mainAction = null;
    bus.emit('ui:start', { deckId, input });
  };
  const showStart = () => {
    deckId = decks.some(d => d.id === deckId) ? deckId : (decks[0]?.id || '');
    setScreen('start', `<div class="eyebrow">◈ THE REVISION ARCADE ◈</div><h1 class="game-title glitch-title" data-text="SLICE THE ROT">SLICE THE ROT</h1><p class="tagline">SLICE THE ROT. KEEP THE KNOWLEDGE.</p><p class="lead">Cut the right terms. Dodge the distractions. Don't feed the brainrot.</p><h2>01 // SELECT YOUR DECK</h2><div class="deck-grid">${decks.map(d => `<button class="deck-choice ${d.id === deckId ? 'selected' : ''}" data-deck="${escapeHtml(d.id)}" aria-pressed="${d.id === deckId}"><strong>${escapeHtml(d.title)}</strong><small>${escapeHtml(d.description)}</small></button>`).join('')}</div><h2>02 // CHOOSE CONTROLS</h2><div class="input-toggle"><button data-input="hands" class="${input === 'hands' ? 'selected' : ''}" aria-pressed="${input === 'hands'}">◉ CAMERA / ARMS</button><button data-input="mouse" class="${input === 'mouse' ? 'selected' : ''}" aria-pressed="${input === 'mouse'}">↖ MOUSE / TEST</button></div><button class="primary-button coin-button" data-action="start" ${deckId ? '' : 'disabled'}>▶ INSERT COIN <span>START GAME</span></button><p class="fine-print">${input === 'hands' ? 'Stand back so your arms are in frame. Camera permission required.' : 'Mouse controls: move your cursor across a word to slice it.'}</p>`, start);
  };
  const showRound = ({ index = 0, missed = [], wrongSliced = [] }) => {
    const cont = () => { root.innerHTML = ''; screen = 'playing'; mainAction = null; bus.emit('ui:continue', {}); };
    setScreen('summary', `<div class="eyebrow">ROUND ${index + 1} COMPLETE</div><h1>KNOWLEDGE CHECK</h1><p class="lead">Review what slipped through before your next round.</p><div class="review-columns"><section><h2 class="text-green">MISSED TARGETS · ${missed.length}</h2>${listMarkup(missed, 'Perfect catch — nothing missed!')}</section><section><h2 class="text-pink">WRONG SLICES · ${wrongSliced.length}</h2>${listMarkup(wrongSliced, 'Clean run — no incorrect slices!')}</section></div><button class="primary-button" data-action="continue">▶ NEXT ROUND</button>`, cont);
  };
  const showGameOver = ({ score = 0, rounds = 0, weakTerms = [] }) => {
    const table = (scores) => scores.length ? `<ol class="leaderboard">${scores.map(e=>`<li><span>${escapeHtml(e.initials)}</span><strong>${Number(e.score) || 0}</strong></li>`).join('')}</ol>` : '<p class="muted">No scores yet. Make history!</p>';
    setScreen('over', `<div class="eyebrow">SESSION TERMINATED // ${Number(rounds) || 0} ROUNDS</div><h1>GAME OVER</h1><div class="final-score"><small>FINAL SCORE</small><strong>${Number(score) || 0}</strong></div><div class="result-columns"><section class="score-entry"><h2>ENTER INITIALS</h2><div class="initials-form"><input id="initials" aria-label="3-letter high-score initials" maxlength="3" pattern="[A-Za-z]{1,3}" placeholder="AAA" autocomplete="off" /><button data-action="save">SAVE</button></div><div id="score-message" aria-live="polite"></div><h2>TOP 10</h2><div id="leaderboard">${table(getHighScores())}</div></section><section><h2>YOUR WEAK TERMS</h2>${listMarkup(weakTerms, 'Nothing to revise. Keep the streak alive!')}</section></div><button class="primary-button" data-action="again">↻ PLAY AGAIN</button>`, showStart);
    root.querySelector('#initials')?.addEventListener('input', e => { e.target.value = e.target.value.replace(/[^a-z]/gi, '').toUpperCase(); });
    root.querySelector('[data-action="save"]')?.addEventListener('click', () => {
      const field = root.querySelector('#initials');
      const initials = field.value.trim().toUpperCase();
      if (!/^[A-Z]{1,3}$/.test(initials)) { root.querySelector('#score-message').textContent = 'Enter 1–3 letters.'; field.focus(); return; }
      root.querySelector('#leaderboard').innerHTML = table(addHighScore({ initials, score }));
      root.querySelector('#score-message').textContent = 'SCORE SAVED ✓';
      field.disabled = true;
      root.querySelector('[data-action="save"]').disabled = true;
    });
  };

  root.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.deck) { deckId = btn.dataset.deck; showStart(); }
    if (btn.dataset.input) { input = btn.dataset.input; showStart(); }
    if (btn.dataset.action === 'start') start();
    if (btn.dataset.action === 'continue') mainAction?.();
    if (btn.dataset.action === 'again') showStart();
  });
  document.addEventListener('keydown', e => {
    if (!['Enter', ' '].includes(e.key) || screen === 'playing' || e.repeat || e.target.matches('button, input, textarea, select')) return;
    e.preventDefault();
    mainAction?.();
  });
  bus.on('game:start', () => { root.innerHTML = ''; screen = 'playing'; mainAction = null; });
  bus.on('round:end', showRound);
  bus.on('game:over', showGameOver);
  try { decks = await loadDeckIndex(); showStart(); }
  catch (error) { setScreen('error', `<h1>DECK ERROR</h1><p>${escapeHtml(error.message)}</p><button onclick="location.reload()">RETRY</button>`, () => location.reload()); }
}
