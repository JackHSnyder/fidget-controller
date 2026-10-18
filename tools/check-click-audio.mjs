import { readFileSync } from 'node:fs';
import { ClickDetector } from '../src/audio/click-detector.js';

const [path, rate = '48000'] = process.argv.slice(2);
if (!path) throw new Error('Usage: node tools/check-click-audio.mjs <mono-float32.f32> <sample-rate>');
const sampleRate = Number(rate);
if (!Number.isFinite(sampleRate) || sampleRate < 24000) throw new Error('Use a sample rate of at least 24000 Hz.');
const bytes = readFileSync(path);
const samples = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const clicks = [];
const detector = new ClickDetector({ sampleRate, onClick: click => clicks.push(click) });
for (let i = 0; i < samples.length; i += 128) detector.push(samples.subarray(i, i + 128), i / sampleRate);
console.log(JSON.stringify({ seconds: samples.length / sampleRate, sampleRate, count: clicks.length,
  clicks: clicks.map(({ time, strength, bandEnergy }) => ({ time, strength, bandEnergy })) }, null, 2));
