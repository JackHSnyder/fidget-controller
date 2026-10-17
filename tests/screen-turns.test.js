import test from 'node:test';
import assert from 'node:assert/strict';
import { ScreenTurnEvents } from '../src/screen-turns.js';
import { COLOURS } from '../src/cube-model.js';
import { classifyPixel, locateCore, trackedKeyCentres } from '../src/vision.js';
import { RECORDING_PROFILE } from '../src/colour-profiles.js';

function sample(face, oldOffset, incomingOffset, centre = [.5, .5], scale = .3) {
  const centres = Array(6).fill(null), core = { x: centre[0], y: centre[1], width: scale };
  centres[3] = [centre[0] + oldOffset[0] * scale, centre[1] + oldOffset[1] * scale];
  centres[2] = [centre[0] + incomingOffset[0] * scale, centre[1] + incomingOffset[1] * scale];
  return { face, centres, core };
}

test('screen movement distinguishes four directions for the same pair of colours', () => {
  for (const [vector, direction] of [[[1, 0], 'right'], [[-1, 0], 'left'], [[0, 1], 'down'], [[0, -1], 'up']]) {
    const events = new ScreenTurnEvents(), opposite = vector.map(v => -v);
    events.update(sample(3, [0, 0], opposite), 0);
    events.update(sample(3, [0, 0], opposite), 200);
    events.update(sample(null, vector.map(v => v * .5), opposite.map(v => v * .5)), 400);
    events.update(sample(2, vector, [0, 0]), 600);
    const event = events.update(sample(2, vector, [0, 0]), 800);
    assert.equal(event.direction, direction);
    assert.equal(event.angle, null);
  }
});

test('translation and distance changes do not become turn direction', () => {
  const events = new ScreenTurnEvents();
  events.update(sample(3, [0, 0], [1, 0], [.2, .2], .15), 0);
  events.update(sample(3, [0, 0], [1, 0], [.3, .4], .2), 200);
  events.update(sample(null, [-.6, 0], [.4, 0], [.6, .5], .25), 400);
  events.update(sample(2, [-1, 0], [0, 0], [.5, .3], .35), 600);
  assert.equal(events.update(sample(2, [-1, 0], [0, 0], [.7, .6], .3), 800).direction, 'left');
});

test('contradictory or missing visual movement is uncertain, never a guessed axis', () => {
  const events = new ScreenTurnEvents();
  events.update(sample(3, [0, 0], [1, 0]), 0);
  events.update(sample(3, [0, 0], [1, 0]), 200);
  events.update(sample(2, [1, 0], [0, 0]), 400);
  assert.equal(events.update(sample(2, [1, 0], [0, 0]), 600).direction, 'uncertain');
  events.update({}, 1800);
  assert.equal(events.update(sample(3, [0, 0], [1, 0]), 1900), null);
  assert.equal(events.update(sample(3, [0, 0], [1, 0]), 2100), null);
});

test('recording profile recognises the shifted green, purple and desaturated orange', () => {
  for (const [rgb, id] of [[[83, 101, 175], 'purple'], [[125, 195, 180], 'green'], [[182, 104, 94], 'orange'], [[25, 68, 137], 'dark-blue'], [[20, 135, 240], 'light-blue']]) {
    assert.equal(COLOURS[classifyPixel(...rgb, RECORDING_PROFILE)]?.id, id);
  }
});

test('core search rejects uniform walls and skin and finds a white frame', () => {
  const size = 96;
  const rgba = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < rgba.length; i += 4) { rgba[i] = 170; rgba[i + 1] = 125; rgba[i + 2] = 115; rgba[i + 3] = 255; }
  assert.equal(locateCore({ width: size, height: size, data: rgba }), null);
  for (let y = 36; y < 60; y++) for (let x = 36; x < 60; x++) {
    const border = x < 39 || x >= 57 || y < 39 || y >= 57;
    const rgb = border ? [220, 225, 235] : [80, 180, 110], i = (y * size + x) * 4;
    rgba.set([...rgb, 255], i);
  }
  const found = locateCore({ width: size, height: size, data: rgba });
  assert.ok(found && Math.abs(found.x - .5) < .03 && Math.abs(found.y - .5) < .03);
  assert.ok(found.width > .2 && found.width < .3);
  assert.deepEqual(found.rgb, [80, 180, 110]);
  assert.deepEqual(trackedKeyCentres(new Int8Array(48 * 48).fill(2), 48, null), Array(6).fill(null));
});
