# AGENTS.md: brief for the Partner's coding agent

You are the **Partner agent** on a two-person hackathon team (the other person works with a different agent, the "Owner"). Read this file and `docs/CONTRACT.md` fully before you touch any code.

**Deadline: Sat 21 Nov 2026, 17:30 UK time. Code freeze at 16:30.** Ship small working pieces, commit often, keep it simple.

## The project
"Slice the Rot" is a Fruit Ninja-style browser game you control by waving your hand at the webcam (or the mouse, for testing). Tech terms fly up the screen. Each round shows a rule such as "Slice only: SQL COMMANDS". Correct terms should be sliced. Wrong-but-plausible terms and **brainrot** words ("rizz", "skibidi") must not be sliced. Slicing brainrot "deep-fries" the screen as a joke. It is revision for spring weeks and summer internships, in a retro arcade look (CRT scanlines, INSERT COIN, chiptune beeps, 3-letter high-score initials). Pitch: *slice the rot, keep the knowledge*.

The **Owner** builds the hard parts: hand tracking, game loop, collisions, scoring, adaptive repetition. **You build everything people see and hear around the game**, plus deploy and content QA. You only talk to the Owner's code through events on `bus`, described in `docs/CONTRACT.md`. You do not need the engine to finish your work: use the fake events at the bottom of `docs/CONTRACT.md`.

## Ground rules
- Stack: vanilla JavaScript (ES modules), Canvas and CSS, bundled with Vite. **No frameworks, no TypeScript, no new npm dependencies** unless the human says so.
- Setup: `npm install`, then `npm run dev`, then open `http://localhost:5173/?input=mouse` (the mouse is the blade, no camera needed).
- Before every push: `npm run build` must pass, and `npm run check:decks` if you touched decks.
- Work directly on `main`. Commit small and often, message style `partner: add start screen`. Run `git pull --rebase` before every `git push`.
- **Only edit files you own** (below). If you need a change anywhere else, or think the contract is wrong, add a note to `docs/QUESTIONS.md`, make a sensible assumption and carry on. Never edit `docs/CONTRACT.md`.
- Keep existing function names and signatures in stub files (the Owner calls them).
- Never commit secrets or `.env` files. No copyrighted images or audio, no meme images: text, emoji, CSS and WebAudio-generated sounds only. Brainrot words stay clean (no slurs, nothing crude).
- Respect `prefers-reduced-motion` (skip shake and flashing).

## Files you own
`src/ui/*`, `src/styles/*`, `src/decks.js`, `src/storage.js`, `public/decks/brainrot.json`, `scripts/*`, `.github/*`, `README.md`, and the layout of `index.html`.

**Do not edit:** `src/main.js`, `src/bus.js`, `src/config.js`, `src/input/*`, `src/game/*`, `docs/CONTRACT.md`, `CLAUDE.md`, and the deck files other than `brainrot.json`.

## Your tasks (do them in this order, commit after each)

### P1. Screens (about 45 min) in `src/ui/screens.js`
- **Start screen:** big title SLICE THE ROT, tagline, one button per deck from `loadDeckIndex()`, a Camera / Mouse toggle, and a big INSERT COIN style start button. It emits `ui:start { deckId, input }`.
- **Round summary** on `round:end`: list `missed` and `wrongSliced` with their definitions, plus a NEXT ROUND button that emits `ui:continue`.
- **Game over** on `game:over`: score, 3-letter initials entry saved with `addHighScore`, the top 10 from `getHighScores()`, a "Your weak terms" cheat sheet from `weakTerms`, and a PLAY AGAIN button that returns to the start screen.
- Readable at 1280x720 and 1920x1080. Space or Enter activates the main button.
- **Done when:** with the fake events you can click through start, round summary, game over and back to start.

### P2. HUD and mascot (about 30 min) in `src/ui/hud.js`
- Show the rule banner on `round:start` (big for 2 seconds, then smaller in the top bar), score, combo ("x3"), lives as three brain emoji that turn into skulls as lives drop, and a timer bar from `timer:update`.
- A pixel-style brain mascot in a corner that looks more "melted" as lives drop (CSS classes or filters).
- **Done when:** the fake events update every element.

### P3. Effects (about 45 min) in `src/ui/effects.js` plus CSS hooks in `retro.css`
- Neon blade trail drawn on the `#fx` canvas from `blade:point` (fades over about 250 ms, one trail per `id`, cleared on `blade:end`).
- On `item:slice`: particles (at most 200 alive), green sparks for `correct`, red for `wrong`, floating text of `points`, a small shake on `wrong`.
- On `item:slice` with `kind: 'brainrot'`: add class `deepfried` to `#stage` for 2 seconds, add `shake`, and burst a few emoji particles. Add grain or glitch styling in CSS to make it funny.
- **Done when:** the mouse trail and the fake events look good at 60 fps.

### P4. Audio (about 30 min) in `src/ui/audio.js`
- WebAudio-generated sounds only (no files): correct-slice blip whose pitch rises with `combo`, wrong buzz, brainrot thud with distortion, `item:miss` sad blip, `round:start` jingle, `game:over` jingle.
- Create the AudioContext on the first click or key press. Mute button plus the M key, remembered in localStorage. Keep volume modest.
- **Done when:** each event makes a distinct sound.

### P5. Retro skin (about 45 min) in `src/styles/retro.css` and the `index.html` layout
- Arcade cabinet look: dark background, neon green, magenta and cyan, pixel font (`"Press Start 2P"` from Google Fonts with a monospace fallback), CRT scanline overlay (CSS only, `pointer-events: none`), vignette, glowing text, styled buttons with focus outlines.
- **Done when:** it looks like an arcade at 1280x720 and 1920x1080.

### P6. Deploy and README (about 20 min)
- Check that `npm run build` then `npm run preview` works.
- In `README.md` add a short "How to play" section.
- Add `.github/workflows/pages.yml` that builds and deploys `dist/` to GitHub Pages, but **ask the human before relying on it** (free GitHub Pages only works on public repos).

### P7. Content QA (remaining time)
- Expand `public/decks/brainrot.json` to at least 40 clean words (16 characters or fewer each).
- Run `npm run check:decks`. Read every deck for typos and factual doubts. Do not edit terms: list doubts in `docs/QUESTIONS.md`.

## When something blocks you
Write it in `docs/QUESTIONS.md`, pick the simplest assumption, and move to the next task. Tell the human what you assumed.
