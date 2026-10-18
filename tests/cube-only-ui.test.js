import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createMenu } from '../src/menu.js';
import { createCubeNavigation } from '../src/cube-navigation.js';
import { mountControllerPanel } from '../src/controller-panel.js';

const project = new URL('../', import.meta.url);
const nativeControls = /<(?:button|input|select|textarea|summary|a)\b|\bcontenteditable\s*=\s*["']?true|<(?:audio|video)\b[^>]*\scontrols(?:\s|=|>)/i;

test('every site page and the shared controller panel contain no mouse/keyboard controls', () => {
  for (const file of readdirSync(project).filter(file => file.endsWith('.html'))) {
    assert.doesNotMatch(readFileSync(new URL(file, project), 'utf8'), nativeControls, file);
  }
  for (const detailed of [false, true]) {
    const container = {};
    mountControllerPanel(container, { detailed });
    assert.doesNotMatch(container.innerHTML, nativeControls);
    assert.match(container.innerHTML, /id="camera"/);
    assert.match(container.innerHTML, /id="preview"/);
  }
});

test('application source registers no mouse, touch, focus, keyboard, or form-input listeners', () => {
  function inspect(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
      if (entry.isDirectory()) inspect(url);
      else if (entry.name.endsWith('.js')) {
        assert.doesNotMatch(readFileSync(url, 'utf8'), /addEventListener\(\s*['"](?:click|dblclick|mouse\w*|pointer\w*|touch\w*|key\w*|focus|input|change)['"]/, url.pathname);
      }
    }
  }
  inspect(new URL('src/', project));
});

function ui(t) {
  class Element extends EventTarget {
    constructor() { super(); this.children = []; this.attributes = {}; }
    setAttribute(name, value) { this.attributes[name] = value; }
    append(child) { this.children.push(child); }
  }
  const nodes = new Map(), navigations = [], document = new EventTarget(), window = new EventTarget();
  document.getElementById = id => {
    if (!nodes.has(id)) nodes.set(id, new Element());
    return nodes.get(id);
  };
  document.createElement = tag => Object.assign(new Element(), { tag });
  window.location = { assign: path => navigations.push(path) };
  for (const [key, value] of Object.entries({ document, window })) {
    const old = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value, configurable: true });
    t.after(() => old ? Object.defineProperty(globalThis, key, old) : delete globalThis[key]);
  }
  return { nodes, document, window, navigations };
}

test('menu display ignores mouse and keyboard, but cube selection and activation still navigate', t => {
  const env = ui(t), menu = createMenu(), grid = env.nodes.get('menu-grid');
  assert.ok(grid.children.every(child => child.tag === 'div'));
  assert.equal(env.nodes.get('menu-status').textContent, 'Selected: Play');
  grid.dispatchEvent(Object.assign(new Event('keydown'), { key: 'ArrowUp' }));
  grid.children[0].dispatchEvent(new Event('click'));
  grid.children[0].dispatchEvent(new Event('focus'));
  assert.equal(env.nodes.get('menu-status').textContent, 'Selected: Play');
  menu.moveSelection('up');
  assert.equal(grid.children[0].attributes['aria-current'], 'true');
  menu.activateSelection({ colour: 'pink' });
  assert.deepEqual(env.navigations, ['./tetris.html']);
});

test('up then press confirms cube navigation once; another turn or tab change cancels it', t => {
  const env = ui(t), status = {}, navigation = createCubeNavigation(status);
  assert.equal(navigation.handlePress(), false);
  assert.equal(navigation.handleRotation('up'), true);
  assert.equal(navigation.handlePress(), true);
  assert.deepEqual(env.navigations, ['./index.html']);
  assert.equal(navigation.handlePress(), false);
  navigation.handleRotation('up'); navigation.handleRotation('left');
  assert.equal(navigation.handlePress(), false);
  navigation.handleRotation('up'); env.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(navigation.handlePress(), false);
  assert.equal(env.navigations.length, 1);
});
