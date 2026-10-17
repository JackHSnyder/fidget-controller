import { COLOURS } from './cube-model.js';
import { MIN_CORE_SCORE } from './vision.js';

function directionOf(vector) {
  const length = Math.hypot(...vector);
  if (!length) return 'uncertain';
  if (Math.max(...vector.map(Math.abs)) / length < .85) return 'diagonal';
  if (Math.abs(vector[0]) > Math.abs(vector[1])) return vector[0] > 0 ? 'right' : 'left';
  return vector[1] > 0 ? 'down' : 'up';
}

// Motion is measured relative to the core, in units of its width. Translation
// of the whole toy and a change in camera distance therefore cancel out.
export class ScreenTurnEvents {
  constructor() { this.reset(); }
  reset() { this.baseline = null; this.pending = null; this.departure = null; this.history = []; this.lastSeen = -Infinity; this.lastTime = -Infinity; this.lastFaceSeen = -Infinity; this.activeFace = null; this.activeSource = null; }
  update({ face = null, centres = [], core = null, observation = null } = {}, time) {
    if (time < this.lastTime || time - this.lastSeen > 800) this.reset();
    this.lastTime = time;
    // Only use raw key positions with a fresh independent white-core detection.
    const independent = core?.score > MIN_CORE_SCORE && observation;
    const needsFallback = face === null;
    const inferred = face === null && independent && Number.isInteger(observation.face) && observation.face >= 0 && observation.face < 6;
    if (inferred) face = observation.face;
    if (independent && needsFallback) centres = Array.from({ length: 6 }, (_, i) => centres[i] ?? observation.centres[i]);
    if (time - this.lastFaceSeen > 1200) {
      this.baseline = null; this.activeFace = null; this.activeSource = null;
    }
    if (core && core.width > 0) {
      this.lastSeen = time;
      const points = centres.map(p => p && [(p[0] - core.x) / core.width, (p[1] - core.y) / core.width]);
      this.history.push({ time, points });
    }
    this.history = this.history.filter(item => time - item.time < 1800);
    if (face === null) {
      // If the new front is covered, the old front can still demonstrate a
      // turn by leaving the centre. Do not invent the hidden incoming colour.
      const old = this.baseline;
      const p = independent && old && observation.centres[old.face];
      const offset = p && [(p[0] - core.x) / core.width, (p[1] - core.y) / core.width];
      const wasCentral = old && this.history.some(sample => sample.time >= old.time &&
        sample.points[old.face] && Math.hypot(...sample.points[old.face]) < .25);
      if (offset && wasCentral && Math.hypot(...offset) > .55 && Math.hypot(...offset) < 1.6) {
        const direction = directionOf(offset);
        if (this.departure?.direction !== direction) this.departure = { direction, since: time };
        if (time - this.departure.since >= 160) {
          this.baseline = null; this.pending = null; this.departure = null; this.history = [];
          this.activeFace = null; this.activeSource = null;
          return { from: COLOURS[old.face].id, to: null, direction, angle: null,
            source: 'recent colour positions', inferred: true, time };
        }
      } else this.departure = null;
      // Keep a confirmed face briefly for display, never as a new observation.
      if (time - this.lastFaceSeen > 600) { this.activeFace = null; this.activeSource = null; }
      this.pending = null; return null;
    }
    this.departure = null;
    this.lastFaceSeen = time;
    if (this.pending?.face !== face) this.pending = { face, since: time };
    if (time - this.pending.since < 160) return null;
    this.activeFace = face;
    this.activeSource = inferred ? 'recent colour positions' : 'model fit';
    if (!this.baseline) { this.baseline = { face, time }; return null; }
    if (this.baseline.face === face) return null;
    const old = this.baseline;
    const outgoing = [], incoming = [];
    for (const sample of this.history) {
      if (sample.time < old.time || time - sample.time > 1200) continue;
      const a = sample.points[old.face], b = sample.points[face];
      if (a && Math.hypot(...a) > .28 && Math.hypot(...a) < 1.7) outgoing.push(a);
      if (b && sample.time <= this.pending.since && Math.hypot(...b) > .28 && Math.hypot(...b) < 1.7) incoming.push(b.map(v => -v));
    }
    const strongest = values => values.sort((a, b) => Math.hypot(...b) - Math.hypot(...a)).slice(0, 3).reduce((sum, p, _, all) => sum.map((v, i) => v + p[i] / all.length), [0, 0]);
    const a = strongest(outgoing), b = strongest(incoming);
    let direction = 'uncertain';
    const lengthA = Math.hypot(...a), lengthB = Math.hypot(...b);
    const agree = !lengthA || !lengthB || (a[0] * b[0] + a[1] * b[1]) / lengthA / lengthB > .45;
    if (agree && (lengthA > .3 || lengthB > .3)) {
      direction = directionOf([a[0] + b[0], a[1] + b[1]]);
    }
    this.baseline = { face, time };
    return { from: COLOURS[old.face].id, to: COLOURS[face].id, direction, angle: null, source: inferred ? 'recent colour positions' : 'visible key motion', inferred: Boolean(inferred), time };
  }
}
