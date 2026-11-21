// OWNER (task O1): MediaPipe HandLandmarker -> blade:point / blade:end events (docs/CONTRACT.md).
// The blade tip is the index fingertip. Up to two hands (ids 0 and 1).
// Resolves to a stop() function. Throws if the camera or model is unavailable, so main.js falls back to the mouse.
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { bus } from '../bus.js';
import { assignIds, mapToScreen } from './handMapping.js';
import { OneEuro } from './oneEuro.js';

const INDEX_FINGERTIP = 8;
// No detection for this long -> blade:end. MediaPipe often loses the hand for most of a fast,
// motion-blurred swipe; keeping the stroke open lets the engine sweep across the gap (it checks that
// the hand was already moving that way, so a hand that reappears elsewhere does not slice).
const HAND_LOST_MS = 450;

// Local copies (npm run vendor:mediapipe) are preferred so the demo works offline; otherwise use the CDN.
const LOCAL = `${import.meta.env.BASE_URL}mediapipe/`;
const CDN_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm';
const CDN_MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

async function exists(url) {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    // The Vite dev server answers unknown paths with index.html, so reject HTML.
    return res.ok && !(res.headers.get('content-type') || '').includes('text/html');
  } catch {
    return false;
  }
}

async function createLandmarker() {
  const local = (await exists(`${LOCAL}hand_landmarker.task`)) && (await exists(`${LOCAL}wasm/vision_wasm_internal.wasm`));
  console.info(`[hands] loading MediaPipe from ${local ? 'local files' : 'CDN'}`);
  const fileset = await FilesetResolver.forVisionTasks(local ? `${LOCAL}wasm` : CDN_WASM);
  const modelAssetPath = local ? `${LOCAL}hand_landmarker.task` : CDN_MODEL;
  const options = (delegate) => ({
    baseOptions: { modelAssetPath, delegate },
    runningMode: 'VIDEO',
    numHands: 2,
    // Slightly below the 0.5 defaults so a blurred or half-occluded hand (fast swipe, crossed hands)
    // is kept a little longer instead of dropped.
    minHandDetectionConfidence: 0.45,
    minHandPresenceConfidence: 0.4,
    minTrackingConfidence: 0.4,
  });
  try {
    return await HandLandmarker.createFromOptions(fileset, options('GPU'));
  } catch (err) {
    console.warn('[hands] GPU delegate failed, using CPU', err);
    return HandLandmarker.createFromOptions(fileset, options('CPU'));
  }
}

// Smoothing tuned for fast swipes on a fast machine: still hands stay steady (minCutoff), but the
// speed estimate reacts within ~3 frames (dCutoff) and fast motion is barely smoothed (beta), so the
// blade does not trail behind the fingertip when a swipe starts.
const FILTER = { minCutoff: 1.2, beta: 10, dCutoff: 5 };

export async function startHandTracker({ video }) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera API not available');
  const stream = await navigator.mediaDevices.getUserMedia({
    // The camera's fastest mode: at 60+ fps each frame is exposed for less time (less motion blur)
    // and a swipe gets more samples. 640x480 keeps detection cheap.
    video: { width: 640, height: 480, facingMode: 'user', frameRate: { ideal: 120 } },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
  const cam = stream.getVideoTracks()[0]?.getSettings?.() ?? {};
  console.info(`[hands] camera ${cam.width}x${cam.height} at ${cam.frameRate ?? '?'} fps`);

  let landmarker;
  try {
    landmarker = await createLandmarker();
  } catch (err) {
    stream.getTracks().forEach((t) => t.stop());
    throw err;
  }

  const debug = new URLSearchParams(location.search).has('debug');
  const newFilter = () => new OneEuro(FILTER.minCutoff, FILTER.beta, FILTER.dCutoff);
  const filters = [0, 1].map(() => ({ x: newFilter(), y: newFilter() }));
  const lastSeen = [-Infinity, -Infinity];
  const active = [false, false];
  const lastPos = [null, null]; // filtered, what the engine last got
  const lastRaw = [null, null]; // unfiltered, where the fingertip really was
  const seenLastFrame = [false, false];
  let lastVideoTime = -1;
  let frames = 0;
  let fpsStart = performance.now();
  let handle = 0;
  let stopped = false;
  // One detection per real camera frame. requestAnimationFrame runs at the display rate (144 Hz on
  // a gaming laptop) and re-processed the same image, which also inflated the fps log.
  const perFrame = typeof video.requestVideoFrameCallback === 'function';

  const endBlade = (id) => {
    if (active[id]) bus.emit('blade:end', { id });
    active[id] = false;
    seenLastFrame[id] = false;
    filters[id].x.reset();
    filters[id].y.reset();
  };

  function detect() {
    const now = performance.now();
    const result = landmarker.detectForVideo(video, now);
    // Mirror and map the camera's inner reach box onto the screen (handMapping.js explains why).
    const tips = result.landmarks.slice(0, 2).map((lm) => mapToScreen(lm[INDEX_FINGERTIP]));
    const ids = assignIds(tips, { active, lastPos });
    const seen = [false, false];

    tips.forEach((tip, i) => {
      const id = ids[i];
      const x = filters[id].x.filter(tip.x, now / 1000);
      const y = filters[id].y.filter(tip.y, now / 1000);
      lastSeen[id] = now;
      lastPos[id] = { x, y };
      lastRaw[id] = tip;
      active[id] = true;
      seen[id] = true;
      bus.emit('blade:point', { id, x, y, t: now });
    });

    for (const id of [0, 1]) {
      // Lost this frame (usually motion blur mid-swipe): the smoothed blade still lags behind the
      // fingertip, so send the last real position once, so the stroke reaches where the hand was.
      if (seenLastFrame[id] && !seen[id] && lastRaw[id]) {
        const p = lastRaw[id];
        if (Math.hypot(p.x - lastPos[id].x, p.y - lastPos[id].y) > 0.01) {
          bus.emit('blade:point', { id, x: p.x, y: p.y, t: lastSeen[id] + 8 });
          lastPos[id] = { ...p };
        }
      }
      seenLastFrame[id] = seen[id];
      if (active[id] && now - lastSeen[id] > HAND_LOST_MS) endBlade(id);
    }

    if (debug && ++frames % 60 === 0) {
      console.info(`[hands] ${Math.round(60000 / (now - fpsStart))} fps (camera frames tracked)`);
      fpsStart = now;
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
    landmarker.close();
    stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  };
}
