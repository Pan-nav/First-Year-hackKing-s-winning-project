# Contract: how the pieces talk

Everything goes through the event bus in `src/bus.js`:

```js
import { bus } from '../bus.js';
const off = bus.on('item:slice', (payload) => { /* ... */ }); // off() removes the listener
bus.emit('ui:start', { deckId: 'data-structures' });
```

**Conventions**
- Screen positions are **normalised 0 to 1**, origin top-left, already **mirrored** (hand moves right = `x` goes up).
- `t` is `performance.now()` in milliseconds.
- `kind` is always one of `'correct'`, `'wrong'`, `'brainrot'`.
- Only the OWNER changes this file. The PARTNER writes questions in `docs/QUESTIONS.md`.

## Layers in `index.html`
| Element | Owner of its contents |
|---|---|
| `#cam` (webcam preview) | Owner |
| `#game` canvas (flying words) | Owner |
| `#fx` canvas (trail, particles) | Partner |
| `#hud` and `#screens` (DOM) | Partner |
| `#stage` classes `deepfried` and `shake` | Partner toggles them, CSS in `retro.css` |

## Input events (produced by `input/handTracker.js` or `input/mouseBlade.js`)
| Event | Payload | Meaning |
|---|---|---|
| `blade:point` | `{ id, x, y, t, src? }` | Blade tip moved. `id` is 0 or 1 (which hand). Mouse is always 0. `src: 'pose'` marks a point estimated by the body tracker while the hand tracker had lost the hand (fast blurred swipes); treat it like any other point. |
| `blade:end` | `{ id }` | Blade lifted or hand lost. The next point starts a new stroke. |

## UI to engine (produced by `ui/*`)
| Event | Payload | Meaning |
|---|---|---|
| `ui:start` | `{ deckId, input? }` | Start or restart a game. `input` is `'hands'` or `'mouse'` (optional). |
| `ui:continue` | `{}` | Player pressed NEXT ROUND on the round summary. Engine waits for this. |
| `ui:pause` / `ui:resume` | `{}` | Pause and resume. |
| `ui:generateDeck` | `{ jobText, apiKey? }` | Build a deck from a pasted job description. `apiKey` is the player's Google AI Studio (Gemini) key, or an Anthropic key starting `sk-ant-`; it is kept in memory only, so later requests may omit it. On the demo laptop (dev server with `.env.local`) a key is already loaded, so `apiKey` may be empty: see `deck:keyStatus`. Ignored while a generation is running. |

## Engine to everyone (produced by `game/engine.js`)
| Event | Payload |
|---|---|
| `game:start` | `{ deckId, deckTitle, totalRounds }` |
| `round:start` | `{ index, total, rule, seconds, review }` (index starts at 0; `review` is the terms in this round the player got wrong in any earlier game or round, possibly empty) |
| `timer:update` | `{ secondsLeft }` (about 4 times a second) |
| `item:slice` | `{ term, kind, x, y, points, combo, definition }` (`points` can be negative; `definition` is `''` for brainrot) |
| `item:miss` | `{ term, definition }` (a correct term fell off the bottom) |
| `score:update` | `{ score, combo }` |
| `lives:update` | `{ lives, max }` |
| `round:end` | `{ index, missed: [{ term, definition }], wrongSliced: [{ term, definition }] }` |
| `game:over` | `{ score, rounds, termStats, weakTerms }` |
| `deck:generating` | `{}` (a `ui:generateDeck` request started; usually 10 to 25 s, gives up after about 55 s) |
| `deck:ready` | `{ deckId, title, rounds }` (`rounds` is the list of rule strings). Start it with `ui:start { deckId }`. |
| `deck:error` | `{ message }` (a sentence to show the player as is) |
| `deck:keyStatus` | `{ hasKey }` (sent once at startup; `hasKey: true` means a key is preloaded, so the key field should be optional) |

`termStats` is for this game only: `{ [term]: { seen, errors } }`.
`weakTerms` is the top 5 terms by errors: `[{ term, definition }]`.

**Drawn by the engine on `#game` (so the Partner does not need to):** a definition card where a wrong term was sliced (red) or a correct term was missed (amber), a `↻ REVIEW` tab on chips the player got wrong before (correct and wrong terms alike, so it gives nothing away), and a `↻ N TERMS YOU GOT WRONG ARE BACK` callout at 68% height for about 3 s after `round:start`. Cards sit in one strip at the bottom centre, at most 2 at a time, underneath the flying chips.

