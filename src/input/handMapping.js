// OWNER: pure helpers for handTracker.js (no DOM, no MediaPipe), so they can be tested in Node.
import { CONFIG } from '../config.js';

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/**
 * Camera point (MediaPipe normalised, not mirrored) -> screen point (mirrored, 0..1).
 * Only the inner "reach" box of the camera maps to the screen, so the top of the screen is reached
 * with the hand comfortably inside the frame. MediaPipe loses a hand that touches the frame edge,
 * which is why words near the top were hard to slice.
 */
export function mapToScreen(lm, reach = CONFIG.reach, clamp = true) {
  const x = 1 - lm.x; // mirror so moving right goes right
  const sx = (x - reach.left) / (reach.right - reach.left);
  const sy = (lm.y - reach.top) / (reach.bottom - reach.top);
  return clamp ? { x: clamp01(sx), y: clamp01(sy) } : { x: sx, y: sy };
}

// BlazePose landmark indices (the person's own left/right).
const POSE = { L: { wrist: 15, index: 19 }, R: { wrist: 16, index: 20 } };

/**
 * Pose landmarks -> estimated index fingertip for each arm, in screen space (not clamped).
 * The body tracker keeps following an arm through a motion-blurred swipe, when the hand tracker
 * cannot see the hand at all. Pose "index" is the index knuckle, so extend a little past it.
 * `inside` is false when the point is well outside the playable area (e.g. an arm resting by the side).
 */
export function poseHands(lm, reach = CONFIG.reach) {
  if (!lm) return [];
  const out = [];
  for (const side of ['L', 'R']) {
    const w = lm[POSE[side].wrist];
    const i = lm[POSE[side].index];
    if (!w || (w.visibility ?? 1) < 0.5) continue;
    const base = i && (i.visibility ?? 1) >= 0.3 ? { x: i.x + 0.6 * (i.x - w.x), y: i.y + 0.6 * (i.y - w.y) } : w;
    const p = mapToScreen(base, reach, false);
    out.push({ side, x: p.x, y: p.y, inside: p.x > -0.1 && p.x < 1.1 && p.y > -0.15 && p.y < 1.03 });
  }
  return out;
}

/**
 * Link each visible blade id to the arm (pose side) it belongs to, by nearest position.
 * @param {{ id: number, x: number, y: number }[]} visible hand-tracker tips this frame, in screen space
 * @param {{ side: string, x: number, y: number }[]} arms from poseHands
 * @param {Record<number, string|null>} prev previous links, kept for ids that are not visible now
 * @returns {Record<number, string|null>} id -> 'L' | 'R' | null
 */
export function linkArms(visible, arms, prev = { 0: null, 1: null }, maxDist = 0.25) {
  const links = { ...prev };
  const pairs = [];
  for (const v of visible) {
    for (const a of arms) pairs.push({ id: v.id, side: a.side, d: Math.hypot(v.x - a.x, v.y - a.y) });
  }
  pairs.sort((p, q) => p.d - q.d);
  const usedIds = new Set();
  const usedSides = new Set();
  for (const p of pairs) {
    if (p.d > maxDist || usedIds.has(p.id) || usedSides.has(p.side)) continue;
    links[p.id] = p.side;
    usedIds.add(p.id);
    usedSides.add(p.side);
  }
  // A side now owned by a visible hand cannot also belong to another id.
  for (const id of [0, 1]) if (!usedIds.has(id) && usedSides.has(links[id])) links[id] = null;
  return links;
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
