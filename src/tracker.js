import { COLOURS, FACE_MARGIN, MIN_FACING, identity, multiply, rotation, makeModel, renderModel, frontFace, rotationBetween } from './cube-model.js';
import { distanceMaps } from './vision.js';

const clone = pose => ({ ...pose, r: [...pose.r] });
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = a => a.map(v => v / Math.hypot(...a));

export function initialOrientations() {
  const seeds = [];
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
    if (!x && !y && !z) continue;
    const forward = unit([x, y, z]);
    const right = unit(cross(Math.abs(forward[1]) > .9 ? [0, 0, 1] : [0, 1, 0], forward));
    const down = cross(forward, right);
    const r = [...right, ...down, ...forward];
    for (let roll = 0; roll < 8; roll++) seeds.push(multiply(rotation(2, roll * Math.PI / 4), r));
  }
  return seeds;
}
const SEEDS = initialOrientations();

export function makeObjective(observed, size, model, faceHint = null) {
  const distances = distanceMaps(observed, size);
  const observedCounts = new Int32Array(6);
  for (const label of observed) if (label >= 0 && label < 6) observedCounts[label]++;
  const visible = [...observedCounts].filter(n => n >= size * size * .003).length;
  function evaluate(pose) {
    const rendered = renderModel(model, pose, size);
    const counts = new Int32Array(6), intersection = new Int32Array(6), distance = new Float32Array(6);
    let white = 0, whiteMatch = 0;
    for (let i = 0; i < rendered.length; i++) {
      const c = rendered[i];
      if (c >= 0 && c < 6) {
        counts[c]++;
        if (observed[i] === c) intersection[c]++;
        distance[c] += Math.min(1, distances[c][i] / (size * .16));
      } else if (c === 6) { white++; if (observed[i] === 6) whiteMatch++; }
    }
    let cost = 0, weight = 0, overlap = 0, total = 0;
    for (let c = 0; c < 6; c++) {
      const obs = observedCounts[c], predicted = counts[c];
      if (obs + predicted < 6) continue;
      // Capped per-colour weighting prevents a large shirt or hand dominating.
      const w = Math.min(1, Math.sqrt((obs + predicted) / (size * size * .10)));
      const dice = 2 * intersection[c] / (obs + predicted);
      const chamfer = predicted ? distance[c] / predicted : 1;
      cost += w * (.65 * (1 - dice) + .35 * chamfer); weight += w;
      overlap += intersection[c]; total += predicted;
    }
    let loss = weight ? cost / weight + .07 * (white ? 1 - whiteMatch / white : 1) : 1;
    if (faceHint && frontFace(pose).index !== faceHint.colour) loss += .25;
    return { loss, overlap: total ? overlap / total : 0, visible, rendered, counts, observedCounts };
  }
  return evaluate;
}

function optimise(start, evaluate, steps) {
  let pose = clone(start), evaluation = evaluate(pose);
  for (const step of steps) {
    for (let pass = 0; pass < 2; pass++) {
      let improved = false;
      for (let parameter = 0; parameter < 7; parameter++) {
        let bestPose = pose, best = evaluation;
        for (const sign of [-1, 1]) {
          const trial = clone(pose);
          if (parameter < 3) trial.r = multiply(rotation(parameter, sign * step), pose.r);
          if (parameter === 3) trial.x += sign * step * .18;
          if (parameter === 4) trial.y += sign * step * .18;
          if (parameter === 5) trial.scale *= Math.exp(sign * step * .6);
          if (parameter === 6) trial.depth *= Math.exp(sign * step * 1.5);
          if (trial.scale < .025 || trial.scale > .7 || trial.depth < 4 || trial.depth > 80 || trial.x < .05 || trial.x > .95 || trial.y < .05 || trial.y > .95) continue;
          const score = evaluate(trial);
          if (score.loss < best.loss) { bestPose = trial; best = score; }
        }
        if (bestPose !== pose) { pose = bestPose; evaluation = best; improved = true; }
      }
      if (!improved) break;
    }
  }
  return { pose, ...evaluation };
}

