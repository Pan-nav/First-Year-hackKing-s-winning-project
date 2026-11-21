// Shared tunables. OWNER edits these while tuning. PARTNER may read them but not change them.
export const CONFIG = {
  maxLives: 3,
  roundSeconds: 20,
  pointsCorrect: 10,
  penaltyWrong: 5,
  penaltyBrainrot: 15,
  comboWindowMs: 1500, // correct slices this close together build the combo
  comboMax: 5, // multiplier cap
  wrongChance: 0.3, // share of spawned items that are plausible-but-wrong terms
  brainrotChance: 0.15, // share of spawned items that are brainrot
  missesPerLife: 3, // missed correct terms needed to lose one life
  gravity: 650, // logical px per second squared (low so words hang long enough to read)
  logicalWidth: 1280,
  logicalHeight: 720,
  minSliceSpeed: 0.6, // blade speed (screen widths per second) needed to count as a slice
  maxJump: 0.35, // a blade move longer than this (screen widths) in one sample starts a new stroke
  apexMin: 0.55, // apex height as a share of screen height
  apexMax: 0.85,
  minAirtime: 2.2, // seconds; spawner never throws faster than this
  spawnIntervalStart: 1.15, // seconds between spawns in round 1
  spawnIntervalStep: 0.12, // shorter each round
  spawnIntervalMin: 0.6,
  doubleSpawnChance: 0.2, // chance a spawn throws two items (rises each round)
  chipFontPx: 38, // logical px, must stay >= 36
  hitPad: 26, // extra logical px around each chip for slicing (hand tracking is jittery)
  drawBladeDebug: false, // thin engine blade line; the Partner's #fx trail replaces it
};
