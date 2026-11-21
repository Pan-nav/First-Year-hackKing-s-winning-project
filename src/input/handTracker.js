// OWNER (task O1): MediaPipe HandLandmarker, assisted by PoseLandmarker -> blade:point / blade:end
// events (docs/CONTRACT.md). The blade tip is the index fingertip. Up to two hands (ids 0 and 1).
//
// Why pose assist: the demo laptop's webcam (ASUS TUF A15, "USB2.0 HD UVC WebCam") tops out at 30 fps,
// so a fast swipe is one long motion blur and the hand tracker cannot find the hand at all. The body
// (pose) tracker keeps following the arm, because the body barely moves while the arm swipes. So
// while a hand is lost, its blade follows that arm's estimated fingertip (blade:point src 'pose').
//
// Resolves to a stop() function. Throws if the camera or the hand model is unavailable, so main.js
// falls back to the mouse. If only the pose model fails, hand tracking carries on without assist.
import { FilesetResolver, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';
import { bus } from '../bus.js';
import { CONFIG } from '../config.js';
import { assignIds, linkArms, mapToScreen, poseHands } from './handMapping.js';
import { OneEuro } from './oneEuro.js';

const INDEX_FINGERTIP = 8;
// No point (hand or pose) for this long -> blade:end. The engine can still sweep across shorter gaps.
const HAND_LOST_MS = 450;
// After the hand tracker loses a hand, follow its arm with the pose tracker for at most this long.
const POSE_ASSIST_MS = 1500;
// Smoothing tuned for fast swipes: still hands stay steady (minCutoff), the speed estimate reacts in
// ~3 frames (dCutoff) and fast motion is barely smoothed (beta), so the blade does not trail the hand.
const FILTER = { minCutoff: 1.2, beta: 10, dCutoff: 5 };

// Local copies (npm run vendor:mediapipe, plus public/mediapipe/pose_landmarker_lite.task) are
// preferred so the demo works offline; otherwise the CDN is used.
const LOCAL = `${import.meta.env.BASE_URL}mediapipe/`;
const CDN_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm';
const CDN_HAND =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const CDN_POSE =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

const clamp01 = (v) => Math.min(1, Math.max(0, v));

async function exists(url) {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    // The Vite dev server answers unknown paths with index.html, so reject HTML.
    return res.ok && !(res.headers.get('content-type') || '').includes('text/html');
  } catch {
    return false;
  }
}

async function withGpuFallback(name, create) {
  try {
    return await create('GPU');
  } catch (err) {
    console.warn(`[hands] ${name}: GPU delegate failed, using CPU`, err);
    return create('CPU');
  }
}

async function createLandmarkers() {
  const local = (await exists(`${LOCAL}hand_landmarker.task`)) && (await exists(`${LOCAL}wasm/vision_wasm_internal.wasm`));
  const localPose = local && (await exists(`${LOCAL}pose_landmarker_lite.task`));
  console.info(`[hands] loading MediaPipe from ${local ? 'local files' : 'CDN'} (pose model ${localPose ? 'local' : 'CDN'})`);
  const fileset = await FilesetResolver.forVisionTasks(local ? `${LOCAL}wasm` : CDN_WASM);

  const hand = await withGpuFallback('hand model', (delegate) =>
    HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: local ? `${LOCAL}hand_landmarker.task` : CDN_HAND, delegate },
      runningMode: 'VIDEO',
      numHands: 2,
      // Slightly below the 0.5 defaults so a blurred or half-occluded hand is dropped less often.
      minHandDetectionConfidence: 0.45,
      minHandPresenceConfidence: 0.4,
      minTrackingConfidence: 0.4,
    }),
  );

  let pose = null;
  if (CONFIG.poseAssist) {
    try {
      pose = await withGpuFallback('pose model', (delegate) =>
        PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: localPose ? `${LOCAL}pose_landmarker_lite.task` : CDN_POSE, delegate },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
          outputSegmentationMasks: false,
        }),
      );
    } catch (err) {
      console.warn('[hands] pose assist unavailable, using hand tracking only', err);
    }
  }
  return { hand, pose };
}

