// Apply fixes for GitHub issues #2 and #3 without replacing newer frontend files.
// Run from the repository root: node scripts/apply-issues-2-3.mjs
import fs from 'node:fs';
const paths = ['src/ui/screens.js', 'src/ui/hud.js'];
for (const file of paths) if (!fs.existsSync(file)) throw new Error(`Missing ${file}; run this in the project root`);
let screens = fs.readFileSync(paths[0], 'utf8');
let hud = fs.readFileSync(paths[1], 'utf8');
const beforeScreens = screens, beforeHud = hud;
function replaceOne(code, from, to, label) {
  const count = code.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 match, found ${count}. No files changed. Share current file for a tailored fix.`);
  return code.replace(from, to);
}
if (!screens.includes("bus.on('deck:keyStatus'")) {
  screens = replaceOne(screens, "  let latestScore = 0;", "  let latestScore = 0;\n  let keyPreloaded = false;", 'screen key status state');
  const keyInputPattern = /<input id="job-api-key" type="password" required autocomplete="off" spellcheck="false" placeholder="(?:Enter your API key|sk-ant-\.\.\.)"\/>/g;
  const keyMatches = [...screens.matchAll(keyInputPattern)];
  if (keyMatches.length !== 1) throw new Error(`Key field: expected 1 match, found ${keyMatches.length}. No files changed.`);
  screens = screens.replace(keyInputPattern, `<input id="job-api-key" type="password" \${keyPreloaded ? '' : 'required'} autocomplete="off" spellcheck="false" placeholder="\${keyPreloaded ? 'Optional: key already loaded' : 'Enter your API key'}"/>`);
  screens = replaceOne(screens,
    "      if (!jobText || !apiKey) {\n        root.querySelector('#job-spec-message').textContent = 'Enter a job description and API key.';",
    "      if (!jobText || (!apiKey && !keyPreloaded)) {\n        root.querySelector('#job-spec-message').textContent = keyPreloaded ? 'Enter a job description.' : 'Enter a job description and API key.';", 'form validation');
  screens = replaceOne(screens, "  bus.on('deck:generating', showGenerating);",
    "  bus.on('deck:keyStatus', ({ hasKey } = {}) => {\n    keyPreloaded = hasKey === true;\n    const keyField = root.querySelector('#job-api-key');\n    if (keyField) {\n      keyField.required = !keyPreloaded;\n      keyField.placeholder = keyPreloaded ? 'Optional: key already loaded' : 'Enter your API key';\n    }\n  });\n  bus.on('deck:generating', showGenerating);", 'key status listener');
} else console.log('Issue #2 seems already applied; skipping screens.js');
if (!hud.includes('calibrationTimeout') && !hud.includes('calibrationTimer') && !hud.includes('function hideCalibration()')) {
  hud = replaceOne(hud, '  let calibrated = false;',
    "  let calibrated = false;\n  let calibrationTimeout;\n  const isMouseMode = new URLSearchParams(window.location.search).get('input') === 'mouse';\n  function hideCalibration() {\n    calibration.hidden = true;\n    calibrationEnabled = false;\n  }", 'calibration declarations');
  hud = replaceOne(hud,
    "      setTimeout(() => { calibration.hidden = true; calibrationEnabled = false; }, 1700);",
    "      clearTimeout(calibrationTimeout);\n      calibrationTimeout = setTimeout(hideCalibration, 450);", 'ready hide');
  hud = replaceOne(hud,
    "    wrists.clear(); calibrated = false; calibrationEnabled = true;\n    calibration.hidden = false; calibration.classList.remove('is-ready');\n    updateCalibration();",
    "    clearTimeout(calibrationTimeout);\n    wrists.clear(); calibrated = false; calibrationEnabled = !isMouseMode;\n    calibration.hidden = isMouseMode; calibration.classList.remove('is-ready');\n    if (!isMouseMode) {\n      updateCalibration();\n      calibrationTimeout = setTimeout(hideCalibration, 4000);\n    }", 'game:start calibration');
  hud = replaceOne(hud,
    "  bus.on('game:over', () => { announcement.classList.remove('visible'); calibration.hidden = true; calibrationEnabled = false; });",
    "  bus.on('game:over', () => { announcement.classList.remove('visible'); clearTimeout(calibrationTimeout); hideCalibration(); });", 'game over cleanup');
} else console.log('Issue #3 calibration timeout and mouse-mode logic appear already present; skipping hud.js');
if (screens !== beforeScreens) fs.writeFileSync(paths[0], screens);
if (hud !== beforeHud) fs.writeFileSync(paths[1], hud);
console.log('Fixes applied. Run npm run build, then review git diff before committing.');
