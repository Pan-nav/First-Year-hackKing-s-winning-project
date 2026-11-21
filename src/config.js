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
  missesPerLife: 6, // missed correct terms in one round needed to lose a life (count resets each round)
  gravity: 650, // logical px per second squared (low so words hang long enough to read)
  logicalWidth: 1280,
  logicalHeight: 720,
  minSliceSpeed: 0.6, // blade speed (screen widths per second) needed to count as a slice
  // A blade move longer than maxJump (screen widths) in one sample AND faster than maxBladeSpeed
  // (screen widths per second) is a tracking glitch, not a swipe. Real fast swipes with a dropped
  // camera frame or two stay well under 9 w/s; an id swap between two hands is ~12+ w/s.
  maxJump: 0.3,
  maxBladeSpeed: 9,
  // Gaps longer than bridgeAfterMs (the tracker lost the hand, usually to motion blur mid-swipe) are
  // swept across only if the hand was already moving at bridgeMinSpeed (w/s) towards where it reappeared.
  bridgeAfterMs: 110,
  bridgeMinSpeed: 0.35,
  // Camera box (MediaPipe 0..1 coords, x already mirrored) that maps onto the full screen, so the
  // hand never has to touch the frame edge, where MediaPipe loses it. Tune at the venue.
  reach: { left: 0.08, right: 0.92, top: 0.12, bottom: 0.85 },
  apexMin: 0.55, // apex height as a share of screen height
  apexMax: 0.8, // keeps the highest words below the HUD bar and within easy reach
  minAirtime: 2.2, // seconds; spawner never throws faster than this
  spawnIntervalStart: 1.3, // seconds between spawns in round 1
  spawnIntervalStep: 0.12, // shorter each round
  spawnIntervalMin: 0.6,
  doubleSpawnChance: 0.2, // chance a spawn throws two items (rises each round)
  chipFontPx: 38, // logical px, must stay >= 36
  hitPad: 38, // extra logical px around each chip: hit radius 72 px, 20% more than the old 60
  drawBladeDebug: false, // thin engine blade line; the Partner's #fx trail replaces it
};