/** Log what the webcam can do, and apply ?exposure=<ms> (manual exposure) if the camera supports it. */
async function tuneCamera(track) {
  const caps = track.getCapabilities?.() ?? {};
  const s = track.getSettings?.() ?? {};
  console.info(
    `[hands] camera ${s.width}x${s.height} at ${s.frameRate ?? '?'} fps; can do ` +
      JSON.stringify({ frameRate: caps.frameRate, exposureMode: caps.exposureMode, exposureTime: caps.exposureTime }),
  );
  const exposureMs = Number(new URLSearchParams(location.search).get('exposure'));
  if (!(exposureMs > 0)) return;
  if (!caps.exposureTime || !caps.exposureMode?.includes('manual')) {
    console.warn('[hands] ?exposure ignored: this camera does not offer manual exposure in this browser');
    return;
  }
  // exposureTime is in units of 100 microseconds. Shorter exposure = less motion blur, darker image.
  const value = Math.min(caps.exposureTime.max, Math.max(caps.exposureTime.min, exposureMs * 10));
  try {
    await track.applyConstraints({ advanced: [{ exposureMode: 'manual', exposureTime: value }] });
    console.info(`[hands] manual exposure ${value / 10} ms`);
  } catch (err) {
    console.warn('[hands] could not set manual exposure', err);
  }
}

