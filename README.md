# Slice the Rot

A hand-tracked, Fruit Ninja-style **revision game**. Tech terms fly up the screen and every round has a rule ("Slice only: SQL commands"). Slice the right terms, dodge the wrong ones, and whatever you do, **don't slice the brainrot**: it deep-fries your screen.

*Slice the rot, keep the knowledge.* Built for KCL Tech Society's First Year Hack (Retro Remix track), Sat 21 Nov 2026.

## Run it
```bash
npm install
npm run dev      # http://localhost:5173 (the camera works on localhost)
```
No camera? Play with the mouse: `http://localhost:5173/?input=mouse`

Other scripts: `npm run build`, `npm run preview`, `npm run check:decks`

## Who does what
| | Owner (works with Claude) | Partner (works with Codex) |
|---|---|---|
| Brief | `CLAUDE.md` | `AGENTS.md` |
| Owns | hand tracking, engine, scoring, adaptive repetition, `src/main.js`, deck content | screens, HUD, effects, audio, retro CSS, storage, deploy, content QA |

The two halves only talk through events on the bus. The contract is `docs/CONTRACT.md`.

## Team rules
- Work on `main`, small commits, `git pull --rebase` before every push.
- Only edit files you own. Need a change elsewhere? Add a note to `docs/QUESTIONS.md`.
- `npm run build` must pass before you push.
- Never commit API keys or `.env` files.
