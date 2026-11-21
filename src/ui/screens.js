import { bus } from '../bus.js';
import { loadDeckIndex } from '../decks.js';
import { addHighScore, getHighScores } from '../storage.js';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const listMarkup = (items, empty) => items?.length ? `<ul class="term-list">${items.map(({term,definition}) => `<li><strong>${escapeHtml(term)}</strong><span>${escapeHtml(definition)}</span></li>`).join('')}</ul>` : `<p class="muted">${empty}</p>`;
const tutorialSteps = [
  { icon: '📷', title: 'GET IN POSITION', message: 'Allow camera access. Stand back so your upper body and both hands are visible. Raise your hands to about shoulder height, shoulder-width apart.' },
  { icon: '🔴', title: 'FIND YOUR TWO LASER DOTS', message: 'Look for two glowing laser dots on screen: one follows your left hand, and one follows your right. Move both hands slowly to check that the dots follow you before slicing.' },
  { icon: '🎯', title: 'READ THE RULE', message: 'Each round has its own rule, like SLICE ONLY: SQL COMMANDS. A tech word is only correct when it matches that rule.' },
  { icon: '⚔️', title: 'SLICE THE RIGHT TERMS', message: 'Swipe through matching terms to score. Avoid plausible wrong answers and brainrot words or characters.' },
  { icon: '📈', title: 'LEARN AS YOU PLAY', message: 'Read your mistakes between rounds. At the end, check your score graph and your weakest terms.' }
];
const seenTutorialKey = 'str.tutorial.seen';
const hasSeenTutorial = () => { try { return localStorage.getItem(seenTutorialKey) === 'yes'; } catch { return false; } };
const markTutorialSeen = () => { try { localStorage.setItem(seenTutorialKey, 'yes'); } catch {} };

function graphMarkup(samples) {
  if (!samples.length) return '<p class="muted">No score updates were recorded this session.</p>';
  const width = 660, height = 170, left = 46, right = 12, top = 12, bottom = 28;
  const scores = samples.map(p => p.score);
  const min = Math.min(0, ...scores), max = Math.max(10, ...scores);
  const range = Math.max(1, max - min);
  const total = Math.max(1, samples.at(-1).elapsed);
  const point = (p) => `${(left + p.elapsed / total * (width-left-right)).toFixed(1)},${(top + (max - p.score) / range * (height-top-bottom)).toFixed(1)}`;
  const polyline = samples.map(point).join(' ');
  const zero = (top + (max / range) * (height-top-bottom)).toFixed(1);
  return `<div class="performance-graph" role="img" aria-label="Score progressed from ${samples[0].score} to ${samples.at(-1).score} across the session; minimum ${min}, maximum ${max}.">
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <line x1="${left}" y1="${top}" x2="${left}" y2="${height-bottom}" class="chart-axis" />
      <line x1="${left}" y1="${height-bottom}" x2="${width-right}" y2="${height-bottom}" class="chart-axis" />
      <line x1="${left}" y1="${zero}" x2="${width-right}" y2="${zero}" class="chart-zero" />
      <polyline points="${polyline}" fill="none" stroke="#58ff9a" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
      <circle cx="${point(samples.at(-1)).split(',')[0]}" cy="${point(samples.at(-1)).split(',')[1]}" r="5" fill="#ff59be" />
      <text x="${left-7}" y="${top+5}" text-anchor="end">${max}</text>
      <text x="${left-7}" y="${height-bottom+4}" text-anchor="end">${min}</text>
      <text x="${left}" y="${height-7}">START</text>
      <text x="${width-right}" y="${height-7}" text-anchor="end">END</text>
    </svg>
    <p class="chart-legend">CUMULATIVE SCORE · ${samples.length - 1} SCORE CHANGES</p>
  </div>`;
}

