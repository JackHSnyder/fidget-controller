import test from 'node:test';
import assert from 'node:assert/strict';
import { findToy, placeSearchResult } from '../src/tracking/toy-search.js';
import { locateCore, observeKeys } from '../src/tracking/vision.js';

function scene(width, height, cx, cy, side, { toy = true, partial = false } = {}) {
  const data = new Uint8ClampedArray(width * height * 4);
  const rect = (left, top, w, h, rgb) => {
    for (let y = Math.max(0, Math.round(top)); y < Math.min(height, Math.round(top + h)); y++)
      for (let x = Math.max(0, Math.round(left)); x < Math.min(width, Math.round(left + w)); x++) data.set([...rgb, 255], (y * width + x) * 4);
  };
  rect(0, 0, width, height, [70, 70, 70]);
  rect(cx - side / 2, cy - side / 2, side, side, [230, 230, 230]);
  rect(cx - side * .36, cy - side * .36, side * .72, side * .72, [95, 145, 35]);
  if (partial) rect(cx - side / 2, cy - side / 2, side, side * .14, [70, 70, 70]);
  if (toy) {
    rect(cx - side * 1.15, cy - side * .25, side * .4, side * .5, [225, 80, 15]);
    rect(cx - side * .25, cy - side * 1.15, side * .5, side * .4, [115, 55, 160]);
    rect(cx + side * .75, cy - side * .25, side * .4, side * .5, [25, 130, 170]);
  }
  return { width, height, data };
}

test('full-frame search finds the toy far outside the old box, including screen edges', () => {
  for (const [width, height, x, y, side] of [[320, 180, 45, 45, 20], [320, 180, 275, 135, 20], [180, 320, 40, 275, 20], [320, 180, 260, 65, 12], [320, 180, 100, 95, 40]]) {
    const found = findToy(scene(width, height, x, y, side));
    assert.ok(found, `missing toy at ${x}, ${y}, size ${side}`);
    assert.ok(Math.hypot(found.x * width - x, found.y * height - y) < side * .25);
    const old = { x: width / 2 - 20, y: height / 2 - 20, side: 40 };
    const result = placeSearchResult(found, width, height, old);
    assert.equal(result.moved, true);
    assert.ok(Math.abs(result.region.x + result.region.side / 2 - x) < side * .25);
  }
});

test('global search rejects an isolated coloured square in a white frame', () => {
  assert.equal(findToy(scene(320, 180, 260, 50, 24, { toy: false })), null);
  const image = scene(320, 180, 260, 50, 24, { toy: false });
  image.data.fill(190);
  assert.equal(findToy(image), null);
});

test('relaxed local search tolerates one obscured white edge', () => {
  const image = scene(96, 96, 48, 48, 26, { partial: true });
  const found = locateCore(image, { relaxed: true });
  assert.ok(found && found.score > .55);
  assert.ok(Math.abs(found.x - .5) < .05 && Math.abs(found.y - .5) < .05);
});

test('partial central paint remains usable with a weaker independently detected core', () => {
  const size = 48, labels = new Int8Array(size * size).fill(-1);
  for (let y = 20; y < 28; y++) for (let x = 22; x < 28; x++) labels[y * size + x] = 0;
  const observed = observeKeys(labels, size, { x: .5, y: .5, width: .3, score: .6 }, { colour: 0 });
  assert.equal(observed.face, 0);
});