After `round:end` the engine pauses until `ui:continue`. After the last round (or lives reach 0) it emits `game:over` instead.

**The last round does not emit `round:end`.** When the final round finishes, the engine goes straight to `game:over`; that round's missed and wrongly sliced terms are covered by `weakTerms`. So the round summary screen never shows after the final round, and a game that ends at 0 lives mid-round also emits `game:over` with no `round:end`.

## Data shapes

**`public/decks/index.json`**: `[{ "id", "title", "description" }]`

**`public/decks/<id>.json`**
```json
{
  "id": "data-structures",
  "title": "Data Structures & Big-O",
  "rounds": [
    { "rule": "Slice only: SQL COMMANDS", "correct": ["SELECT", "..."], "wrong": ["git commit", "..."] }
  ],
  "definitions": { "SELECT": "SQL command that reads rows from a table" }
}
```
Rules enforced by `npm run check:decks`: at least 3 rounds; each round has at least 6 `correct` and 5 `wrong` terms; every term has a definition of 80 characters or fewer; terms are 16 characters or fewer; no duplicates.

**Generated decks** (from `ui:generateDeck`) have the same shape plus `generated: true`, live only in memory, and are started by their `deckId` like any other deck. Terms and definitions are plain text (no `<`, `>` or backticks), but still insert them with `textContent`.

**`public/decks/brainrot.json`**: `{ "words": ["rizz", "..."] }` (clean words only, 16 characters or fewer)

**Brainrot characters** come from `CONFIG.brainrotCharacters` in `src/config.js` (`TUNG TUNG SAHUR`, `TRALALERO`, `BOMBARDIRO`, `CAPPUCCINA`), not from `brainrot.json`. They spawn as `kind: 'brainrot'` with `term` exactly as listed, so `ui/effects.js` matches them lower-cased. Every game shows `TUNG TUNG SAHUR` once in round 1.

**Brainrot characters** are added by the engine from `CONFIG.brainrotCharacters` (`src/config.js`), not from `brainrot.json`: `TUNG TUNG SAHUR`, `TRALALERO`, `BOMBARDIRO`, `CAPPUCCINA`. They arrive as `item:slice` with `kind: 'brainrot'` and `term` exactly as listed, so `ui/effects.js` matches them lower-cased. Every game shows `TUNG TUNG SAHUR` once in round 1; after that about a quarter of brainrot spawns are characters. To add one, add its name to that list (16 characters or fewer) and a matching key in `ui/effects.js`.

## Storage (`src/storage.js`)
- `getHighScores()` returns `[{ initials, score, date }]`, best first, max 10
- `addHighScore({ initials, score })` returns the updated list
- `getTermStats()` returns `{ [term]: { seen, errors } }` across all games
- `saveTermStats(stats)`

## Fake events for testing the UI without the engine
Run these in the browser console (`window.bus` is exposed):
```js
bus.emit('game:start', { deckId: 'data-structures', deckTitle: 'Data Structures & Big-O', totalRounds: 3 });
bus.emit('round:start', { index: 0, total: 3, rule: 'Slice only: SQL COMMANDS', seconds: 20 });
bus.emit('timer:update', { secondsLeft: 12 });
bus.emit('score:update', { score: 40, combo: 3 });
bus.emit('lives:update', { lives: 2, max: 3 });
bus.emit('item:slice', { term: 'SELECT', kind: 'correct', x: 0.5, y: 0.5, points: 10, combo: 3 });
bus.emit('item:slice', { term: 'curl', kind: 'wrong', x: 0.4, y: 0.6, points: -5, combo: 0 });
bus.emit('item:slice', { term: 'rizz', kind: 'brainrot', x: 0.6, y: 0.4, points: -15, combo: 0 });
bus.emit('item:miss', { term: 'JOIN' });
bus.emit('round:end', { index: 0, missed: [{ term: 'JOIN', definition: 'SQL clause that combines rows from two tables' }], wrongSliced: [{ term: 'curl', definition: 'Command line tool for HTTP requests' }] });
bus.emit('game:over', { score: 120, rounds: 3, termStats: { JOIN: { seen: 4, errors: 2 } }, weakTerms: [{ term: 'JOIN', definition: 'SQL clause that combines rows from two tables' }] });
```
