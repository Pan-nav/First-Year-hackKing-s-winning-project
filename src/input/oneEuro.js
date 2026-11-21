// One-Euro filter: heavy smoothing when the hand is still (kills jitter), light smoothing when it moves
// fast (so swipes don't lag). Values are in normalised screen units; times are in seconds.
export class OneEuro {
  constructor(minCutoff = 1.2, beta = 6, dCutoff = 1.5) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.reset();
  }

  reset() {
    this.prev = null;
    this.dx = 0;
    this.t = 0;
  }

  static alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  filter(x, t) {
    if (this.prev === null) {
      this.prev = x;
      this.t = t;
      return x;
    }
    const dt = Math.max(t - this.t, 1e-3);
    const rawSpeed = (x - this.prev) / dt;
    this.dx += OneEuro.alpha(this.dCutoff, dt) * (rawSpeed - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.prev += OneEuro.alpha(cutoff, dt) * (x - this.prev);
    this.t = t;
    return this.prev;
  }
}
