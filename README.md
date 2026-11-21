# Slice the Rot

**Slice the rot. Keep the knowledge.**

Slice the Rot is a retro arcade revision game you play with your hands. Tech terms fly up the screen and each round gives you a rule, such as *Slice only: GIT COMMANDS*. Swipe your finger through the terms that fit the rule, leave the plausible-but-wrong ones alone, and never slice the brainrot.

The webcam tracks your hands in the browser, so there is nothing to install and no controller. Your index fingertip is the blade, and both hands can slice at once. Correct and wrong terms look identical, so you can't win by reflex: you have to actually know the material.

▶ **Play it:** https://pan-nav.github.io/First-Year-hackKing-s-winning-project/

It's made for students revising for technical interviews, spring weeks and exams. A quick game turns definitions you skim past into split-second decisions, then shows you exactly which ones you got wrong.

## How to play

1. Pick a deck and press **INSERT COIN**. Allow camera access and stand back so your upper body is in frame.
2. **Warm-up:** five seconds of *SLICE ME* targets to get the feel. They don't affect your score or your lives.
3. **Rounds:** each round lasts 20 seconds and shows its rule at the start. Slice the terms that fit it.
4. **Between rounds:** review the terms you missed or sliced by mistake, each with its definition. Swipe **NEXT ROUND ▶** (or press Enter) to carry on.
5. **Game over** comes after the last round or when you run out of brains. Enter your initials for the local top 10, then swipe **PLAY AGAIN ▶**.

| You... | Result |
| --- | --- |
| slice a correct term | +10 × your combo (correct slices within 1.5 s of each other build the combo, up to ×5) |
| slice a wrong term | −5, combo reset, and a card shows what the term really is |
| slice brainrot | −15, combo reset, you lose a brain 🧠, and brainrot takes over the screen |
| let a correct term fall | a miss; every 6 misses in a round costs a brain |

You start with three brains 🧠🧠🧠. Each round throws terms faster, with more traps and more double throws.

### Brainrot

Brainrot words are internet slang such as *skibidi*, *rizz*, *sigma* and *ohio*. They look glitchy, and slicing one sets off a full-screen takeover. Play freezes while it runs, so you never miss a word because of it. Four brainrot characters get their own animations: **Tung Tung Sahur** (a log bonking three times), **Tralalero** (a shark swimming across the screen), **Bombardiro** (a crocodile bomber) and **Cappuccina** (a pirouetting coffee cup). Tung Tung Sahur turns up once in every game. All of these are drawn with emoji and CSS; no meme artwork or audio is used.

### Learning features

- **Definition cards** appear mid-game when you slice a wrong term or miss a correct one.
- **Adaptive repetition:** terms you got wrong come back more often in later games and are tagged **↻ REVIEW**.
- **Learning score** at game over: your accuracy (the share of right calls), targets sliced, traps dodged, and the terms you **mastered this game** (wrong in an earlier game, right this time).
- **Your 5 weakest terms** with definitions, plus a graph of your score over the game.

## Decks

| Deck | What's in it |
| --- | --- |
| Data Structures & Big-O | Hash maps, heaps, trees and the complexity classes interviewers love |
| SQL & Databases | Joins, keys, NoSQL and transactions |
| Git & the Command Line | Commits, branches and shell basics |
| Networking & the Web | HTTP methods, status codes and protocol layers |
| OOP & Software Design | OOP concepts, design patterns and agile terms |
| Technology Spring Week | Generated from a sample spring-week job ad, then checked by hand |

Each deck has at least three rounds. Each round has a rule, the terms that fit it, plausible wrong terms, and a definition of 80 characters or fewer for every term. Decks are JSON files in `public/decks/`, listed in `index.json`. `npm run check:decks` validates them, and CI runs it on every push.

### Make a deck from a job description

Press **✦ PASTE A JOB SPEC** on the start screen and paste an internship or job ad. A language model picks out the role's key terms, writes the definitions and plausible wrong answers, and builds a deck. The deck has to pass the same rules as the hand-written ones before you can play it. It uses Gemini by default, or Claude if you paste a key that starts with `sk-ant-`.

