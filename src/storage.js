// PARTNER owns this file. localStorage helpers. The OWNER's adaptive code calls getTermStats / saveTermStats.
const KEYS = { scores: 'str.highscores', stats: 'str.termstats' };

function read(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or blocked: ignore, the game still works
  }
}

/** [{ initials, score, date }] sorted best first, max 10 */
export function getHighScores() {
  return read(KEYS.scores, []);
}

/** Adds an entry and returns the updated top 10. */
export function addHighScore({ initials, score }) {
  const entry = { initials: String(initials).slice(0, 3).toUpperCase(), score, date: Date.now() };
  const list = [...getHighScores(), entry].sort((a, b) => b.score - a.score).slice(0, 10);
  write(KEYS.scores, list);
  return list;
}

/** { [term]: { seen, errors } } across all games */
export function getTermStats() {
  return read(KEYS.stats, {});
}

export function saveTermStats(stats) {
  write(KEYS.stats, stats);
}