export function fitPose(observed, size, { previous = null, model = makeModel(), acquire = false, principalX = .5, principalY = .5, faceHint = null, coarse = true } = {}) {
  const evaluate = makeObjective(observed, size, model, faceHint);
  if ([...observed].filter(c => c >= 0 && c < 6).length < size * size * .025) return null;
  let best = previous ? optimise(previous, evaluate, [.16, .08, .035]) : null;
  if (best && best.loss > .3) {
    const proposals = [];
    for (let axis = 0; axis < 3; axis++) for (const angle of [-Math.PI / 2, -.8, .8, Math.PI / 2]) {
      const pose = { ...previous, r: multiply(rotation(axis, angle), previous.r) };
      proposals.push({ pose, loss: evaluate(pose).loss });
    }
    proposals.sort((a, b) => a.loss - b.loss);
    if (proposals[0].loss < best.loss) {
      const fitted = optimise(proposals[0].pose, evaluate, [.2, .09, .035]);
      if (fitted.loss < best.loss) best = fitted;
    }
  }
  if (!best || coarse && (acquire || best.loss > .5 && faceHint)) {
    const candidates = SEEDS.map(r => {
      const pose = { r, x: previous?.x ?? .5, y: previous?.y ?? .5, scale: previous?.scale ?? .205, depth: previous?.depth ?? 12, principalX, principalY };
      return { pose, loss: evaluate(pose).loss };
    }).sort((a, b) => a.loss - b.loss);
    // Different basins, rather than three tiny variations of the same pose.
    const chosen = [];
    for (const candidate of candidates) {
      if (chosen.every(other => dot(candidate.pose.r, other.pose.r) < 2.5)) chosen.push(candidate);
      if (chosen.length === 3) break;
    }
    for (const candidate of chosen) {
      const fitted = optimise(candidate.pose, evaluate, [.3, .15, .07, .03]);
      if (!best || fitted.loss < best.loss) best = fitted;
    }
  }
  const face = frontFace(best.pose);
  // One coloured patch cannot establish a reliably oriented frame.
  const reliable = best.visible >= 2 && best.loss < .53 && best.overlap > .37;
  return { ...best, face, reliable, confidence: Math.max(0, Math.min(1, 1 - best.loss)) };
}

// State transitions use accepted observations only. Reacquisition starts a new
// baseline, so hidden / missing movement never becomes an invented rotation.
export class RotationEvents {
  constructor() { this.reset(); }
  reset() { this.baseline = null; this.pending = null; this.lastGood = -Infinity; this.lastTime = -Infinity; }
  update(result, time) {
    if (time < this.lastTime || time - this.lastGood > 550) { this.baseline = null; this.pending = null; }
    this.lastTime = time;
    // An edge-on transition is still tracked geometry. Only actual pose loss
    // breaks the history; a slow turn through equal face angles must not.
    if (result?.reliable) this.lastGood = time;
    if (!result?.reliable || result.face.margin < FACE_MARGIN || result.face.facing < MIN_FACING) { this.pending = null; return null; }
    const face = result.face.index;
    if (this.pending?.face !== face) this.pending = { face, since: time };
    if (time - this.pending.since < 160) return null;
    if (!this.baseline) { this.baseline = { face, pose: clone(result.pose), time }; return null; }
    const old = this.baseline;
    const turn = rotationBetween(old.pose.r, result.pose.r);
    const sameFaceRoll = old.face === face && ['clockwise', 'anticlockwise'].includes(turn.direction) && turn.angle > 65;
    if (old.face === face && !sameFaceRoll) return null;
    this.baseline = { face, pose: clone(result.pose), time };
    if (turn.angle < 30 || turn.angle > 145) return { from: COLOURS[old.face].id, to: COLOURS[face].id, direction: 'uncertain', angle: turn.angle, time };
    return { from: COLOURS[old.face].id, to: COLOURS[face].id, ...turn, time };
  }
}

export const defaultPose = () => ({ r: identity(), x: .5, y: .5, scale: .205, depth: 12 });
