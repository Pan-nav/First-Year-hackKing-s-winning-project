import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const cssPath = path.join(root, 'src', 'styles', 'retro.css');
const marker = '/* Pub sign drop and rope-lift intro */';

if (!fs.existsSync(cssPath)) {
  console.error('Run this from the repository root (folder containing src/styles/retro.css).');
  process.exit(1);
}

let css = fs.readFileSync(cssPath, 'utf8');
const start = css.indexOf(marker);
if (start === -1) {
  console.error('Pub banner intro block not found. Install the pub banner intro first, then run this tuner.');
  process.exit(1);
}

const tunedBlock = `${marker}
/* Tuned pub sign intro: deeper drop, stronger swing, chunkier retro deck reveal. */
.screen-start .screen-panel {overflow-x:clip}
.pub-sign-rig {position:relative;width:min(660px,100%);margin:22px auto 18px;padding-top:22px;isolation:isolate}
.pub-sign {position:relative;z-index:2;border:5px ridge #a77b40;border-radius:10px;padding:24px 14px 20px;background:linear-gradient(145deg,#302115,#4c2b1b 52%,#291710);box-shadow:inset 0 0 0 4px #21140c,0 17px 22px #0008,0 0 25px #ffc96b24;transform-origin:top center}
.pub-sign::before,.pub-sign::after {content:'✦';position:absolute;top:10px;color:#dba45d;font-size:21px;pointer-events:none}
.pub-sign::before {left:13px}.pub-sign::after {right:13px}
.pub-sign .eyebrow {margin-bottom:10px;color:#f4b862}
.pub-sign .game-title {font-size:clamp(21px,4.6vw,52px)!important;margin:12px auto;line-height:1.5!important}
.pub-sign .tagline {margin:10px auto 3px;font-size:clamp(11px,1.4vw,16px)}
.pub-sign-rope {position:absolute;z-index:1;top:-48px;width:5px;height:82px;border-radius:4px;background:repeating-linear-gradient(165deg,#f5d9a4 0 5px,#956f42 5px 9px);box-shadow:1px 0 3px #111;transform-origin:top center}
.pub-sign-rope-left {left:13%}.pub-sign-rope-right {right:13%}
.pub-sign-controls {opacity:1}
.screen-start.pub-intro-play .pub-sign {animation:pub-sign-drop 2.05s cubic-bezier(.2,.82,.24,1) both}
.screen-start.pub-intro-play .pub-sign-rope {animation:pub-rope-lift 2.05s cubic-bezier(.2,.82,.24,1) both}
.screen-start.pub-intro-play .pub-sign-controls > * {opacity:0}
.screen-start.pub-intro-play .pub-sign-controls > .lead {animation:arcade-block-in 260ms steps(3,end) 1.18s both}
.screen-start.pub-intro-play .pub-sign-controls > h2:nth-of-type(1) {animation:arcade-block-in 220ms steps(3,end) 1.28s both}
.screen-start.pub-intro-play .pub-sign-controls > .deck-grid {animation:arcade-block-in 300ms steps(4,end) 1.38s both}
.screen-start.pub-intro-play .pub-sign-controls > h2:nth-of-type(2) {animation:arcade-block-in 220ms steps(3,end) 1.56s both}
.screen-start.pub-intro-play .pub-sign-controls > .start-actions {animation:arcade-block-in 280ms steps(4,end) 1.68s both}
.screen-start.pub-intro-play .pub-sign-controls > .fine-print {animation:arcade-block-in 220ms steps(3,end) 1.82s both}
.screen-start.pub-intro-play .pub-sign-controls > .job-entry {animation:arcade-block-in 220ms steps(3,end) 1.9s both}
.screen-start.pub-intro-play .deck-choice,
.screen-start.pub-intro-play .start-actions .primary-button,
.screen-start.pub-intro-play .start-actions .secondary-button,
.screen-start.pub-intro-play .job-entry-button {animation:arcade-button-flicker 360ms steps(4,end) backwards}
.screen-start.pub-intro-play .deck-grid .deck-choice:nth-child(1) {animation-delay:1.42s}
.screen-start.pub-intro-play .deck-grid .deck-choice:nth-child(2) {animation-delay:1.49s}
.screen-start.pub-intro-play .deck-grid .deck-choice:nth-child(3) {animation-delay:1.56s}
.screen-start.pub-intro-play .deck-grid .deck-choice:nth-child(4) {animation-delay:1.63s}
.screen-start.pub-intro-play .deck-grid .deck-choice:nth-child(5) {animation-delay:1.70s}
.screen-start.pub-intro-play .deck-grid .deck-choice:nth-child(6) {animation-delay:1.77s}
.screen-start.pub-intro-play .start-actions .primary-button {animation-delay:1.74s}
.screen-start.pub-intro-play .start-actions .secondary-button {animation-delay:1.82s}
.screen-start.pub-intro-play .job-entry-button {animation-delay:1.96s}
@keyframes pub-sign-drop {
  0% {transform:translateY(-145vh) rotate(-50deg)}
  22% {transform:translateY(-58vh) rotate(-26deg)}
  46% {transform:translateY(172px) rotate(16deg)}
  64% {transform:translateY(84px) rotate(-8deg)}
  80% {transform:translateY(24px) rotate(3deg)}
  100% {transform:translateY(0) rotate(0)}
}
@keyframes pub-rope-lift {
  0% {height:28px}
  22% {height:72px}
  46% {height:255px}
  64% {height:172px}
  80% {height:104px}
  100% {height:82px}
}
@keyframes arcade-block-in {
  0% {opacity:0;transform:translateY(24px)}
  34% {opacity:0;transform:translateY(24px)}
  35% {opacity:1;transform:translateY(24px)}
  60% {opacity:1;transform:translateY(16px)}
  82% {opacity:1;transform:translateY(8px)}
  100% {opacity:1;transform:translateY(0)}
}
@keyframes arcade-button-flicker {
  0% {opacity:0;filter:brightness(1.65);transform:translateY(16px) scale(.96)}
  24% {opacity:0;filter:brightness(1.65);transform:translateY(16px) scale(.96)}
  25% {opacity:1;filter:brightness(1.65);transform:translateY(16px) scale(.96)}
  49% {opacity:.2;filter:brightness(.85);transform:translateY(10px) scale(.985)}
  50% {opacity:1;filter:brightness(1.3);transform:translateY(10px) scale(.985)}
  74% {opacity:.55;filter:brightness(.95);transform:translateY(4px) scale(.995)}
  75% {opacity:1;filter:brightness(1.1);transform:translateY(4px) scale(.995)}
  100% {opacity:1;filter:brightness(1);transform:translateY(0) scale(1)}
}
@media(max-width:650px){.pub-sign-rig{margin:10px auto 14px}.pub-sign {padding:18px 8px}.pub-sign::before,.pub-sign::after{display:none}}
@media(prefers-reduced-motion:reduce){.screen-start.pub-intro-play .pub-sign,.screen-start.pub-intro-play .pub-sign-rope,.screen-start.pub-intro-play .pub-sign-controls > *, .screen-start.pub-intro-play .deck-choice,.screen-start.pub-intro-play .start-actions .primary-button,.screen-start.pub-intro-play .start-actions .secondary-button,.screen-start.pub-intro-play .job-entry-button{animation:none!important;transform:none!important;opacity:1!important;filter:none!important}}
`;

css = css.slice(0, start).trimEnd() + '\n\n' + tunedBlock;
fs.writeFileSync(cssPath, css);
console.log('Updated pub banner motion and retro blocky button reveal in src/styles/retro.css');
console.log('Run: npm run build && npm run dev');
