import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const screensPath = resolve('src/ui/screens.js');
const cssPath = resolve('src/styles/retro.css');
let screens = readFileSync(screensPath, 'utf8');
const css = readFileSync(cssPath, 'utf8');
const marker = 'learning-score-issue-5';
const cssMarker = 'hands-free-menus-issue-6';
if (screens.includes(marker) && css.includes(cssMarker)) { console.log('Already installed.'); process.exit(0); }
if (screens.includes(marker) || css.includes(cssMarker)) throw Error('Partial patch found. No changes made.');
function change(needle, replacement) {
  const first = screens.indexOf(needle);
  if (first < 0 || screens.indexOf(needle, first + needle.length) >= 0) throw Error(`Patch anchor missing or repeated: ${needle.slice(0, 65)}. No files changed.`);
  screens = screens.replace(needle, replacement);
}
change('const showGameOver = ({ score = 0, rounds = 0, weakTerms = [] }) => {', 'const showGameOver = ({ score = 0, rounds = 0, weakTerms = [], learning = null }) => {');
change('    const finalScore = Number(score) || 0;', `    const finalScore = Number(score) || 0;
    // learning-score-issue-5: display the engine-provided learning result.
    const count = value => Math.max(0, Math.trunc(Number(value) || 0));
    const hasLearning = learning && typeof learning === 'object';
    const accuracy = hasLearning && learning.accuracy != null && Number.isFinite(Number(learning.accuracy))
      ? Math.max(0, Math.min(100, Math.round(Number(learning.accuracy)))) : null;
    const learningMarkup = hasLearning ? \
      \`<section class="learning-section" aria-label="Learning results">
        <h2>LEARNING</h2>
        \${accuracy === null ? '' : \`<strong class="learning-accuracy">\${accuracy}% RIGHT CALLS</strong>\`}
        <p>Sliced \${count(learning.correctSliced)}/\${count(learning.correctTotal)} targets · Dodged \${count(learning.wrongAvoided)}/\${count(learning.wrongTotal)} traps</p>
        <div id="learning-mastered"></div>
      </section>\` : '';`);
change('<div class="final-score"><small>FINAL SCORE</small><strong>${finalScore}</strong></div><section class="graph-section">', '<div class="final-score"><small>FINAL SCORE</small><strong>${finalScore}</strong></div>${learningMarkup}<section class="graph-section">');
change("    root.querySelector('#initials')?.addEventListener('input', e => {", `    // Text-only DOM avoids HTML injection from term and definition values.
    if (hasLearning && Array.isArray(learning.improved) && learning.improved.length) {
      const mastered = root.querySelector('#learning-mastered');
      if (mastered) {
        const heading = document.createElement('h3');
        heading.textContent = 'MASTERED THIS GAME';
        const list = document.createElement('ul');
        list.className = 'learning-mastered-list';
        for (const item of learning.improved) {
          const li = document.createElement('li');
          const strong = document.createElement('strong');
          strong.textContent = String(item?.term ?? '');
          li.append(strong);
          if (item?.definition) {
            const detail = document.createElement('span');
            detail.textContent = String(item.definition);
            li.append(detail);
          }
          list.append(li);
        }
        mastered.append(heading, list);
      }
    }
    root.querySelector('#initials')?.addEventListener('input', e => {`);
const newCss = css + `
/* hands-free-menus-issue-6: right-middle of summary/results reserved for swipe targets. */
@media (min-width: 1000px) {
  .screen-summary, .screen-over { justify-items: start; padding-left: 3vw; }
  .screen-summary > .screen-panel, .screen-over > .screen-panel { width: min(900px, 65vw); }
}
/* learning-score-issue-5 */
.learning-section { margin: 10px auto; padding: 10px 16px; text-align: center; background: #0b1427; border: 1px solid #30485f; border-radius: 6px; }
.learning-section h2 { margin: 4px 0 8px; }
.learning-section p { margin: 7px 0; line-height: 1.45; font-size: 13px; color: #d2eff2; }
.learning-accuracy { color: var(--green); font: bold clamp(12px, 1.3vw, 16px)/1.5 'Press Start 2P', monospace; }
.learning-section h3 { margin: 10px 0 5px; font-size: 12px; color: var(--cyan); }
.learning-mastered-list { list-style: none; margin: 6px 0 0; padding: 0; display: flex; flex-wrap: wrap; justify-content: center; gap: 7px; }
.learning-mastered-list li { display: flex; flex-direction: column; max-width: 220px; padding: 6px 9px; border: 1px solid #2e625b; border-radius: 4px; background: #0c2927; }
.learning-mastered-list strong { color: var(--green); }
.learning-mastered-list span { font-size: 11px; color: var(--dim); }
`;
writeFileSync(screensPath, screens);
writeFileSync(cssPath, newCss);
console.log('Applied #5 learning results and #6 hands-free menu spacing.');
