// OWNER (task O1): MediaPipe HandLandmarker -> blade:point / blade:end events (docs/CONTRACT.md).
// The blade tip is the index fingertip. Up to two hands (ids 0 and 1).
// Resolves to a stop() function. Throws if the camera or model is unavailable, so main.js falls back to the mouse.
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { bus } from '../bus.js';
import { OneEuro } from './oneEuro.js';

const INDEX_FINGERTIP = 8;
const HAND_LOST_MS = 120; // no detection for this long -> blade:end
const NEW_HAND_COST = 0.3; // normalised distance beyond which a detection is not the hand we were tracking

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
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  try {
    return await HandLandmarker.createFromOptions(fileset, options('GPU'));
  } catch (err) {
    console.warn('[hands] GPU delegate failed, using CPU', err);
    return HandLandmarker.createFromOptions(fileset, options('CPU'));
  }
}

export async function startHandTracker({ video }) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera API not available');
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480, facingMode: 'user' },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();

  let landmarker;
  try {
    landmarker = await createLandmarker();
  } catch (err) {
    stream.getTracks().forEach((t) => t.stop());
    throw err;
  }

  const debug = new URLSearchParams(location.search).has('debug');
  const filters = [0, 1].map(() => ({ x: new OneEuro(), y: new OneEuro() }));
  const lastSeen = [-Infinity, -Infinity];
  const active = [false, false];
  const lastPos = [null, null];

  // Keep each blade id glued to the same physical hand by nearest position. MediaPipe's
  // Left/Right label flips often, and an id jumping between hands looks like a full-screen swipe.
  // A tracked hand further than NEW_HAND_COST away is treated as a different hand (new stroke).
  const cost = (tip, id) =>
    active[id] && lastPos[id] ? Math.hypot(tip.x - lastPos[id].x, tip.y - lastPos[id].y) : NEW_HAND_COST;
  function assignIds(tips) {
    if (tips.length === 0) return [];
    if (tips.length === 1) return cost(tips[0], 0) <= cost(tips[0], 1) ? [0] : [1];
    const straight = cost(tips[0], 0) + cost(tips[1], 1);
    const swapped = cost(tips[0], 1) + cost(tips[1], 0);
    return straight <= swapped ? [0, 1] : [1, 0];
  }
  let lastVideoTime = -1;
  let frames = 0;
  let fpsStart = performance.now();
  let raf = 0;
  let stopped = false;

  const endBlade = (id) => {
    if (active[id]) bus.emit('blade:end', { id });
    active[id] = false;
    filters[id].x.reset();
    filters[id].y.reset();
  };

  function loop() {
    if (stopped) return;
    raf = requestAnimationFrame(loop);
    if (video.readyState < 2 || video.currentTime === lastVideoTime) return;
    lastVideoTime = video.currentTime;

    const now = performance.now();
    const result = landmarker.detectForVideo(video, now);
    // mirror so moving right goes right
    const tips = result.landmarks.slice(0, 2).map((lm) => ({ x: 1 - lm[INDEX_FINGERTIP].x, y: lm[INDEX_FINGERTIP].y }));
    const ids = assignIds(tips);

    tips.forEach((tip, i) => {
      const id = ids[i];
      const x = filters[id].x.filter(tip.x, now / 1000);
      const y = filters[id].y.filter(tip.y, now / 1000);
      lastSeen[id] = now;
      lastPos[id] = { x, y };
      active[id] = true;
      bus.emit('blade:point', { id, x, y, t: now });
    });

    for (const id of [0, 1]) if (active[id] && now - lastSeen[id] > HAND_LOST_MS) endBlade(id);

    if (debug && ++frames % 60 === 0) {
      console.info(`[hands] ${Math.round(60000 / (now - fpsStart))} fps`);
      fpsStart = now;
    }
  }
  raf = requestAnimationFrame(loop);

  return function stop() {
    stopped = true;
    cancelAnimationFrame(raf);
    endBlade(0);
    endBlade(1);
    landmarker.close();
    stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  };
}
