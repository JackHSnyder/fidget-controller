import test from 'node:test';
import assert from 'node:assert/strict';
import { COLOURS } from '../src/cube-model.js';
import { observeKeys } from '../src/vision.js';
import { analyseFrame } from '../src/frame-analysis.js';
import { ScreenTurnEvents } from '../src/screen-turns.js';

function observation(face, positions, core = { x: .5, y: .5, width: .25, score: .9 }) {
  const centres = Array(6).fill(null);
  for (const [colour, [x, y]] of Object.entries(positions)) centres[colour] = [core.x + x * core.width, core.y + y * core.width];
  return { core, observation: { face, centres } };
}

test('pink below then central means up even with a missing frame and no geometric fit', () => {
  const tracker = new ScreenTurnEvents();
  tracker.update(observation(2, { 2: [0, 0], 0: [0, 1] }), 0);
  tracker.update(observation(2, { 2: [0, 0], 0: [0, 1] }), 200);
  assert.equal(tracker.update({}, 400), null);
  assert.equal(tracker.activeFace, 2);
  tracker.update(observation(0, { 0: [0, 0] }), 600);
  const event = tracker.update(observation(0, { 0: [0, 0] }), 800);
  assert.equal(event.from, 'orange');
  assert.equal(event.to, 'pink');
  assert.equal(event.direction, 'up');
  assert.equal(event.inferred, true);
  // Recovery must not navigate the menu a second time.
  assert.equal(tracker.update({ ...observation(0, { 0: [0, 0] }), face: 0 }, 1000), null);
});

test('previous centre moving left is enough when the incoming key was previously hidden', () => {
  const tracker = new ScreenTurnEvents();
  tracker.update(observation(2, { 2: [0, 0] }), 0);
  tracker.update(observation(2, { 2: [0, 0] }), 200);
  const movedCore = { x: .65, y: .4, width: .15, score: .9 };
  tracker.update(observation(0, { 0: [0, 0], 2: [-1, 0] }, movedCore), 400);
  assert.equal(tracker.update(observation(0, { 0: [0, 0], 2: [-1, 0] }, movedCore), 600).direction, 'left');
});

test('outgoing centre alone emits one turn, without guessing a covered incoming colour', () => {
  const tracker = new ScreenTurnEvents();
  tracker.update(observation(2, { 2: [0, 0] }), 0);
  tracker.update(observation(2, { 2: [0, 0] }), 200);
  assert.equal(tracker.update(observation(null, { 2: [-1, 0] }), 400), null);
  const event = tracker.update(observation(null, { 2: [-1, 0] }), 600);
  assert.equal(event.direction, 'left');
  assert.equal(event.from, 'orange');
  assert.equal(event.to, null);
  assert.equal(tracker.update(observation(null, { 2: [-1, 0] }), 800), null);
  assert.equal(tracker.update(observation(0, { 0: [0, 0], 2: [-1, 0] }), 1000), null);
  assert.equal(tracker.update({ ...observation(0, { 0: [0, 0], 2: [-1, 0] }), face: 0 }, 1200), null);
});

test('raw background components do not override positions from a clear model fit', () => {
  const tracker = new ScreenTurnEvents();
  const first = observation(2, { 2: [0, 0], 0: [0, 1] });
  first.face = 2;
  first.centres = Array(6).fill(null); first.centres[2] = [.5, .5];
  tracker.update(first, 0);
  tracker.update(first, 200);
  const next = observation(0, { 0: [0, 0], 2: [-1, 0] });
  next.face = 0; next.centres = next.observation.centres;
  tracker.update(next, 400);
  assert.equal(tracker.update(next, 600).direction, 'left');
});

test('fallback requires fresh core, stable centre, and consistent direction', () => {
  const tracker = new ScreenTurnEvents();
  tracker.update(observation(2, { 2: [0, 0], 0: [0, 1] }), 0);
  tracker.update(observation(2, { 2: [0, 0], 0: [0, 1] }), 200);
  assert.equal(tracker.update(observation(0, { 0: [0, 0] }), 400), null);
  tracker.update(observation(2, { 2: [0, 0], 0: [0, 1] }), 500);
  tracker.update(observation(0, { 0: [0, 0], 2: [-1, 0] }), 600);
  assert.equal(tracker.update(observation(0, { 0: [0, 0], 2: [-1, 0] }), 800).direction, 'uncertain');
  const unanchored = observation(3, { 3: [0, 0] }); unanchored.core.score = .4;
  assert.equal(tracker.update(unanchored, 1000), null);
  tracker.update({}, 1500);
  assert.equal(tracker.activeFace, null);
});

test('long loss expires remembered side colours even if the white core remains visible', () => {
  const tracker = new ScreenTurnEvents();
  tracker.update(observation(2, { 2: [0, 0], 0: [0, 1] }), 0);
  tracker.update(observation(2, { 2: [0, 0], 0: [0, 1] }), 200);
  for (const time of [500, 900, 1300]) tracker.update(observation(null, {}), time);
  assert.equal(tracker.update(observation(0, { 0: [0, 0] }), 1600), null);
  assert.equal(tracker.update(observation(0, { 0: [0, 0] }), 1800), null);
});

test('independent observations reject clutter and require actual central paint', () => {
  const size = 64, labels = new Int8Array(size * size).fill(-1);
  const core = { x: .5, y: .5, width: .25, score: .9 };
  for (let y = 26; y < 38; y++) for (let x = 26; x < 38; x++) labels[y * size + x] = 0;
  for (let y = 46; y < 50; y++) for (let x = 28; x < 36; x++) labels[y * size + x] = 2;
  assert.equal(observeKeys(labels, size, core, { colour: 0 }).face, 0);
  assert.equal(observeKeys(labels, size, core, { colour: 2 }).face, null);
  assert.equal(observeKeys(labels, size, { ...core, score: .4 }, { colour: 0 }).face, null);
  assert.deepEqual(observeKeys(new Int8Array(size * size).fill(0), size, core, { colour: 0 }).centres, Array(6).fill(null));
});

test('frame analysis supplies independent evidence when a one-key view cannot fit the model', () => {
  const size = 48, data = new Uint8ClampedArray(size * size * 4);
  const rgb = COLOURS[0].hex.match(/\w\w/g).map(v => parseInt(v, 16));
  for (let y = 19; y < 29; y++) for (let x = 19; x < 29; x++) data.set([...rgb, 255], (y * size + x) * 4);
  const result = analyseFrame({ data, width: size, height: size }, { profile: 'daylight', core: { x: .5, y: .5, width: .3, score: .9, rgb } });
  assert.equal(result.reliable, false);
  assert.equal(result.observation.face, 0);
  assert.ok(result.observation.centres[0]);
  assert.deepEqual(result.centres, Array(6).fill(null));
});
