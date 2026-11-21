# Slice the Rot

A retro arcade revision game: **slice the rot, keep the knowledge**. Fly-up terms challenge you to identify the right answers while avoiding plausible wrong terms and brainrot. Hand tracking or mouse controls can act as the blade.

## How to play
1. Choose a revision deck on the **INSERT COIN** screen.
2. Select **CAMERA / ARMS** and allow webcam access, or **MOUSE / TEST** for mouse controls.
3. Read the rule at the start of each round (e.g. *Slice only: SQL COMMANDS*).
4. Slice terms that fit the rule by moving a hand or the mouse through them. Avoid wrong terms and brainrot words; the latter deep-fry the screen!
5. Review missed and wrong-sliced terms after each round. Enter your three-letter initials for the local high-score table after the game.

Press **M** to mute/unmute sound. Respect your comfortable movement range; this is a game, not medical assessment software.

## Local development
```bash
npm install
npm run dev
```
Open `http://localhost:5173/?input=mouse` to test without a camera. Webcam input requires permission and localhost or HTTPS.

```bash
npm run check:decks
npm run build
npm run preview
```

## Deployment
A GitHub Actions Pages workflow is included. The repository owner must enable **Settings → Pages → Build and deployment → GitHub Actions** before relying on it. Vite uses the GitHub repository name as its production base path during the Pages build.

## Team boundary
See `AGENTS.md` (Partner), `CLAUDE.md` (Owner) and `docs/CONTRACT.md` (event bus contract). The Partner owns `src/ui/*`, `src/styles/*`, storage, deck loading, and deployment. The Owner owns game logic, input and `src/main.js`.
