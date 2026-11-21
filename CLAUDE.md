# CLAUDE.md: brief for the Owner's agent (Claude)

You are the **Owner** on a two-person hackathon team. You own the technically hard parts. The Partner agent (Codex) builds screens, HUD, effects, audio, retro CSS, deploy and content QA: see `AGENTS.md`. **Deadline: Sat 21 Nov 2026, 17:30 UK time. Code freeze 16:30.**

`docs/CONTRACT.md` is the source of truth for events and data shapes. You are the only one who changes it: if you do, tell the human so the Partner agent is told. Run `npm run dev` and open `/?input=mouse` to test without a camera. Before every push: `npm run build`. Work on `main`, small commits, `git pull --rebase` before pushing.

## Files you own
`src/main.js`, `src/bus.js`, `src/config.js`, `src/input/*`, `src/game/*`, `docs/CONTRACT.md`, `CLAUDE.md`, and the deck content in `public/decks/` (except `brainrot.json`).

## Your tasks

### O0. Decks (10-15 min, do first so the Partner can test with real content)
Write 5 decks in `public/decks/` and list them in `index.json`: Data Structures & Big-O (extend the sample), SQL & Databases, Git & the Command Line, Networking & the Web, OOP & Software Design. Each has at least 3 rounds with at least 8 `correct` and 6 `wrong` (plausible but wrong) terms and a definition of 80 characters or fewer for every term. Accuracy matters: leave out anything you are not sure of. `npm run check:decks` must pass.

### O1. Hand tracking (60-75 min) in `src/input/handTracker.js`
- `HandLandmarker` from `@mediapipe/tasks-vision`: `runningMode: 'VIDEO'`, `numHands: 2`, `delegate: 'GPU'`. Webcam 640x480 via `getUserMedia` into `#cam`; call `detectForVideo(video, performance.now())` inside `requestAnimationFrame`.
- Blade tip = index fingertip (landmark 8). `x = 1 - lm.x` (mirror), `y = lm.y`. Smooth with a One-Euro filter or EMA (alpha about 0.5): fast swipes must not lag.
- Emit `blade:point` every frame per hand, and `blade:end` after about 120 ms without that hand.
- **Vendor the wasm and the model into `public/`** (copy `node_modules/@mediapipe/tasks-vision/wasm` and download `hand_landmarker.task`) so the demo works on flaky venue Wi-Fi.
- On camera denial or model failure, throw: `main.js` falls back to the mouse.

### O2. Engine (75 min) in `src/game/engine.js`
- Logical 1280x720 space scaled to the `#game` canvas. Spawn from the bottom with random velocity so the apex is 55-85% of screen height and airtime is at least 2.2 s (people must be able to read the word). Gravity from `CONFIG`.
- Draw each term as a chip, font at least 36 px. **Correct and wrong terms look identical** (that is the test). Brainrot items get an obviously different glitchy look.
- Slicing: swept collision. For each `blade:point` build the segment from the previous point and test it against each item's circle. Count it only if speed is at least `CONFIG.minSliceSpeed`. Each item slices once, then splits into two halves that fly apart.
- Hitboxes forgiving, hand tracking is jittery.

### O3. Rules, scoring, lives, rounds
- Per round: `round:start`, spawn mix by `CONFIG.wrongChance` and `CONFIG.brainrotChance`, `timer:update`, `round:end` with missed and wrongly sliced terms plus definitions, then wait for `ui:continue`. Ramp difficulty each round.
- Correct slice: `+pointsCorrect` times combo multiplier (combo window `comboWindowMs`). Wrong: `-penaltyWrong`, combo reset. Brainrot: `-penaltyBrainrot`, combo reset, lose a life. Missing a correct term emits `item:miss` (tune whether it costs a life; three misses per life is gentler).
- `game:over` after the last round or at zero lives, with `termStats` and `weakTerms` (top 5 by errors, with definitions). Handle `ui:pause` and `ui:resume`.

### O4. Adaptive repetition
`src/game/adaptive.js` already has `pickWeighted`. Use it when spawning terms, load stats with `getTermStats()` at game start, and merge and save with `saveTermStats()` at game over. Keep it local, no accounts.

### O5. Integration and tuning (rest of the time until 16:00)
Test in the venue's lighting, tune hitboxes, speeds and difficulty, check the mouse fallback, play a full game with the Partner's screens. Then freeze, rehearse the 2-minute demo, deploy, and record a backup video.

### Stretch (only if O1-O5 are solid)
- **O6. Paste a job description, get a deck.** An LLM extracts terms, definitions and plausible wrong answers into the deck schema, validated by the same rules. Never put an API key in the repo or the bundle: use a small serverless function or have the user paste a key at runtime (kept in memory only).
- **O7. Move mode.** Reward big whole-arm swings (add MediaPipe pose for shoulders and wrists) and show active minutes plus a stretch-break nudge at game over. No medical claims.
