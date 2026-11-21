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
| `blade:point` | `{ id, x, y, t }` | Blade tip moved. `id` is 0 or 1 (which hand). Mouse is always 0. |
| `blade:end` | `{ id }` | Blade lifted or hand lost. The next point starts a new stroke. |

## UI to engine (produced by `ui/*`)
| Event | Payload | Meaning |
|---|---|---|
| `ui:start` | `{ deckId, input? }` | Start or restart a game. `input` is `'hands'` or `'mouse'` (optional). |
| `ui:continue` | `{}` | Player pressed NEXT ROUND on the round summary. Engine waits for this. |
| `ui:pause` / `ui:resume` | `{}` | Pause and resume. |

## Engine to everyone (produced by `game/engine.js`)
| Event | Payload |
|---|---|
| `game:start` | `{ deckId, deckTitle, totalRounds }` |
| `round:start` | `{ index, total, rule, seconds }` (index starts at 0) |
| `timer:update` | `{ secondsLeft }` (about 4 times a second) |
| `item:slice` | `{ term, kind, x, y, points, combo }` (`points` can be negative) |
| `item:miss` | `{ term }` (a correct term fell off the bottom) |
| `score:update` | `{ score, combo }` |
| `lives:update` | `{ lives, max }` |
| `round:end` | `{ index, missed: [{ term, definition }], wrongSliced: [{ term, definition }] }` |
| `game:over` | `{ score, rounds, termStats, weakTerms }` |

`termStats` is for this game only: `{ [term]: { seen, errors } }`.
`weakTerms` is the top 5 terms by errors: `[{ term, definition }]`.

After `round:end` the engine pauses until `ui:continue`. After the last round (or lives reach 0) it emits `game:over` instead.

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

**`public/decks/brainrot.json`**: `{ "words": ["rizz", "..."] }` (clean words only, 16 characters or fewer)

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
