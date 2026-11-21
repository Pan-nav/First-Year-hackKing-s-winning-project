// OWNER: the deck rules from docs/CONTRACT.md (the same ones `npm run check:decks` enforces),
// applied in the browser to decks generated from a job description. Instead of rejecting a whole
// deck for one bad term, it repairs what it can and drops what it cannot.
export const RULES = {
  minRounds: 3,
  minCorrect: 6,
  minWrong: 5,
  maxTermLength: 16,
  maxDefinitionLength: 80,
};

// Terms and definitions end up in the DOM (round summary, game over), so keep them plain text.
const clean = (s) =>
  String(s ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/[<>`]/g, '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Shorten at a word boundary so the definition fits, ending with an ellipsis. */
function fitDefinition(input) {
  // "...; not a version control concept" tails belong to one round but definitions are shared by
  // every round that uses the term, so drop them (the game already shows NOT IT on a wrong slice).
  const text = input.replace(/[;,]\s*not (?:a|an|the)\b[^;,]*$/i, '').replace(/[\s,;:.]+$/, '');
  if (text.length <= RULES.maxDefinitionLength) return text;
  // Too long: drop trailing clauses first, then cut at a word boundary.
  const firstClause = text.split(/[;,(]| - /)[0].trim();
  if (firstClause.length >= 20 && firstClause.length <= RULES.maxDefinitionLength) return firstClause;
  const cut = text.slice(0, RULES.maxDefinitionLength - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > 40 ? cut.slice(0, space) : cut).replace(/[\s,;:.-]+$/, '')}…`;
}

/**
 * Turn raw generated rounds into a valid deck, or throw an Error with a message a player can read.
 * @param {{ title: string, rounds: { category: string, correct: {term, definition}[], wrong: {term, definition}[] }[] }} raw
 * @param {string[]} brainrot words that must never appear as terms
 * @returns {{ deck: object, dropped: string[] }} the deck in the contract shape, plus what was dropped and why
 */
export function buildDeck(raw, brainrot = [], id = `custom-${Date.now()}`) {
  const dropped = [];
  const definitions = {};
  const banned = new Set(brainrot.map((w) => w.toLowerCase()));
  const rounds = [];

  for (const r of raw?.rounds ?? []) {
    const category = clean(r.category).toUpperCase();
    if (!category) continue;
    const seen = new Set();
    const keep = (list) => {
      const out = [];
      for (const item of list ?? []) {
        const term = clean(item.term);
        const def = fitDefinition(clean(item.definition));
        const key = term.toLowerCase();
        if (!term || !def) dropped.push(`"${term || '?'}": empty term or definition`);
        else if (term.length > RULES.maxTermLength) dropped.push(`"${term}": longer than ${RULES.maxTermLength} characters`);
        else if (banned.has(key)) dropped.push(`"${term}": clashes with a brainrot word`);
        else if (seen.has(key)) dropped.push(`"${term}": duplicate in round ${category}`);
        else {
          seen.add(key);
          definitions[term] ??= def; // a term reused in a later round keeps its first definition
          out.push(term);
        }
      }
      return out;
    };
    const correct = keep(r.correct);
    const wrong = keep(r.wrong);
    if (correct.length < RULES.minCorrect || wrong.length < RULES.minWrong) {
      dropped.push(`round ${category}: only ${correct.length} correct and ${wrong.length} wrong terms left`);
      continue;
    }
    rounds.push({ rule: `Slice only: ${category}`, correct, wrong });
  }

  if (rounds.length < RULES.minRounds) {
    throw new Error(
      `Only ${rounds.length} usable round${rounds.length === 1 ? '' : 's'} came back (need ${RULES.minRounds}). ` +
        'Try a longer or more technical job description.',
    );
  }

  // Keep only definitions for terms that survived.
  const used = new Set(rounds.flatMap((r) => [...r.correct, ...r.wrong]));
  for (const term of Object.keys(definitions)) if (!used.has(term)) delete definitions[term];

  const title = clean(raw.title).slice(0, 40) || 'Your Job Spec';
  return { deck: { id, title, rounds, definitions, generated: true }, dropped };
}
