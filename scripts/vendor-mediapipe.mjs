// Run once with: npm run vendor:mediapipe
// Copies the MediaPipe wasm files and downloads the hand model into public/mediapipe so the game
// works offline (venue Wi-Fi is unreliable). public/mediapipe is git-ignored; without it the game uses the CDN.
import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = join(root, 'public', 'mediapipe');
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

mkdirSync(join(out, 'wasm'), { recursive: true });
cpSync(join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm'), join(out, 'wasm'), { recursive: true });

const res = await fetch(MODEL_URL);
if (!res.ok) throw new Error(`Model download failed: HTTP ${res.status}`);
writeFileSync(join(out, 'hand_landmarker.task'), Buffer.from(await res.arrayBuffer()));
console.log('Done: wasm and hand_landmarker.task are in public/mediapipe');
