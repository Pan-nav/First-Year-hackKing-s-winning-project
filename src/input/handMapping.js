// OWNER: pure helpers for handTracker.js (no DOM, no MediaPipe), so they can be tested in Node.
import { CONFIG } from '../config.js';

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/**
 * Camera point (MediaPipe normalised, not mirrored) -> screen point (mirrored, 0..1).
 * Only the inner "reach" box of the camera maps to the screen, so the top of the screen is reached
 * with the hand comfortably inside the frame. MediaPipe loses a hand that touches the frame edge,
 * which is why words near the top were hard to slice.
 */
export function mapToScreen(lm, reach = CONFIG.reach) {
  const x = 1 - lm.x; // mirror so moving right goes right
  return {
    x: clamp01((x - reach.left) / (reach.right - reach.left)),
    y: clamp01((lm.y - reach.top) / (reach.bottom - reach.top)),
  };
}

/**
 * Give each detected tip a blade id (0 or 1) that stays glued to the same physical hand.
 * One hand: it keeps the id that is already tracking, however far it moved (fast swipes jump a lot
 * between camera frames). Two hands: the pairing with the smaller total distance wins.
 * @param {{x,y}[]} tips at most 2, in screen space
 * @param {{ active: boolean[], lastPos: ({x,y}|null)[] }} state
 */
export function assignIds(tips, { active, lastPos }) {
  if (tips.length === 0) return [];
  const dist = (tip, id) => Math.hypot(tip.x - lastPos[id].x, tip.y - lastPos[id].y);
  const tracked = [0, 1].filter((id) => active[id] && lastPos[id]);
  if (tips.length === 1) {
    if (tracked.length === 0) return [0];
    if (tracked.length === 1) return [tracked[0]];
    return dist(tips[0], 0) <= dist(tips[0], 1) ? [0] : [1];
  }
  if (tracked.length === 0) return tips[0].x <= tips[1].x ? [0, 1] : [1, 0];
  if (tracked.length === 1) {
    const id = tracked[0];
    return dist(tips[0], id) <= dist(tips[1], id) ? [id, 1 - id] : [1 - id, id];
  }
  const straight = dist(tips[0], 0) + dist(tips[1], 1);
  const swapped = dist(tips[0], 1) + dist(tips[1], 0);
  return straight <= swapped ? [0, 1] : [1, 0];
}
