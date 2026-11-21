// Shared tunables. OWNER edits these while tuning. PARTNER may read them but not change them.
export const CONFIG = {
  maxLives: 3,
  roundSeconds: 20,
  pointsCorrect: 10,
  penaltyWrong: 5,
  penaltyBrainrot: 15,
  comboWindowMs: 900,
  wrongChance: 0.3, // share of spawned items that are plausible-but-wrong terms
  brainrotChance: 0.15, // share of spawned items that are brainrot
  gravity: 1500, // logical px per second squared
  logicalWidth: 1280,
  logicalHeight: 720,
  minSliceSpeed: 0.6, // blade speed (screen widths per second) needed to count as a slice
};
