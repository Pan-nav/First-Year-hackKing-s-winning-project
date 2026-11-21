// OWNER (task O1): MediaPipe HandLandmarker -> blade:point / blade:end events (docs/CONTRACT.md).
// The blade tip is the index fingertip. Up to two hands (ids 0 and 1).
// Resolves to a stop() function. Throws if the camera or model is unavailable, so main.js falls back to the mouse.
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { bus } from '../bus.js';
import { OneEuro } from './oneEuro.js';

const INDEX_FINGERTIP = 8;
const HAND_LOST_MS = 120; // no detection for this long -> blade:end

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
    const usedIds = new Set();

    result.landmarks.forEach((landmarks, i) => {
      // Handedness only keeps ids stable between frames. If both hands get the same label, use the free id.
      let id = result.handedness?.[i]?.[0]?.categoryName === 'Left' ? 0 : 1;
      if (usedIds.has(id)) id = 1 - id;
      if (usedIds.has(id)) return;
      usedIds.add(id);

      const tip = landmarks[INDEX_FINGERTIP];
      const x = filters[id].x.filter(1 - tip.x, now / 1000); // mirror so moving right goes right
      const y = filters[id].y.filter(tip.y, now / 1000);
      lastSeen[id] = now;
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
