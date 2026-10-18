import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

test('Tetris page cube events move, lower, and drop the rendered piece without navigating or replaying hidden inputs', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  t.mock.method(Math, 'random', () => 0); // Deterministic Square pieces.
  const nodes = new Map(), navigations = [];
  const document = new EventTarget(), window = new EventTarget();
  document.hidden = false;
  class Element {
    constructor() { this.ownerDocument = document; this.children = []; this.className = ''; }
    setAttribute() {}
    replaceChildren(...children) { this.children = children; }
  }
  document.createElement = () => new Element();
  document.getElementById = id => {
    if (!nodes.has(id)) nodes.set(id, new Element());
    return nodes.get(id);
  };
  window.location = { assign: path => navigations.push(path) };
  for (const [key, value] of Object.entries({ document, window })) {
    const old = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value, configurable: true });
    t.after(() => old ? Object.defineProperty(globalThis, key, old) : delete globalThis[key]);
  }

  // Use the actual page, renderer, timer, queue, and game rules. Substitute
  // Vite-only imports and physical devices, not the game/event integration.
  const pageUrl = new URL('../src/tetris-page.js', import.meta.url).href;
  const hook = registerHooks({
    resolve(specifier, context, next) {
      let source;
      if (specifier.endsWith('.css')) source = 'export {};';
      if (specifier === './fidget-controller.js') source = 'export function initializeFidgetController() {}';
      if (specifier === './audio/looping-music.js') source = 'export function initializeLoopingMusic() {}';
      if (source) return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
      return next(specifier, context);
    },
    load(url, context, next) {
      const result = next(url, context);
      if (url === pageUrl) return { ...result, source: String(result.source).replaceAll('import.meta.env.BASE_URL', "'/'") };
      return result;
    },
  });
  t.after(() => hook.deregister());
  await import(pageUrl);

  const emit = (type, detail) => window.dispatchEvent(new CustomEvent(type, { detail }));
  const step = () => t.mock.timers.tick(50);
  const positions = state => nodes.get('tetris-board').children.flatMap((cell, i) =>
    cell.className.endsWith(`--${state}`) ? [[i % 10, Math.floor(i / 10)]] : []);

  emit('fidgetrotation', { direction: 'left' }); step();
  assert.deepEqual(positions('placing'), [[2, 0], [3, 0], [2, 1], [3, 1]]);
  emit('fidgetrotation', { direction: 'right' }); step();
  assert.deepEqual(positions('placing'), [[3, 0], [4, 0], [3, 1], [4, 1]]);
  emit('fidgetrotation', { direction: 'down' }); step();
  assert.deepEqual(positions('placing'), [[3, 1], [4, 1], [3, 2], [4, 2]]);

  // Up no longer arms a return gesture; the next press must hard drop.
  for (const direction of ['up', 'uncertain', 'diagonal', 'clockwise']) emit('fidgetrotation', { direction });
  emit('fidgetpress', { colour: 'pink' }); step();
  assert.deepEqual(positions('full'), [[3, 18], [4, 18], [3, 19], [4, 19]]);
  assert.deepEqual(navigations, []);

  document.hidden = true; document.dispatchEvent(new Event('visibilitychange'));
  emit('fidgetrotation', { direction: 'left' });
  emit('fidgetpress', { colour: 'green' });
  t.mock.timers.tick(500);
  assert.equal(nodes.get('tetris-tick').textContent, '4');
  document.hidden = false; document.dispatchEvent(new Event('visibilitychange')); step();
  assert.deepEqual(positions('placing'), [[3, 1], [4, 1], [3, 2], [4, 2]]);
  assert.equal(positions('full').length, 4);

  for (let i = 0; i < 20; i++) { emit('fidgetrotation', { direction: 'left' }); step(); }
  assert.equal(Math.min(...positions('placing').map(([x]) => x)), 0);
  for (let i = 0; i < 20; i++) { emit('fidgetrotation', { direction: 'right' }); step(); }
  assert.equal(Math.max(...positions('placing').map(([x]) => x)), 9);
  assert.deepEqual(navigations, []);
  window.dispatchEvent(new Event('pagehide'));
});
