import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { COLOURS, FACE_MARGIN, MIN_FACING } from '../src/tracking/cube-model.js';
import { INDOOR_PROFILE } from '../src/tracking/colour-profiles.js';
import { classifyPixel, exposureCalibration, locateCore } from '../src/tracking/vision.js';
import { analyseFrame } from '../src/tracking/frame-analysis.js';
import { ScreenTurnEvents } from '../src/tracking/screen-turns.js';

test('physical layout matches the confirmed clockwise unmirrored neighbours of green', () => {
  const neighbours = COLOURS.filter(c => c.normal[2] === 0)
    .map(c => ({ id: c.id, angle: (Math.atan2(c.normal[1], c.normal[0]) + Math.PI * 3) % (Math.PI * 2) }))
    .sort((a, b) => a.angle - b.angle).map(c => c.id);
  assert.deepEqual(neighbours, ['light-blue', 'purple', 'orange', 'dark-blue']);
});

test('measured PC key colours remain distinct across shared exposure changes', () => {
  const samples = [[38, 33, 52], [6, 26, 36], [8, 65, 87], [43, 78, 41], [102, 43, 49], [126, 64, 48]];
  const expected = ['purple', 'dark-blue', 'light-blue', 'green', 'pink', 'orange'];
  for (const exposure of [.65, 1, 1.7]) {
    const calibration = exposureCalibration(INDOOR_PROFILE, .4 * exposure);
    samples.forEach((rgb, i) => assert.equal(COLOURS[classifyPixel(...rgb.map(v => Math.round(v * exposure)), calibration)]?.id,
      expected[i], `${expected[i]}, exposure ${exposure}`));
  }
  assert.equal(INDOOR_PROFILE['dark-blue'].v, .15, 'exposure adaptation must not mutate saved references');
});

test('dim warm white frame with a covered edge is found, without shrinking onto its symbol', () => {
  const size = 96, data = new Uint8ClampedArray(size * size * 4);
  const rect = (x, y, w, h, rgb) => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) data.set([...rgb, 255], (yy * size + xx) * 4);
  };
  rect(0, 0, size, size, [60, 35, 32]);
  rect(34, 34, 28, 28, [95, 89, 84]);
  rect(38, 38, 20, 20, [43, 78, 41]);
  rect(34, 34, 28, 4, [60, 35, 32]);
  rect(44, 44, 8, 8, [95, 89, 84]);
  rect(46, 46, 4, 4, [43, 78, 41]);
  const core = locateCore({ width: size, height: size, data }, { relaxed: true, expectedWidth: 28 / size });
  assert.ok(core?.score > .55);
  assert.ok(Math.hypot(core.x - .5, core.y - .5) < .04);
  assert.ok(core.width > .24 && core.width < .36);
  assert.ok(core.whiteValue > .3 && core.whiteValue < .44);
});

test('global search bounds expensive verification and supplies measured exposure', () => {
  const size = 96, data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const edge = x % 16 < 3 || y % 16 < 3;
    data.set(edge ? [100, 100, 100, 255] : [40, 80, 40, 255], (y * size + x) * 4);
  }
  let checks = 0;
  locateCore({ width: size, height: size, data }, { wide: true, accept(core) {
    checks++; assert.ok(core.whiteValue > .3); return false;
  } });
  assert.ok(checks > 0 && checks <= 24);
});

test('an opposite-face jump never becomes a single cardinal menu step', () => {
  const tracker = new ScreenTurnEvents();
  const sample = face => ({ face, core: { x: .5, y: .5, width: .25 },
    centres: [null, face === 1 ? [.5, .5] : [.25, .5], null, null, null, face === 5 ? [.5, .5] : [.75, .5]] });
  tracker.update(sample(1), 0); tracker.update(sample(1), 200);
  tracker.update(sample(5), 400);
  assert.equal(tracker.update(sample(5), 600).direction, 'uncertain');
  assert.equal(tracker.update(sample(5), 800), null);
});

const recording = JSON.parse(readFileSync(new URL('./fixtures/pc-camera-checkpoints.json', import.meta.url)));
test('PC recording checkpoints recognise all six colours, including small distant views', () => {
  for (const frame of recording.frames) {
    const image = { width: 48, height: 48, data: new Uint8ClampedArray(inflateSync(Buffer.from(frame.rgba, 'base64'))) };
    const fit = analyseFrame(image, { core: frame.core, acquire: true });
    const clear = fit?.reliable && fit.face.margin >= FACE_MARGIN && fit.face.facing >= MIN_FACING;
    const face = clear ? fit.face.colour.id : COLOURS[fit.observation.face]?.id ?? null;
    assert.equal(face, frame.expectedTracked, `PC recording at ${frame.time}s`);
  }
});
