// Both capture times use performance.now() milliseconds, regardless of when
// the audio worklet or video worker finishes processing a frame.
export class FaceClicks {
  constructor() { this.reset(); }

  reset() { this.faces = []; }

  update(face) {
    if (!Number.isFinite(face.time)) return;
    // A brief finger occlusion can keep the recent colour, but a held display
    // value must never extend the lifetime of the actual visual observation.
    if (face.source === 'last confirmed face') return;
    this.faces.push({ ...face });
    this.faces.sort((a, b) => a.time - b.time);
    const latest = this.faces.at(-1).time;
    this.faces = this.faces.filter(item => latest - item.time < 2500);
  }

  match(click) {
    const face = this.faces.findLast(item => item.time <= click.time);
    if (!face?.colour || click.time - face.time > 400) return null;
    return { ...click, colour: face.colour, faceConfidence: face.confidence,
      faceSource: face.source, timestamp: new Date().toISOString() };
  }
}