- **On the demo laptop:** put `VITE_GEMINI_API_KEY=...` in `.env.local`. That file is git-ignored and only read by `npm run dev`, so the key never ends up in a build. When a key is loaded, the key field is hidden.
- **Anywhere else:** paste a key into the form. It is kept in memory only and never saved.
- Generated decks last until you reload the page. To hide the feature, set `VITE_ENABLE_JOB_SPEC=false`.

## Controls

- **Camera (default):** your index fingertip is the blade, and up to two hands each get their own blade. The camera video is processed in your browser and never uploaded.
- **Mouse or touch:** add `?input=mouse` to the URL. The game also switches to the mouse automatically if the camera is blocked or unavailable, and the HUD tells you so.
- **Keyboard:** Enter or Space presses the main button on each screen, and **M** mutes the chiptune music and sound effects.

The game respects your system's reduced-motion setting. Stay within a comfortable range of movement: this is a game, not medical or fitness software.

## Run it locally

```bash
npm install
npm run dev          # http://localhost:5173 (the camera needs localhost or HTTPS)
npm run check:decks  # validate the decks
npm run build        # production build in dist/
npm run preview      # serve the build
```

**Offline play** (for unreliable Wi-Fi): `npm run vendor:mediapipe` copies MediaPipe's wasm files and downloads the hand model into `public/mediapipe/`. Add `pose_landmarker_lite.task` there as well to keep pose assist offline. Without these local files, the models load from the CDN.

| URL option | What it does |
| --- | --- |
| `?input=mouse` | Play with the mouse or touch instead of the camera |
| `?deck=<id>` | Start straight into a deck, e.g. `?deck=git-cli` |
| `?debug` | Draws every blade sample and tracking gap, and logs the tracker's frame rate to the console |
| `?exposure=<ms>` | Sets manual webcam exposure if the camera supports it (less motion blur) |

## Deployment

Every push to `main` runs `.github/workflows/pages.yml`. It validates the decks, builds the game and deploys it to GitHub Pages. The site is static: there is no server and there are no accounts.

## How it works

Plain JavaScript (ES modules) built with Vite, drawn on a 2D canvas, with no framework. Modules only talk to each other through a small event bus (`src/bus.js`), and every event and its payload is documented in [`docs/CONTRACT.md`](docs/CONTRACT.md).

- **Input** (`src/input/`): MediaPipe hand tracking runs once per camera frame (`handTracker.js`). `fusion.js` then:
  - keeps each hand on the same blade ID;
  - smooths the fingertip with a One-Euro filter (steady when still, little lag when fast);
  - drops tracking glitches;
  - uses MediaPipe's body (pose) tracker to follow an arm through a fast swipe, where a 30 fps webcam blurs the hand too much to track.
  
  `mouseBlade.js` is the mouse and touch fallback.
- **Game** (`src/game/`):
  - `engine.js` runs a 1280×720 logical world: physics, rounds, scoring, lives, the brainrot freeze and the hands-free menus. Slicing uses swept collision (the blade's path since the last frame against each word), so fast swipes can't skip over a word.
  - `adaptive.js` weights term picks by your past mistakes.
  - `deckGen.js` and `deckRules.js` generate and validate decks.
- **UI** (`src/ui/`): screens, HUD, blade trail, particles, the brainrot takeover and sound effects. `src/music.js` synthesises the chiptune with the Web Audio API. The styles are `src/styles/retro.css` plus Tailwind CSS 4 (without its reset).
- **Tuning:** gameplay numbers (speeds, scores, lives, hitboxes, tracking thresholds) live in `src/config.js`.
- **Storage:** high scores, term stats and settings stay in your browser's `localStorage` (`str.*` keys). The only thing sent anywhere is the job spec, to the model provider, when you press GENERATE.

## Built with

Vite · MediaPipe Tasks Vision (hand and pose landmarkers) · Canvas 2D · Web Audio · Tailwind CSS · Gemini / Claude APIs (job-spec decks) · GitHub Actions and Pages.

Built at a hackathon by a two-person team working with AI coding agents (Claude Code and Codex). Their briefs are in [`CLAUDE.md`](CLAUDE.md) and [`AGENTS.md`](AGENTS.md).
