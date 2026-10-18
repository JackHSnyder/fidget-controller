import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { initializeTracking } from '../src/tracking/controller.js';

// Node does not understand Vite's asset imports. Stub only the worklet URL;
// exercise the actual controller, lifecycle, and permission handling below.
const hook = registerHooks({ resolve(specifier, context, next) {
  if (specifier.endsWith('?worker&url')) return { url: 'data:text/javascript,export default "test-worklet.js"', shortCircuit: true };
  return next(specifier, context);
} });
const { initializeAudioClicks } = await import('../src/audio/controller.js');
hook.deregister();

function browser(t, { blockedAudio = false, getUserMedia = null } = {}) {
  class Element extends EventTarget {
    constructor() {
      super(); this.children = []; this.dataset = {}; this.style = { setProperty() {} };
      this.classList = { toggle() {} }; this.value = ''; this.hidden = false;
      this.videoWidth = 1280; this.videoHeight = 720; this.readyState = 2; this.currentTime = 0;
    }
    setAttribute() {}
    removeAttribute() {}
    append(child) { this.children.push(child); }
    replaceChildren(...children) { this.children = children; }
    pause() {}
    load() {}
    async play() {}
    click() { this.dispatchEvent(new Event('click')); }
    getContext() {
      return new Proxy({ getImageData: (x, y, width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }) },
        { get: (target, name) => target[name] ?? (() => {}) });
    }
  }
  const elements = new Map(), document = new EventTarget(), window = new EventTarget();
  document.hidden = false;
  document.getElementById = id => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  document.createElement = () => new Element();
  document.getElementById('profile').value = 'auto';
  document.getElementById('geometry').value = '.85';
  const workers = [], frames = [], requests = [], streams = [], contexts = [];
  const makeStream = () => {
    const track = { stopped: false, stop() { this.stopped = true; }, addEventListener() {} };
    const stream = { getTracks: () => [track], getVideoTracks: () => [track], getAudioTracks: () => [track], track };
    streams.push(stream); return stream;
  };
  class Worker {
    constructor() { this.messages = []; workers.push(this); }
    postMessage(message) { this.messages.push(message); }
    terminate() { this.terminated = true; }
  }
  class AudioContext {
    constructor() {
      this.state = 'suspended'; this.allowed = !blockedAudio; this.waiting = [];
      this.audioWorklet = { addModule: async () => {} }; contexts.push(this);
    }
    resume() {
      if (!this.allowed) return new Promise(resolve => this.waiting.push(resolve));
      this.state = 'running'; this.waiting.splice(0).forEach(resolve => resolve());
      return Promise.resolve();
    }
    close() { this.state = 'closed'; return Promise.resolve(); }
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
  }
  class AudioWorkletNode {
    constructor() { this.port = { postMessage() {}, onmessage: null }; }
    connect() {}
    disconnect() {}
  }
  window.AudioContext = AudioContext;
  const globals = { window, document, Worker, AudioContext, AudioWorkletNode,
    navigator: { mediaDevices: { getUserMedia: async constraints => {
      requests.push(constraints);
      return getUserMedia ? getUserMedia(constraints, makeStream) : makeStream();
    } } }, localStorage: { getItem: () => null }, requestAnimationFrame: callback => frames.push(callback) };
  for (const [key, value] of Object.entries(globals)) {
    const old = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    t.after(() => old ? Object.defineProperty(globalThis, key, old) : delete globalThis[key]);
  }
  return { document, window, elements, workers, frames, requests, streams, contexts, makeStream };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('camera starts without a click, searches the whole frame without selection, and resumes fitting after finding the toy', async t => {
  const env = browser(t), sources = [];
  const tracking = initializeTracking({ autoStart: true, onSourceChange: value => sources.push(value) });
  await settle();
  assert.equal(env.requests.length, 1);
  assert.ok(sources.includes('camera'));
  env.frames.shift()(performance.now() + 200);
  assert.equal(env.workers[0].messages.length, 0, 'do not fit the default box before acquisition');
  const search = env.workers[1].messages[0];
  assert.equal(search.type, 'search');
  assert.equal(search.expectedWidth, null, 'no manually selected toy size is required');
  env.workers[1].onmessage({ data: { id: search.id, found: null } });
  env.document.getElementById('camera').currentTime += .1;
  env.frames.shift()(performance.now() + 800);
  assert.equal(env.workers[1].messages.length, 2, 'continue looking when no toy is present');
  const next = env.workers[1].messages[1];
  env.workers[1].onmessage({ data: { id: next.id, found: { x: .8, y: .5, width: .06, whiteValue: .4 } } });
  env.document.getElementById('camera').currentTime += .1;
  env.frames.shift()(performance.now() + 1000);
  assert.equal(env.workers[0].messages.length, 1, 'fit the newly acquired region');
  tracking.stop();
  assert.ok(env.streams[0].track.stopped);
  // A late search result must not restart a manually stopped camera.
  env.workers[1].onmessage({ data: { id: next.id, found: { x: .8, y: .5, width: .06 } } });
  assert.equal(env.document.getElementById('preview').hidden, true);
});

