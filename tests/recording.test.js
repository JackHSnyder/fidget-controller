import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fitPose } from '../src/tracker.js';
import { FACE_MARGIN, MIN_FACING } from '../src/cube-model.js';
import { ScreenTurnEvents } from '../src/screen-turns.js';

const recording = JSON.parse(await readFile(new URL('./fixtures/recording-checkpoints.json', import.meta.url), 'utf8'));

test('real recording checkpoints retain 27 correct clear faces and reject five uncertain views', () => {
  let correct = 0, uncertain = 0;
  for (const frame of recording.frames) {
    const labels = new Int8Array(Buffer.from(frame.labels, 'base64'));
    const fit = fitPose(labels, 48, frame.options);
    const active = fit?.reliable && fit.face.margin >= FACE_MARGIN && fit.face.facing >= MIN_FACING ? fit.face.colour.id : null;
    assert.equal(active, frame.expectedTracked, `regression at ${frame.time / 1000}s`);
    if (active) { assert.equal(active, frame.expected); correct++; }
    else uncertain++;
  }
  assert.equal(correct, 27); assert.equal(uncertain, 5);
});

test('first eight observed recording turns match manually checked directions', () => {
  const tracker = new ScreenTurnEvents(), events = [];
  for (const frame of recording.motion) {
    const event = tracker.update(frame, frame.time);
    if (event) events.push(event);
  }
  assert.deepEqual(events.slice(0, 8).map(({ from, to, direction }) => [from, to, direction]), [
    ['pink', 'orange', 'left'], ['orange', 'purple', 'down'],
    ['purple', 'green', 'left'], ['green', 'light-blue', 'down'],
    ['light-blue', 'dark-blue', 'left'], ['dark-blue', 'pink', 'down'],
    ['pink', 'orange', 'left'], ['orange', 'purple', 'down'],
  ]);
});
