// OWNER: turns each camera frame's hand-tracker fingertips (plus, when it ran, the pose tracker's arm
// estimates) into blade events. Pure logic, no MediaPipe and no DOM, so it can be tested in Node with
// synthetic frames (the webcam cannot be reproduced in tests).
//
// Rules, each one fixing a real problem seen on the 30 fps demo webcam:
// - Pose stands in for a hand only while that arm moves fast (motion blur is the only reason to need it),
//   only for a hand that was tracked long enough to learn its fingertip offset, and for at most
//   poseAssistMs. A still, drifting or briefly-glimpsed hand never gets a pose blade.
// - Once pose has taken over, the blade stays on pose until the hand tracker has seen the hand on
//   switchBackFrames frames in a row. Switching on every flicker made the blade zig-zag.
// - When a hand is lost, its last real (unfiltered) position is sent first, because the smoothed
//   blade lags behind the fingertip.
import { assignIds, linkArms } from './handMapping.js';
import { OneEuro } from './oneEuro.js';

export const FUSION_DEFAULTS = {
  handLostMs: 450, // no point of any source for this long -> blade end
  poseAssistMs: 700, // pose may stand in for at most this long after the hand tracker last saw the hand
  poseMinSpeed: 0.8, // ...and only while the arm moves at least this fast (screen units per second)
  poseLearnFrames: 3, // frames where hand and arm were both seen before pose may stand in
  poseSmoothing: 0.6, // weight of the newest pose estimate (pose is noisy on a blurred arm)
  switchBackFrames: 2, // consecutive hand frames needed to go back from pose to the hand tracker
  maxOffset: 0.2, // fingertip-minus-arm offset is clamped to this (screen units)
  filter: { minCutoff: 1.2, beta: 10, dCutoff: 5 }, // One-Euro: steady when still, little lag when fast
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const clamp01 = (v) => clamp(v, 0, 1);

export function createFusion(options = {}) {
  const o = { ...FUSION_DEFAULTS, ...options };
  const newFilter = () => new OneEuro(o.filter.minCutoff, o.filter.beta, o.filter.dCutoff);
  const fresh = () => ({
    active: false,
    fx: newFilter(),
    fy: newFilter(),
    lastPos: null, // filtered, what the engine last got
    lastSeen: -Infinity, // last point of any source
    handSeen: -Infinity, // last time the hand tracker's point was used
    lastRaw: null, // last unfiltered hand-tracker fingertip
    seenLastFrame: false,
    streak: 0, // consecutive frames the hand tracker saw this hand
    mode: 'hand', // 'hand' | 'pose'
    offset: { x: 0, y: 0 }, // fingertip minus its arm's pose estimate
    learned: 0, // frames the offset was learned on
  });
  const hands = [fresh(), fresh()];
  let links = { 0: null, 1: null }; // blade id -> pose side 'L' | 'R'
  const armState = {}; // side -> smoothed estimate { x, y, t, speed }
  let frame = null;
  let events = [];

  function emit(id, p, t, src) {
    const h = hands[id];
    const x = h.fx.filter(p.x, t / 1000);
    const y = h.fy.filter(p.y, t / 1000);
    h.lastPos = { x, y };
    h.lastSeen = t;
    h.active = true;
    events.push(src === 'pose' ? { type: 'point', id, x, y, t, src } : { type: 'point', id, x, y, t });
  }

  function useHand(id, tip, now) {
    const h = hands[id];
    h.mode = 'hand';
    emit(id, tip, now, 'hand');
    h.handSeen = now;
    h.lastRaw = tip;
  }

  function end(id) {
    if (hands[id].active) events.push({ type: 'end', id });
    hands[id] = fresh();
    links = { ...links, [id]: null };
  }

  return {
    /**
     * Phase 1: this frame's hand-tracker fingertips (screen space, at most 2).
     * @returns {{ needPose: boolean, wantPose: boolean }} needPose: run pose now (a hand is lost or on
     *   pose); wantPose: pose is useful to keep warm (some hand is tracked), e.g. every other frame.
     */
    hands(now, tips) {
      const ids = assignIds(tips, { active: hands.map((h) => h.active), lastPos: hands.map((h) => h.lastPos) });
      const seen = [false, false];
      for (const id of ids) seen[id] = true;
      frame = { now, tips, ids, seen };
      return {
        needPose: [0, 1].some((id) => hands[id].active && (!seen[id] || hands[id].mode === 'pose')),
        wantPose: hands.some((h) => h.active) || tips.length > 0,
      };
    },

    /**
     * Phase 2: pose arm estimates for this frame (from poseHands), or null if pose did not run.
     * @returns {({ type: 'point', id, x, y, t, src? } | { type: 'end', id })[]}
     */
    finish(arms) {
      events = [];
      const { now, tips, ids, seen } = frame;
      for (const id of [0, 1]) hands[id].streak = seen[id] ? hands[id].streak + 1 : 0;

      // Lost this frame: send the real last fingertip so the stroke reaches where the hand was.
      for (const id of [0, 1]) {
        const h = hands[id];
        if (h.seenLastFrame && !seen[id] && h.lastRaw && h.mode === 'hand') {
          h.fx.reset();
          h.fy.reset();
          emit(id, h.lastRaw, h.handSeen + 8, 'hand');
        }
      }

      // Smooth the arm estimates, measure how fast each arm moves, link arms to hands, learn offsets.
      const armList = [];
      if (arms) {
        for (const a of arms) {
          const prev = armState[a.side];
          let { x, y } = a;
          let speed = 0;
          if (prev && now - prev.t < 250) {
            x = prev.x + o.poseSmoothing * (a.x - prev.x);
            y = prev.y + o.poseSmoothing * (a.y - prev.y);
            speed = Math.hypot(x - prev.x, y - prev.y) / ((now - prev.t) / 1000);
          }
          armState[a.side] = { x, y, t: now, speed };
          armList.push({ side: a.side, x, y, speed });
        }
        const visible = ids.map((id, i) => ({ id, x: tips[i].x, y: tips[i].y }));
        links = linkArms(visible, armList, links);
        ids.forEach((id, i) => {
          const h = hands[id];
          const arm = armList.find((a) => a.side === links[id]);
          // Learn only from steady hand tracking: during a blurred swipe the pose lags, and learning
          // that lag would point the next pose blades the wrong way when the swipe changes direction.
          if (!arm || h.mode === 'pose' || arm.speed >= o.poseMinSpeed) return;
          h.offset.x = clamp(h.offset.x * 0.8 + (tips[i].x - arm.x) * 0.2, -o.maxOffset, o.maxOffset);
          h.offset.y = clamp(h.offset.y * 0.8 + (tips[i].y - arm.y) * 0.2, -o.maxOffset, o.maxOffset);
          h.learned++;
        });
      }

      for (const id of [0, 1]) {
        const h = hands[id];
        const i = ids.indexOf(id);
        const tip = i >= 0 ? tips[i] : null;
        if (tip && (h.mode === 'hand' || h.streak >= o.switchBackFrames)) {
          useHand(id, tip, now);
          continue;
        }
        const arm = armList.find((a) => a.side === links[id]);
        const cand = arm ? { x: arm.x + h.offset.x, y: arm.y + h.offset.y } : null;
        const poseOk =
          cand &&
          h.active &&
          h.learned >= o.poseLearnFrames &&
          now - h.handSeen <= o.poseAssistMs &&
          arm.speed >= o.poseMinSpeed &&
          cand.x > -0.05 &&
          cand.x < 1.05 &&
          cand.y > -0.1 &&
          cand.y < 1.0;
        if (poseOk) {
          h.mode = 'pose';
          emit(id, { x: clamp01(cand.x), y: clamp01(cand.y) }, now, 'pose');
        } else if (tip) {
          useHand(id, tip, now); // pose cannot continue (arm slowed): the hand tracker has it, use it
        }
      }

      for (const id of [0, 1]) {
        const h = hands[id];
        h.seenLastFrame = seen[id];
        if (h.active && now - h.lastSeen > o.handLostMs) end(id);
      }
      return events;
    },

    /** End both blades (tracker stopping). */
    stop() {
      events = [];
      end(0);
      end(1);
      return events;
    },
  };
}
