import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

const path = resolve('src/ui/screens.js');
const source = readFileSync(path, 'utf8');
const old = '<div class="job-entry"><button class="secondary-button job-entry-button" data-action="job-open">✦ PASTE A JOB SPEC</button></div>';
const replacement = '${import.meta.env.VITE_ENABLE_JOB_SPEC === \'true\' ? \'<div class="job-entry"><button class="secondary-button job-entry-button" data-action="job-open">✦ PASTE A JOB SPEC</button></div>\' : \'\'}';
if (source.includes(replacement)) {
  console.log('Job-spec toggle is already installed. No changes made.');
} else if (source.includes(old)) {
  copyFileSync(path, `${path}.before-job-toggle`);
  writeFileSync(path, source.replace(old, replacement), 'utf8');
  console.log('Updated screens.js. Backup: src/ui/screens.js.before-job-toggle');
} else {
  console.error('Expected button markup not found. No changes made.');
  process.exitCode = 1;
}
