// OWNER (task O4): adaptive repetition. Terms you get wrong come back more often.
// stats shape: { [term]: { seen, errors } }  (see docs/CONTRACT.md)

/** Pick one term from `terms`, favouring the ones the player struggles with. */
export function pickWeighted(terms, stats = {}) {
  const weights = terms.map((term) => {
    const s = stats[term];
    if (!s || s.seen === 0) return 1.5; // unseen terms get a small boost
    return 1 + 3 * (s.errors / s.seen);
  });
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < terms.length; i++) {
    r -= weights[i];
    if (r <= 0) return terms[i];
  }
  return terms[terms.length - 1];
}
