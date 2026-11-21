// PARTNER owns this file. Loads deck JSON from public/decks (schema: docs/CONTRACT.md).
const base = import.meta.env.BASE_URL;

async function getJson(path) {
  const res = await fetch(`${base}decks/${path}`);
  if (!res.ok) throw new Error(`Could not load deck file ${path}`);
  return res.json();
}

/** [{ id, title, description }] */
export const loadDeckIndex = () => getJson('index.json');

/** One full deck object. */
export const loadDeck = (id) => getJson(`${id}.json`);

/** Array of brainrot strings. */
export const loadBrainrot = async () => (await getJson('brainrot.json')).words;