test('stopping while camera permission is pending releases a late stream', async t => {
  let resolve;
  const env = browser(t, { getUserMedia: () => new Promise(done => { resolve = done; }) });
  const tracking = initializeTracking({ autoStart: true });
  tracking.stop();
  const stream = env.makeStream(); resolve(stream);
  await settle();
  assert.equal(stream.track.stopped, true);
  assert.equal(env.document.getElementById('preview').hidden, true);
});

test('denied camera permission can be retried through the lifecycle API without a page control', async t => {
  let denied = true;
  const env = browser(t, { getUserMedia: async (constraints, makeStream) => {
    if (denied) throw new Error('Permission denied');
    return makeStream();
  } });
  const tracking = initializeTracking({ autoStart: true });
  await settle();
  assert.match(env.document.getElementById('status').textContent, /Permission denied/);
  denied = false;
  await tracking.start();
  assert.equal(env.requests.length, 2);
  assert.equal(env.document.getElementById('preview').hidden, false);
  tracking.stop();
});

test('automatic microphone startup requests permission even when browser autoplay blocks audio', async t => {
  const env = browser(t, { blockedAudio: true });
  const audio = initializeAudioClicks({ autoStart: true });
  audio.setCameraActive(true);
  await settle();
  assert.equal(env.requests.length, 1);
  assert.equal(env.requests[0].audio.channelCount.ideal, 1);
  assert.match(env.document.getElementById('click-status').textContent, /autoplay/);
  env.contexts[0].allowed = true; await audio.start();
  await settle();
  assert.match(env.document.getElementById('click-status').textContent, /Listening/);
  assert.equal(env.requests.length, 1, 'resume the existing session rather than request a second microphone');
  audio.setCameraActive(false);
  assert.equal(env.streams[0].track.stopped, true);
  assert.equal(env.contexts[0].state, 'closed');
});

test('programmatic microphone stop persists across visibility changes; an enabled microphone resumes after a temporary pause', async t => {
  const env = browser(t), audio = initializeAudioClicks({ autoStart: true });
  audio.setCameraActive(true); await settle();
  env.document.hidden = true; env.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(env.streams[0].track.stopped, true);
  env.document.hidden = false; env.document.dispatchEvent(new Event('visibilitychange'));
  await settle();
  assert.equal(env.requests.length, 2);
  audio.stop();
  env.document.hidden = true; env.document.dispatchEvent(new Event('visibilitychange'));
  env.document.hidden = false; env.document.dispatchEvent(new Event('visibilitychange'));
  await settle();
  assert.equal(env.requests.length, 2);
  audio.setCameraActive(false);
});

test('denied microphone permission does not repeatedly prompt on tab focus', async t => {
  const env = browser(t, { getUserMedia: async () => { throw new Error('Permission denied'); } });
  const audio = initializeAudioClicks({ autoStart: true });
  audio.setCameraActive(true); await settle();
  assert.match(env.document.getElementById('click-status').textContent, /Permission denied/);
  env.document.dispatchEvent(new Event('visibilitychange')); await settle();
  assert.equal(env.requests.length, 1);
  await audio.start();
  assert.equal(env.requests.length, 2, 'the lifecycle API can retry');
});

test('audio device initialization errors show the fallback instead of rejecting automatic startup', async t => {
  const env = browser(t);
  globalThis.AudioContext = class { constructor() { throw new Error('Audio unavailable'); } };
  const audio = initializeAudioClicks({ autoStart: true });
  audio.setCameraActive(true); await settle();
  assert.match(env.document.getElementById('click-status').textContent, /Audio unavailable/);
});