export async function initScreens() {
  const root = document.getElementById('screens');
  let decks = [];
  let deckId = '';
  const input = 'hands';
  let mainAction = null;
  let screen = 'start';
  let tutorialIndex = 0;
  let startedAt = 0;
  let samples = [];
  let latestScore = 0;

  const setScreen = (name, html, action) => {
    screen = name;
    mainAction = action;
    root.innerHTML = `<div class="screen screen-${name}"><div class="screen-panel">${html}</div></div>`;
  };
  const start = () => {
    if (!deckId) return;
    if (!hasSeenTutorial()) { showTutorial(0); return; }
    launch();
  };
  const launch = () => {
    markTutorialSeen();
    root.innerHTML = '';
    screen = 'playing';
    mainAction = null;
    startedAt = performance.now();
    latestScore = 0;
    samples = [{ elapsed: 0, score: 0 }];
    bus.emit('ui:start', { deckId, input });
  };
  const showTutorial = (index = 0) => {
    tutorialIndex = Math.max(0, Math.min(tutorialSteps.length - 1, index));
    const step = tutorialSteps[tutorialIndex];
    const next = () => tutorialIndex === tutorialSteps.length - 1 ? launch() : showTutorial(tutorialIndex + 1);
    setScreen('tutorial', `<div class="eyebrow">PLAYER TRAINING // ${tutorialIndex + 1} OF ${tutorialSteps.length}</div><h1>HOW TO PLAY</h1><div class="tutorial-icon" aria-hidden="true">${step.icon}</div><h2>${step.title}</h2><p class="lead tutorial-message">${step.message}</p><div class="tutorial-dots" aria-label="Step ${tutorialIndex + 1} of ${tutorialSteps.length}">${tutorialSteps.map((_, i) => `<span class="${i === tutorialIndex ? 'active' : ''}"></span>`).join('')}</div><div class="tutorial-actions"><button class="secondary-button" data-action="tutorial-back" ${tutorialIndex === 0 ? 'disabled' : ''}>← BACK</button><button class="primary-button" data-action="tutorial-next">${tutorialIndex === tutorialSteps.length - 1 ? '▶ LET\'S PLAY' : 'NEXT →'}</button><button class="secondary-button" data-action="tutorial-skip">SKIP TUTORIAL</button></div>`, next);
  };
  const showStart = () => {
    deckId = decks.some(d => d.id === deckId) ? deckId : (decks[0]?.id || '');
    setScreen('start', `<div class="eyebrow">◈ THE REVISION ARCADE ◈</div><h1 class="game-title glitch-title" data-text="SLICE THE ROT">SLICE THE ROT</h1><p class="tagline">SLICE THE ROT. KEEP THE KNOWLEDGE.</p><p class="lead">Cut the right terms. Dodge the distractions. Don't feed the brainrot.</p><h2>01 // SELECT YOUR DECK</h2><div class="deck-grid">${decks.map(d => `<button class="deck-choice ${d.id === deckId ? 'selected' : ''}" data-deck="${escapeHtml(d.id)}" aria-pressed="${d.id === deckId}"><strong>${escapeHtml(d.title)}</strong><small>${escapeHtml(d.description)}</small></button>`).join('')}</div><h2>02 // CAMERA PLAY</h2><p class="lead">📷 Your arms are the blades. Allow camera access when prompted.</p><div class="start-actions"><button class="primary-button coin-button" data-action="start" ${deckId ? '' : 'disabled'}>▶ INSERT COIN <span>START GAME</span></button><button class="secondary-button" data-action="tutorial">? HOW TO PLAY</button></div><p class="fine-print">Stand back so your arms are in frame. Camera permission required.</p><div class="job-entry"><button class="secondary-button job-entry-button" data-action="job-open">✦ PASTE A JOB SPEC</button></div>`, start);
  };
  // Job-spec generation is owned by the engine; this panel only sends and receives bus events.
  const showJobSpec = () => {
    setScreen('job-spec', `<div class="eyebrow">CUSTOM REVISION // JOB SPEC</div><h1>PASTE A JOB SPEC</h1><p class="lead">Turn a job description into a playable revision deck.</p><form id="job-spec-form" class="job-spec-form"><label for="job-description">JOB DESCRIPTION</label><textarea id="job-description" rows="9" maxlength="25000" required placeholder="Paste the internship or job description here..."></textarea><label for="job-api-key">API KEY</label><input id="job-api-key" type="password" required autocomplete="off" spellcheck="false" placeholder="Enter your API key"/><p class="fine-print">Kept in memory only, never saved. The key is sent to the generator when you press GENERATE.</p><div class="job-spec-actions"><button type="submit" class="primary-button">⚡ GENERATE</button><button type="button" class="secondary-button" data-action="job-back">← BACK</button></div><p id="job-spec-message" role="alert" aria-live="polite"></p></form>`, null);
    root.querySelector('#job-spec-form').addEventListener('submit', event => {
      event.preventDefault();
      const jobTextField = root.querySelector('#job-description');
      const keyField = root.querySelector('#job-api-key');
      const jobText = jobTextField.value.trim();
      const apiKey = keyField.value.trim();
      if (!jobText || !apiKey) {
        root.querySelector('#job-spec-message').textContent = 'Enter a job description and API key.';
        return;
      }
      // EventTarget delivery is synchronous; do not retain the key in component state.
      bus.emit('ui:generateDeck', { jobText, apiKey });
      keyField.value = '';
    });
  };
  const showGenerating = () => {
    setScreen('generating', `<div class="eyebrow">AI DECK FORGE</div><h1>GENERATING DECK...</h1><div class="job-loading" role="status" aria-live="polite">⚙️ ANALYSING YOUR JOB SPEC</div><p class="lead">This usually takes 10–40 seconds. Keep this page open.</p>`, null);
  };
  const showDeckReady = ({ deckId: generatedId, title, rounds } = {}) => {
    if (!generatedId) {
      showDeckError({ message: 'No deck ID was returned.' });
      return;
    }
    deckId = generatedId;
    setScreen('deck-ready', `<div class="eyebrow">DECK FORGED // READY TO PLAY</div><h1 id="generated-title"></h1><h2>ROUND RULES</h2><ol id="generated-rounds" class="job-rounds"></ol><div class="job-spec-actions"><button class="primary-button" data-action="job-play">▶ PLAY</button><button class="secondary-button" data-action="job-back">← MAIN MENU</button></div>`, launch);
    root.querySelector('#generated-title').textContent = String(title ?? 'Custom Job Deck');
    const list = root.querySelector('#generated-rounds');
    for (const round of Array.isArray(rounds) ? rounds : []) {
      const li = document.createElement('li');
      li.textContent = typeof round === 'string' ? round : String(round?.rule ?? 'Untitled round');
      list.append(li);
    }
    if (!list.children.length) {
      const li = document.createElement('li');
      li.textContent = 'Your custom deck is ready.';
      list.append(li);
    }
  };
  const showDeckError = ({ message } = {}) => {
    setScreen('deck-error', `<div class="eyebrow">DECK GENERATION ERROR</div><h1>GENERATION FAILED</h1><p id="generated-error" class="job-error" role="alert"></p><div class="job-spec-actions"><button class="primary-button" data-action="job-open">↻ TRY AGAIN</button><button class="secondary-button" data-action="job-back">← MAIN MENU</button></div>`, showJobSpec);
    root.querySelector('#generated-error').textContent = String(message ?? 'An unknown error occurred.');
  };
  const showRound = ({ index = 0, missed = [], wrongSliced = [] }) => {
    const cont = () => { root.innerHTML = ''; screen = 'playing'; mainAction = null; bus.emit('ui:continue', {}); };
    setScreen('summary', `<div class="eyebrow">ROUND ${index + 1} COMPLETE</div><h1>KNOWLEDGE CHECK</h1><p class="lead">Review what slipped through before your next round.</p><div class="review-columns"><section><h2 class="text-green">MISSED TARGETS · ${missed.length}</h2>${listMarkup(missed, 'Perfect catch — nothing missed!')}</section><section><h2 class="text-pink">WRONG SLICES · ${wrongSliced.length}</h2>${listMarkup(wrongSliced, 'Clean run — no incorrect slices!')}</section></div><button class="primary-button" data-action="continue">▶ NEXT ROUND</button>`, cont);
  };
  const showGameOver = ({ score = 0, rounds = 0, weakTerms = [] }) => {
    const table = (scores) => scores.length ? `<ol class="leaderboard">${scores.map(e => `<li><span>${escapeHtml(e.initials)}</span><strong>${Number(e.score) || 0}</strong></li>`).join('')}</ol>` : '<p class="muted">No scores yet. Make history!</p>';
    const finalScore = Number(score) || 0;
    if (!samples.length) samples = [{ elapsed: 0, score: 0 }];
    const elapsed = Math.max(samples.at(-1).elapsed + 0.001, startedAt ? (performance.now() - startedAt) / 1000 : 1);
    if (samples.at(-1).score !== finalScore) samples.push({ elapsed, score: finalScore });
    setScreen('over', `<div class="eyebrow">SESSION TERMINATED // ${Number(rounds) || 0} ROUNDS</div><h1>GAME OVER</h1><div class="final-score"><small>FINAL SCORE</small><strong>${finalScore}</strong></div><section class="graph-section"><h2>YOUR SCORE JOURNEY</h2>${graphMarkup(samples)}</section><div class="result-columns"><section class="score-entry"><h2>ENTER INITIALS</h2><div class="initials-form"><input id="initials" aria-label="3-letter high-score initials" maxlength="3" pattern="[A-Za-z]{1,3}" placeholder="AAA" autocomplete="off" /><button data-action="save">SAVE</button></div><div id="score-message" aria-live="polite"></div><h2>TOP 10</h2><div id="leaderboard">${table(getHighScores())}</div></section><section><h2>YOUR WEAK TERMS</h2>${listMarkup(weakTerms, 'Nothing to revise. Keep the streak alive!')}</section></div><button class="primary-button" data-action="again">↻ PLAY AGAIN</button>`, showStart);
    root.querySelector('#initials')?.addEventListener('input', e => { e.target.value = e.target.value.replace(/[^a-z]/gi, '').toUpperCase(); });
    root.querySelector('[data-action="save"]')?.addEventListener('click', () => {
      const field = root.querySelector('#initials');
      const initials = field.value.trim().toUpperCase();
      if (!/^[A-Z]{1,3}$/.test(initials)) { root.querySelector('#score-message').textContent = 'Enter 1–3 letters.'; field.focus(); return; }
      root.querySelector('#leaderboard').innerHTML = table(addHighScore({ initials, score: finalScore }));
      root.querySelector('#score-message').textContent = 'SCORE SAVED ✓';
      field.disabled = true;
      root.querySelector('[data-action="save"]').disabled = true;
    });
  };

  root.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.deck) { deckId = btn.dataset.deck; showStart(); }
    const action = btn.dataset.action;
    if (action === 'start') start();
    if (action === 'tutorial') showTutorial();
    if (action === 'tutorial-next') mainAction?.();
    if (action === 'tutorial-back') showTutorial(tutorialIndex - 1);
    if (action === 'tutorial-skip') launch();
    if (action === 'continue') mainAction?.();
    if (action === 'again') showStart();
    if (action === 'job-open') showJobSpec();
    if (action === 'job-back') showStart();
    if (action === 'job-play') mainAction?.();
  });
  document.addEventListener('keydown', e => {
    if (!['Enter', ' '].includes(e.key) || screen === 'playing' || e.repeat || e.target.matches('button, input, textarea, select')) return;
    e.preventDefault();
    mainAction?.();
  });
  bus.on('game:start', () => {
    if (!startedAt) { startedAt = performance.now(); samples = [{ elapsed: 0, score: 0 }]; }
    root.innerHTML = ''; screen = 'playing'; mainAction = null;
  });
  bus.on('score:update', ({ score }) => {
    if (!Number.isFinite(score)) return;
    if (!samples.length) { startedAt = performance.now(); samples = [{ elapsed: 0, score: 0 }]; }
    if (score === latestScore && samples.at(-1).score === score) return;
    latestScore = score;
    samples.push({ elapsed: Math.max(0, (performance.now() - startedAt) / 1000), score });
    if (samples.length > 1500) samples.splice(1, 1);
  });
  bus.on('deck:generating', showGenerating);
  bus.on('deck:ready', showDeckReady);
  bus.on('deck:error', showDeckError);
  bus.on('round:end', showRound);
  bus.on('game:over', showGameOver);
  try { decks = await loadDeckIndex(); showStart(); }
  catch (error) { setScreen('error', `<h1>DECK ERROR</h1><p>${escapeHtml(error.message)}</p><button data-action="retry">RETRY</button>`, () => location.reload()); root.querySelector('[data-action="retry"]')?.addEventListener('click', () => location.reload()); }
}
