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

export async function startHandTracker({ video }) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera API not available');
  const stream = await navigator.mediaDevices.getUserMedia({
    // 60 fps where the webcam offers it: shorter exposure, less blur, twice the samples per swipe.
    video: { width: 640, height: 480, facingMode: 'user', frameRate: { ideal: 60 } },
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
  const filters = [0, 1].map(() => ({ x: new OneEuro(), y: new OneEuro() }));
  const lastSeen = [-Infinity, -Infinity];
  const active = [false, false];
  const lastPos = [null, null];
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
    // Mirror and map the camera's inner reach box onto the screen (handMapping.js explains why).
    const tips = result.landmarks.slice(0, 2).map((lm) => mapToScreen(lm[INDEX_FINGERTIP]));
    const ids = assignIds(tips, { active, lastPos });

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
