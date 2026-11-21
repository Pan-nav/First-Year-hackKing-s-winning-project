// Bundle GitHub issues #2, #3, #5, #6 safely while preserving users' local changes.
// Run from repo root: node scripts/apply-all-codex.mjs
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const files = ['src/ui/screens.js', 'src/ui/hud.js', 'src/styles/retro.css'];
for (const file of files) if (!existsSync(file)) throw new Error(`Missing ${file}. Run from project root.`);
const original = new Map(files.map(file => [file, readFileSync(file, 'utf8')]));
try {
  await import('./apply-issues-2-3.mjs');
  await import('./apply-issues-5-6.mjs');
  const screens = readFileSync(files[0], 'utf8');
  const hud = readFileSync(files[1], 'utf8');
  const css = readFileSync(files[2], 'utf8');
  if (!screens.includes("bus.on('deck:keyStatus'") || !screens.includes('learning-score-issue-5') || !css.includes('hands-free-menus-issue-6') || !hud.includes('function hideCalibration()')) {
    throw new Error('One or more expected changes are missing.');
  }
  console.log('Done: issues #2, #3, #5 and #6. No engine files modified.');
  console.log('Next: npm run build; npm run dev; verify Git changes before committing.');
} catch (error) {
  for (const [file, content] of original) writeFileSync(file, content, 'utf8');
  console.error('Stopped and restored the original files:', error.message);
  process.exitCode = 1;
}
