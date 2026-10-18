import test from 'node:test';
import assert from 'node:assert/strict';
import { mirrorTurn, previewToSource } from '../src/mirrored-view.js';

test('mirrored events reverse horizontal turns and roll while preserving vertical turns and metadata', () => {
  for (const [raw, displayed] of [['left', 'right'], ['right', 'left'], ['clockwise', 'anticlockwise'], ['anticlockwise', 'clockwise'], ['up', 'up'], ['down', 'down'], ['diagonal', 'diagonal'], ['uncertain', 'uncertain']]) {
    const turn = { from: 'pink', to: 'orange', direction: raw, time: 1200, angle: null, inferred: true };
    assert.deepEqual(mirrorTurn(turn), { ...turn, direction: displayed });
    assert.equal(turn.direction, raw);
    assert.deepEqual(mirrorTurn(mirrorTurn(turn)), turn);
  }
});

test('selection and calibration clicks map to the matching raw pixels in a mirrored scaled preview', () => {
  const rect = { left: 100, top: 50, width: 640, height: 360 };
  assert.deepEqual(previewToSource(260, 140, rect, 1280, 720), { x: 960, y: 180 });
  assert.deepEqual(previewToSource(420, 230, rect, 1280, 720), { x: 640, y: 360 });
  assert.deepEqual(previewToSource(100, 50, rect, 1280, 720), { x: 1280, y: 0 });
  assert.deepEqual(previewToSource(740, 410, rect, 1280, 720), { x: 0, y: 720 });
  // Dragging outside the canvas stays clamped in source coordinates.
  assert.deepEqual(previewToSource(800, -10, rect, 1280, 720), { x: 0, y: 0 });
});
