import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeLoopingMusic } from '../src/audio/looping-music.js';

function setup(t, playImpl = null) {
  const document = new EventTarget(), window = new EventTarget();
  document.hidden = false;
  for (const [key, value] of Object.entries({ document, window })) {
    const old = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value, configurable: true });
    t.after(() => old ? Object.defineProperty(globalThis, key, old) : delete globalThis[key]);
  }
  const audio = new EventTarget(), status = {};
  audio.paused = true; audio.plays = 0;
  audio.play = async () => {
    audio.plays++;
    if (playImpl) await playImpl();
    audio.paused = false;
    audio.dispatchEvent(new Event('playing'));
  };
  audio.pause = () => { audio.paused = true; };
  audio.load = () => {};
  initializeLoopingMusic({ audio, status, src: '/audio/tetris.mp3' });
  return { audio, status, document, window };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('music loops, pauses off-page, resumes if previously playing, and respects a manual pause', async t => {
  const env = setup(t); await settle();
  assert.equal(env.audio.loop, true);
  assert.equal(env.audio.volume, .2);
  assert.equal(env.audio.src, '/audio/tetris.mp3');
  env.document.hidden = true; env.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(env.audio.paused, true);
  env.document.hidden = false; env.document.dispatchEvent(new Event('visibilitychange')); await settle();
  assert.equal(env.audio.plays, 2);
  env.audio.pause();
  env.document.hidden = true; env.document.dispatchEvent(new Event('visibilitychange'));
  env.document.hidden = false; env.document.dispatchEvent(new Event('visibilitychange')); await settle();
  assert.equal(env.audio.plays, 2);
  env.window.dispatchEvent(new Event('pagehide'));
  assert.equal(env.audio.paused, true);
});

test('blocked autoplay is reported without exposing native playback controls', async t => {
  const env = setup(t, async () => { throw Object.assign(new Error('Gesture required'), { name: 'NotAllowedError' }); });
  await settle();
  assert.match(env.status.textContent, /autoplay/);
  assert.equal(env.audio.controls, false);
  assert.equal(env.audio.paused, true);
});

test('missing music reports unavailable instead of offering a file picker', async t => {
  const env = setup(t, async () => { throw new Error('Missing MP3'); }); await settle();
  assert.match(env.status.textContent, /unavailable/);
  assert.equal(env.audio.controls, false);
});

test('a pending play request cannot keep music playing after pagehide', async t => {
  let resolve;
  const env = setup(t, () => new Promise(done => { resolve = done; }));
  env.window.dispatchEvent(new Event('pagehide'));
  resolve(); await settle();
  assert.equal(env.audio.paused, true);
});
