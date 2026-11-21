// Apply a local-only Gemini-key job form without replacing the user's other UI changes.
// Run from project root: node scripts/remove-job-api-key.mjs
import { readFileSync, writeFileSync } from 'node:fs';
const path = 'src/ui/screens.js';
let source = readFileSync(path, 'utf8');
const original = source;
function replaceRequired(regex, replacement, label) {
  if (!regex.test(source)) throw new Error(`Could not safely locate ${label}; no files changed.`);
  source = source.replace(regex, replacement);
}
// Ensure the setting is known even when the backend emitted deck:keyStatus before opening this screen.
if (!source.includes('let keyPreloaded = false;')) {
  replaceRequired(/(  let latestScore = 0;\r?\n)/, '$1  let keyPreloaded = false;\n', 'screen state');
}
// Replace only the API key input and its explanatory text; keep the job description and buttons.
if (source.includes('id="job-api-key"')) {
  replaceRequired(/<label for="job-api-key">[^<]*<\/label><input id="job-api-key"[^>]*\/><p class="fine-print">[^<]*<\/p>/,
    '<p class="fine-print" id="job-key-status" role="status">${keyPreloaded ? \'Gemini key configured for this dev session.\' : \'Gemini key not configured. Add VITE_GEMINI_API_KEY to .env.local and restart the dev server.\'}</p>',
    'API key field');
} else if (!source.includes('id="job-key-status"')) {
  throw new Error('Neither the API key field nor its replacement status message was found.');
}
// Remove any old key-value reads, and make the form rely on the existing server-side/dev configuration.
source = source.replace(/^[ \t]*const keyField = root\.querySelector\('#job-api-key'\);\r?\n/gm, '');
source = source.replace(/^[ \t]*const apiKey = keyField\.value\.trim\(\);\r?\n/gm, '');
source = source.replace(/^[ \t]*keyField\.value = '';\r?\n/gm, '');
// Replace the job-form-specific validation block only.
const check = /      if \(!jobText \|\| \(!apiKey && !keyPreloaded\)\) \{[\s\S]*?      \}/;
const checkOld = /      if \(!jobText \|\| !apiKey\) \{[\s\S]*?      \}/;
const newCheck = `      if (!jobText) {
        root.querySelector('#job-spec-message').textContent = 'Enter a job description.';
        return;
      }
      if (!keyPreloaded) {
        root.querySelector('#job-spec-message').textContent = 'No Gemini key loaded. Set VITE_GEMINI_API_KEY in .env.local and restart npm run dev.';
        return;
      }`;
if (check.test(source)) source = source.replace(check, newCheck);
else if (checkOld.test(source)) source = source.replace(checkOld, newCheck);
else if (!source.includes('No Gemini key loaded. Set VITE_GEMINI_API_KEY')) throw new Error('Unknown job-form validation; no files changed.');
source = source.replace("bus.emit('ui:generateDeck', { jobText, apiKey });", "bus.emit('ui:generateDeck', { jobText });");
// Replace the previous keyField updater if present; otherwise register a key-status subscription.
const keyStatusHandler = `  bus.on('deck:keyStatus', ({ hasKey } = {}) => {
    keyPreloaded = hasKey === true;
    const status = root.querySelector('#job-key-status');
    if (status) status.textContent = keyPreloaded
      ? 'Gemini key configured for this dev session.'
      : 'Gemini key not configured. Add VITE_GEMINI_API_KEY to .env.local and restart the dev server.';
  });
`;
const existingHandler = /  bus\.on\('deck:keyStatus', \(\{ hasKey \} = \{\}\) => \{[\s\S]*?\n  \}\);\r?\n(?=  bus\.on\('deck:generating')/;
if (existingHandler.test(source)) source = source.replace(existingHandler, keyStatusHandler);
else if (!source.includes("bus.on('deck:keyStatus'")) replaceRequired(/(?=  bus\.on\('deck:generating')/, keyStatusHandler, 'event subscriptions');
// Validate: no form key input, no leftover access, generation still works through the established event.
if (source.includes('id="job-api-key"') || source.includes("root.querySelector('#job-api-key')") || source.includes("bus.emit('ui:generateDeck', { jobText, apiKey }") || !source.includes("bus.emit('ui:generateDeck', { jobText });") || !source.includes("bus.on('deck:keyStatus'")) {
  throw new Error('Post-patch checks failed; no files changed.');
}
if (source === original) console.log('Job Spec API-key input is already removed. No change needed.');
else { writeFileSync(`${path}.before-no-key-backup`, original, 'utf8'); writeFileSync(path, source, 'utf8'); console.log('Updated src/ui/screens.js; backup saved as src/ui/screens.js.before-no-key-backup.'); }
