# Slice the Rot

A retro arcade revision game: **slice the rot, keep the knowledge**. Fly-up terms challenge you to identify the right answers while avoiding plausible wrong terms and brainrot. Webcam hand tracking controls the blade.

## How to play
1. Choose a revision deck on the **INSERT COIN** screen.
2. Allow webcam access and stand where your shoulders and wrists are visible.
3. Read the rule at the start of each round (e.g. *Slice only: SQL COMMANDS*).
4. Slice terms that fit the rule by moving your arms through them. Avoid wrong terms and brainrot words; the latter deep-fry the screen!
5. Review missed and wrong-sliced terms after each round. Enter your three-letter initials for the local high-score table after the game.

Press **M** to mute/unmute sound. Respect your comfortable movement range; this is a game, not medical assessment software.

## Local development
```bash
npm install
npm run dev
```
Open `http://localhost:5173/`. Webcam input requires permission and localhost or HTTPS. The game UI starts in camera mode only.

```bash
npm run check:decks
npm run build
npm run preview
```

## Deployment
A GitHub Actions Pages workflow is included. The repository owner must enable **Settings → Pages → Build and deployment → GitHub Actions** before relying on it. Vite uses the GitHub repository name as its production base path during the Pages build.

## Team boundary
See `AGENTS.md` (Partner), `CLAUDE.md` (Owner) and `docs/CONTRACT.md` (event bus contract). The Partner owns `src/ui/*`, `src/styles/*`, storage, deck loading, and deployment. The Owner owns game logic, input and `src/main.js`.

## Extra arcade features
- First-time players see a four-step **How to Play** tutorial. Return to it using the menu button; the tutorial can be skipped. Reset it by clearing the browser's `str.tutorial.seen` localStorage value.
- The **Game Over** screen charts cumulative score from `score:update` events during that session (including penalties). Scores are only sampled when they change; it is not a clinical movement assessment.
- Slicing brainrot triggers short, word-specific **emoji/CSS consequences** (for example `rizz`, `skibidi`, `sigma`, `ohio`, plus character-name tokens `Tralalero`, `Cappuccina`, `Tung Tung Sahur`, `Bombardiro`). Actual character art is intentionally not used. Other terms trigger a generic consequence. Effects respect reduced-motion preferences.
- Character-name tokens are included as **text** in `brainrot.json`, because rendering targets is owned by the game engine. Displaying illustrated character targets would need Owner-side implementation and approval of original artwork.
