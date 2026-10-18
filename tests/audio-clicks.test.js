import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { ClickDetector } from '../src/audio/click-detector.js';
import { FaceClicks } from '../src/audio/face-clicks.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/click-audio-features.json', import.meta.url)));
const frames = JSON.parse(inflateSync(Buffer.from(fixture.frames, 'base64')));

test('reference clip keeps the prominent attacks and suppresses quieter returns across input gains', () => {
  for (const gain of [.25, 1, 2]) {
    const clicks = [], detector = new ClickDetector({ onClick: click => clicks.push(click) });
    for (const [time, rms, peakFrequency, bands] of frames) detector.acceptFrame({ time, rms: rms * gain, peakFrequency, bands });
    for (const time of fixture.prominentAttacks) assert.ok(clicks.some(click => Math.abs(click.time - time) < .025), `missed ${time}, gain ${gain}`);
    for (const time of fixture.quieterReturns) assert.ok(!clicks.some(click => Math.abs(click.time - time) < .035), `return at ${time}, gain ${gain}`);
    assert.equal(clicks.length, 38, '36 prominent attacks and two weaker matching transients');
  }
});

function analyseSynthetic(sampleRate, sound) {
  const clicks = [], detector = new ClickDetector({ sampleRate, onClick: click => clicks.push(click) });
  const pcm = Float32Array.from({ length: sampleRate }, (_, i) => sound(i / sampleRate));
  for (let i = 0; i < pcm.length; i += 128) detector.push(pcm.subarray(i, i + 128), i / sampleRate);
  return clicks;
}

function attack(t, start, frequency, volume = .25) {
  const dt = t - start;
  return dt < 0 ? 0 : volume * Math.sin(2 * Math.PI * frequency * dt) * Math.exp(-dt / .008);
}

test('raw audio detects separate key attacks at 44.1, 48, and 96 kHz without counting a quiet return', () => {
  for (const rate of [44100, 48000, 96000]) {
    const clicks = analyseSynthetic(rate, t => .0003 * Math.sin(2 * Math.PI * 120 * t) +
      attack(t, .3, 7600) + attack(t, .51, 7600, .04) + attack(t, .65, 8000));
    assert.equal(clicks.length, 2, `${rate} Hz`);
    assert.ok(Math.abs(clicks[0].time - .3) < .025);
    assert.ok(Math.abs(clicks[1].time - .65) < .025);
  }
});

test('silence, low thumps, speech-range attacks, broadband snaps, and sustained high tones do not qualify', () => {
  let seed = 42;
  const noise = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 2 ** 31 - 1; };
  for (const sound of [
    () => 0,
    t => attack(t, .3, 140),
    t => attack(t, .3, 1800),
    t => t < .3 ? 0 : noise() * .3 * Math.exp(-(t - .3) / .008),
    t => t >= .3 && t < .6 ? .2 * Math.sin(2 * Math.PI * 7600 * t) : 0,
  ]) assert.equal(analyseSynthetic(48000, sound).length, 0);
});

test('audio frame and click times do not depend on the sizes of incoming audio blocks', () => {
  const rate = 48000;
  const pcm = Float32Array.from({ length: rate }, (_, i) => attack(i / rate, .3, 7600));
  const results = [128, 371, 4096].map(size => {
    const clicks = [], detector = new ClickDetector({ sampleRate: rate, onClick: click => clicks.push(click) });
    for (let i = 0; i < pcm.length; i += size) detector.push(pcm.subarray(i, i + size), i / rate);
    return clicks;
  });
  assert.equal(results[0].length, 1);
  for (const clicks of results) assert.ok(Math.abs(clicks[0].time - results[0][0].time) < 1e-6);
});

test('a click uses the colour at capture time, including video results that arrive out of order', () => {
  const faces = new FaceClicks();
  faces.update({ colour: 'purple', time: 1200, confidence: .8, source: 'model fit' });
  faces.update({ colour: 'green', time: 1000, confidence: .9, source: 'model fit' });
  const press = faces.match({ time: 1100, source: 'audio' });
  assert.equal(press.colour, 'green');
  assert.equal(press.faceConfidence, .9);
  assert.equal(faces.match({ time: 1250 }).colour, 'purple');
  assert.equal(faces.match({ time: 900 }), null, 'never take a future face');
});

test('brief finger occlusion can retain a recent colour, while held and stale faces expire', () => {
  const faces = new FaceClicks();
  faces.update({ colour: 'orange', time: 1000, source: 'recent colour positions' });
  faces.update({ colour: 'orange', time: 1250, source: 'last confirmed face' });
  assert.equal(faces.match({ time: 1300 }).colour, 'orange');
  faces.update({ colour: 'orange', time: 1500, source: 'last confirmed face' });
  assert.equal(faces.match({ time: 1550 }), null);
});

test('uncertainty, lost tracking, and a source reset cannot turn a sound into a wrong-colour press', () => {
  const faces = new FaceClicks();
  faces.update({ colour: 'light-blue', time: 1000, source: 'model fit' });
  faces.update({ colour: null, time: 1100, source: 'unavailable' });
  assert.equal(faces.match({ time: 1150 }), null);
  faces.update({ colour: 'dark-blue', time: 1200, source: 'model fit' });
  faces.reset();
  assert.equal(faces.match({ time: 1250 }), null);
});
