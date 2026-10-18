// The reference recording has short attacks with most energy around 6.5–10 kHz.
// Keep this processor independent of browser APIs so recordings can use it too.
export const BAND_EDGES = [0, 250, 500, 1000, 1600, 2500, 3500, 4500, 5500, 6500, 7500, 8500, 10000, 12000];

function clickSpectrum(frame) {
  const high = frame.bands.slice(6).reduce((a, b) => a + b, 0);
  const low = frame.bands.slice(0, 5).reduce((a, b) => a + b, 0);
  const clickBand = frame.bands.slice(9, 12).reduce((a, b) => a + b, 0);
  return high > .72 && low < .12 && clickBand > .48 &&
    frame.peakFrequency >= 6200 && frame.peakFrequency <= 10500;
}

export function describeFrame(samples, sampleRate) {
  const n = samples.length, real = new Float64Array(n), imaginary = new Float64Array(n);
  let energy = 0, peak = 0;
  for (let i = 0; i < n; i++) {
    energy += samples[i] ** 2;
    peak = Math.max(peak, Math.abs(samples[i]));
    real[i] = samples[i] * (.5 - .5 * Math.cos(2 * Math.PI * i / (n - 1)));
  }
  // In-place radix-2 FFT, using the actual capture rate for frequency bins.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) [real[i], real[j]] = [real[j], real[i]];
  }
  for (let size = 2; size <= n; size *= 2) {
    const angle = -2 * Math.PI / size;
    for (let start = 0; start < n; start += size) {
      for (let j = 0; j < size / 2; j++) {
        const c = Math.cos(angle * j), s = Math.sin(angle * j), a = start + j, b = a + size / 2;
        const r = real[b] * c - imaginary[b] * s, v = real[b] * s + imaginary[b] * c;
        real[b] = real[a] - r; imaginary[b] = imaginary[a] - v;
        real[a] += r; imaginary[a] += v;
      }
    }
  }
  const bands = Array(BAND_EDGES.length - 1).fill(0);
  let total = 0, strongest = 0, peakFrequency = 0;
  for (let i = 1; i <= n / 2; i++) {
    const frequency = i * sampleRate / n, power = real[i] ** 2 + imaginary[i] ** 2;
    if (frequency >= 12000) continue;
    total += power;
    if (power > strongest) { strongest = power; peakFrequency = frequency; }
    const band = BAND_EDGES.findIndex((edge, j) => frequency >= edge && frequency < BAND_EDGES[j + 1]);
    if (band >= 0) bands[band] += power;
  }
  return { rms: Math.sqrt(energy / n), peak, peakFrequency, bands: bands.map(value => value / (total || 1)) };
}

export class ClickDetector {
  constructor({ sampleRate = 48000, sensitivity = 1, onClick = () => {}, onFrame = () => {} } = {}) {
    this.sampleRate = sampleRate;
    this.sensitivity = sensitivity;
    this.onClick = onClick;
    this.onFrame = onFrame;
    this.size = 2 ** Math.round(Math.log2(sampleRate * .021333));
    this.hop = Math.round(sampleRate * .005);
    this.buffer = new Float32Array(this.size);
    this.window = new Float32Array(this.size);
    this.reset();
  }

  reset() {
    this.buffer.fill(0); this.position = 0; this.count = 0; this.sinceFrame = 0;
    this.history = []; this.pending = null; this.lastClick = null;
  }

  push(samples, startTime = this.count / this.sampleRate) {
    for (let i = 0; i < samples.length; i++) {
      this.buffer[this.position] = samples[i];
      this.position = (this.position + 1) % this.size;
      this.count++; this.sinceFrame++;
      if (this.count < this.size || this.sinceFrame < this.hop) continue;
      this.sinceFrame = 0;
      for (let j = 0; j < this.size; j++) this.window[j] = this.buffer[(this.position + j) % this.size];
      const frame = describeFrame(this.window, this.sampleRate);
      frame.time = startTime + (i + 1 - this.size / 2) / this.sampleRate;
      this.acceptFrame(frame);
    }
  }

  acceptFrame(frame) {
    const sorted = this.history.map(item => item.rms).sort((a, b) => a - b);
    const noise = Math.max(.00015, sorted[Math.floor(sorted.length / 2)] || .00015);
    const threshold = Math.max(.0015, noise * 3.2) / this.sensitivity;
    this.onFrame(frame);
    if (!this.pending && sorted.length >= 12 && frame.rms > threshold &&
        frame.time - (this.lastClick?.time ?? -Infinity) >= .18) {
      this.pending = { start: frame.time, peak: frame, matching: null, noise, tail: [] };
    }
    if (this.pending) {
      if (frame.rms > this.pending.peak.rms) this.pending.peak = frame;
      if (frame.time - this.pending.start < .035 && clickSpectrum(frame) &&
          frame.rms > (this.pending.matching?.rms ?? 0)) this.pending.matching = frame;
      this.pending.tail.push(frame.rms);
      if (this.pending.tail.length > 3) this.pending.tail.shift();
      if (frame.time - this.pending.start >= .085) {
        const { matching: peak, noise: baseline, tail } = this.pending;
        const decay = Math.min(...tail) / Math.max(this.pending.peak.rms, .000001);
        // A sustained whistle, speech, a low thump, or broad hiss is insufficient.
        const matches = peak && peak.rms > threshold && decay < .42;
        // Suppress the quieter return/release following a stronger key attack.
        const release = peak && this.lastClick && peak.time - this.lastClick.time < .36 && peak.rms < this.lastClick.rms * .45;
        if (matches && !release) {
          this.lastClick = peak;
          this.onClick({ time: peak.time, rms: peak.rms, strength: peak.rms / baseline,
            bandEnergy: peak.bands.slice(9, 12).reduce((a, b) => a + b, 0), source: 'audio' });
        }
        this.pending = null;
      }
    }
    this.history.push(frame);
    if (this.history.length > 60) this.history.shift();
  }
}
