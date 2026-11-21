// OWNER builds this (task O1): MediaPipe HandLandmarker -> blade:point / blade:end events.
// Must resolve to a stop() function. Throwing makes main.js fall back to the mouse blade.
import { bus } from '../bus.js'; // eslint-disable-line no-unused-vars

export async function startHandTracker({ video }) { // eslint-disable-line no-unused-vars
  throw new Error('handTracker not implemented yet');
}
