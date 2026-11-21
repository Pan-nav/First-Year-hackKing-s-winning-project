// Shared tunables. OWNER edits these while tuning. PARTNER may read them but not change them.
export const CONFIG = {
  maxLives: 3,
  roundSeconds: 20,
  pointsCorrect: 10,
  penaltyWrong: 5,
  penaltyBrainrot: 15,
  comboWindowMs: 1500, // correct slices this close together build the combo
  comboMax: 5, // multiplier cap
  wrongChance: 0.25, // share of spawned items that are plausible-but-wrong terms (rises to 0.35)
  brainrotChance: 0.25, // share of spawned items that are brainrot (rises to 0.3), so judges meet it
  minBrainrotPerRound: 2, // forced if chance alone has not produced them by 1/3 and 2/3 of the round
  missesPerLife: 6, // missed correct terms in one round needed to lose a life (count resets each round)
  gravity: 650, // logical px per second squared (low so words hang long enough to read)
  logicalWidth: 1280,
  logicalHeight: 720,
  // Blade speed (screen widths per second) needed to slice. High enough that drifting or bringing the
  // hand back after a swipe does not cut words; a deliberate swipe is well above it.
  minSliceSpeed: 0.9,
  // A blade move longer than maxJump (screen widths) in one sample AND faster than maxBladeSpeed
  // (screen widths per second) is a tracking glitch, not a swipe. A real flick can cover a third of
  // the screen in one frame; an id swap between two hands is still 25+ w/s.
  maxJump: 0.4,
  maxBladeSpeed: 16,
  // Gaps longer than bridgeAfterMs (the tracker lost the hand, usually to motion blur mid-swipe) are
  // swept across if the hand was already moving at bridgeMinSpeed (w/s) towards where it reappeared,
  // or if it reappeared within bridgeFastGapMs at an implied speed of bridgeImpliedSpeed (w/s) or more.
  // (Pose assist now fills most blurred swipes, so the "reappeared far away" rule is kept strict.)
  bridgeAfterMs: 110,
  bridgeMinSpeed: 0.35,
  bridgeFastGapMs: 220,
  bridgeImpliedSpeed: 2.5,
  // Switching between hand tracker and body tracker: a jump longer than switchMaxJump (screen widths)
  // only slices if it continues the direction of travel. A pose-to-pose step longer than poseMaxStep
  // in one frame is a body-tracker glitch and never slices.
  switchMaxJump: 0.12,
  poseMaxStep: 0.3,
  // Camera box (MediaPipe 0..1 coords, x already mirrored) that maps onto the full screen, so the
  // hand never has to touch the frame edge, where MediaPipe loses it. Tune at the venue.
  reach: { left: 0.08, right: 0.92, top: 0.12, bottom: 0.85 },
  // While the hand tracker has lost a hand (motion blur on the 30 fps webcam, hands touching), follow
  // that arm with the body (pose) tracker. Turn off if the game gets slow or the blade misbehaves.
  poseAssist: true,
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
