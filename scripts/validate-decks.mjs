// Run with: npm run check:decks
// Checks every deck listed in public/decks/index.json against the schema in docs/CONTRACT.md.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../public/decks/', import.meta.url));
const errors = [];
const err = (file, msg) => errors.push(`${file}: ${msg}`);
const readJson = (file) => JSON.parse(readFileSync(join(dir, file), 'utf8'));

const index = readJson('index.json');
const brainrot = readJson('brainrot.json').words ?? [];
if (brainrot.length < 15) err('brainrot.json', 'needs at least 15 words');
for (const w of brainrot) if (w.length > 16) err('brainrot.json', `"${w}" is longer than 16 characters`);

for (const entry of index) {
  const file = `${entry.id}.json`;
  let deck;
  try {
    deck = readJson(file);
  } catch (e) {
    err(file, `cannot read or parse: ${e.message}`);
    continue;
  }
  if (deck.id !== entry.id) err(file, 'id does not match index.json');
  if (!deck.title) err(file, 'missing title');
  if (!Array.isArray(deck.rounds) || deck.rounds.length < 3) err(file, 'needs at least 3 rounds');
  const defs = deck.definitions ?? {};

  for (const [i, round] of (deck.rounds ?? []).entries()) {
    const where = `round ${i + 1}`;
    const correct = round.correct ?? [];
    const wrong = round.wrong ?? [];
    const all = [...correct, ...wrong];
    if (!round.rule) err(file, `${where}: missing rule`);
    if (correct.length < 6) err(file, `${where}: needs at least 6 correct terms`);
    if (wrong.length < 5) err(file, `${where}: needs at least 5 wrong terms`);
    if (new Set(all).size !== all.length) err(file, `${where}: duplicate terms`);
    for (const term of all) {
      if (term.length > 16) err(file, `${where}: "${term}" is longer than 16 characters`);
      if (!defs[term]) err(file, `${where}: "${term}" has no definition`);
      else if (defs[term].length > 80) err(file, `${where}: definition of "${term}" is over 80 characters`);
      if (brainrot.includes(term)) err(file, `${where}: "${term}" clashes with a brainrot word`);
    }
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`OK: ${index.length} deck(s) valid`);