export async function startHandTracker({ video }) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera API not available');
  const stream = await navigator.mediaDevices.getUserMedia({
    // The ASUS webcam offers 640x480 at up to 30 fps (15 in dim light). Asking for more changes nothing.
    video: { width: 640, height: 480, facingMode: 'user', frameRate: { ideal: 30 } },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
  await tuneCamera(stream.getVideoTracks()[0]);

  let models;
  try {
    models = await createLandmarkers();
  } catch (err) {
    stream.getTracks().forEach((t) => t.stop());
    throw err;
  }
  const { hand } = models;
  let { pose } = models;

  const debug = new URLSearchParams(location.search).has('debug');
  const newFilter = () => new OneEuro(FILTER.minCutoff, FILTER.beta, FILTER.dCutoff);
  const filters = [0, 1].map(() => ({ x: newFilter(), y: newFilter() }));
  const lastSeen = [-Infinity, -Infinity]; // last point of any source
  const handSeen = [-Infinity, -Infinity]; // last time the hand tracker itself saw the hand
  const active = [false, false];
  const lastPos = [null, null]; // filtered, what the engine last got
  const lastRaw = [null, null]; // unfiltered hand-tracker fingertip
  const seenLastFrame = [false, false];
  const offset = [{ x: 0, y: 0 }, { x: 0, y: 0 }]; // fingertip minus that arm's pose estimate
  let links = { 0: null, 1: null }; // blade id -> pose side 'L' | 'R'
  let lastVideoTime = -1;
  let frames = 0;
  let poseFrames = 0;
  let fpsStart = performance.now();
  let handle = 0;
  let stopped = false;
  // One detection per real camera frame (requestAnimationFrame would run at the display's 144 Hz).
  const perFrame = typeof video.requestVideoFrameCallback === 'function';

  const emitPoint = (id, p, t, src) => {
    const x = filters[id].x.filter(p.x, t / 1000);
    const y = filters[id].y.filter(p.y, t / 1000);
    lastPos[id] = { x, y };
    lastSeen[id] = t;
    active[id] = true;
    bus.emit('blade:point', src === 'pose' ? { id, x, y, t, src } : { id, x, y, t });
  };

  const endBlade = (id) => {
    if (active[id]) bus.emit('blade:end', { id });
    active[id] = false;
    seenLastFrame[id] = false;
    links = { ...links, [id]: null };
    offset[id] = { x: 0, y: 0 };
    filters[id].x.reset();
    filters[id].y.reset();
  };

  function detect() {
    const now = performance.now();
    const result = hand.detectForVideo(video, now);
    // Mirror and map the camera's inner reach box onto the screen (handMapping.js explains why).
    const tips = result.landmarks.slice(0, 2).map((lm) => mapToScreen(lm[INDEX_FINGERTIP]));
    const ids = assignIds(tips, { active, lastPos });
    const seen = [false, false];
    const visible = [];

    // Lost since last frame: the smoothed blade lags the fingertip, so first send the last real
    // position (resetting the filter there), so the stroke reaches where the hand really was.
    const lostNow = [0, 1].filter((id) => seenLastFrame[id] && !ids.includes(id) && lastRaw[id]);
    for (const id of lostNow) {
      filters[id].x.reset();
      filters[id].y.reset();
      emitPoint(id, lastRaw[id], handSeen[id] + 8, 'hand');
    }

    tips.forEach((tip, i) => {
      const id = ids[i];
      emitPoint(id, tip, now, 'hand');
      handSeen[id] = now;
      lastRaw[id] = tip;
      seen[id] = true;
      visible.push({ id, x: tip.x, y: tip.y });
    });

    // Pose costs ~10-20 ms a frame, so run it every frame only while some hand is lost, every other
    // frame while hands are tracked (keeps it locked on and the offsets fresh), and not at all idle.
    const handLost = [0, 1].some((id) => active[id] && !seen[id]);
    const runPose = pose && (handLost || (active.some(Boolean) && frames % 2 === 0));
    if (runPose) {
      let arms = [];
      try {
        arms = poseHands(pose.detectForVideo(video, now).landmarks?.[0]);
      } catch (err) {
        console.warn('[hands] pose assist failed, turning it off', err);
        pose.close();
        pose = null;
      }
      if (arms.length) {
        links = linkArms(visible, arms, links);
        // Learn where the real fingertip sits relative to the arm's estimate while both are visible.
        for (const v of visible) {
          const arm = arms.find((a) => a.side === links[v.id]);
          if (!arm) continue;
          const o = offset[v.id];
          o.x = Math.max(-0.15, Math.min(0.15, o.x * 0.8 + (v.x - arm.x) * 0.2));
          o.y = Math.max(-0.15, Math.min(0.15, o.y * 0.8 + (v.y - arm.y) * 0.2));
        }
        // A hand the hand tracker lost (blur, hands touching) follows its arm for a while. Pose never
        // starts a blade, and ignores an arm outside the play area (e.g. hanging by the side).
        for (const id of [0, 1]) {
          if (!active[id] || seen[id] || !links[id] || now - handSeen[id] > POSE_ASSIST_MS) continue;
          const arm = arms.find((a) => a.side === links[id]);
          if (!arm?.inside) continue;
          emitPoint(id, { x: clamp01(arm.x + offset[id].x), y: clamp01(arm.y + offset[id].y) }, now, 'pose');
          poseFrames++;
        }
      }
    }

    for (const id of [0, 1]) {
      seenLastFrame[id] = seen[id];
      if (active[id] && now - lastSeen[id] > HAND_LOST_MS) endBlade(id);
    }

    frames++;
    if (debug && frames % 60 === 0) {
      const fps = Math.round(60000 / (now - fpsStart));
      console.info(`[hands] ${fps} fps (camera frames tracked), pose assist on ${poseFrames} of the last 60 frames`);
      fpsStart = now;
      poseFrames = 0;
    }
  }

  function onVideoFrame() {
    if (stopped) return;
    handle = video.requestVideoFrameCallback(onVideoFrame);
    if (video.readyState >= 2) detect();
  }

  function onAnimationFrame() {
    if (stopped) return;
    handle = requestAnimationFrame(onAnimationFrame);
    if (video.readyState < 2 || video.currentTime === lastVideoTime) return;
    lastVideoTime = video.currentTime;
    detect();
  }

  handle = perFrame ? video.requestVideoFrameCallback(onVideoFrame) : requestAnimationFrame(onAnimationFrame);

  return function stop() {
    stopped = true;
    if (perFrame) video.cancelVideoFrameCallback(handle);
    else cancelAnimationFrame(handle);
    endBlade(0);
    endBlade(1);
    hand.close();
    pose?.close();
    stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  };
}
