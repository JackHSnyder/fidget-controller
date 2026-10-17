import test from 'node:test';
import assert from 'node:assert/strict';
import { COLOURS, identity, multiply, rotation, frontFace, rotationBetween, renderModel, makeModel } from '../src/cube-model.js';
import { classifyPixel } from '../src/vision.js';
import { fitPose, defaultPose, RotationEvents } from '../src/tracker.js';

test('all six requested colours, including shadowed blue and pink near red', () => {
  for (const [rgb, expected] of [ [[230, 30, 85], 'pink'], [[115, 55, 160], 'purple'], [[225, 80, 15], 'orange'], [[95, 145, 35], 'green'], [[25, 130, 170], 'light-blue'], [[28, 42, 85], 'dark-blue'] ]) {
    assert.equal(COLOURS[classifyPixel(...rgb)]?.id, expected);
  }
  assert.equal(classifyPixel(180, 180, 180), 6);
});

test('direction is relative to camera axes at every initial roll', () => {
  for (const roll of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const initial = rotation(2, roll);
    for (const [axis, angle, direction] of [[0, Math.PI / 2, 'down'], [0, -Math.PI / 2, 'up'], [1, Math.PI / 2, 'left'], [1, -Math.PI / 2, 'right'], [2, Math.PI / 2, 'clockwise'], [2, -Math.PI / 2, 'anticlockwise']]) {
      assert.equal(rotationBetween(initial, multiply(rotation(axis, angle), initial)).direction, direction);
    }
  }
});

test('same colour pair can represent different directions depending on roll', () => {
  const pose = defaultPose();
  const upright = identity(), rolled = rotation(2, Math.PI / 2);
  const leftTurn = multiply(rotation(1, Math.PI / 2), upright);
  const downTurn = multiply(rotation(0, -Math.PI / 2), rolled);
  assert.equal(frontFace({ ...pose, r: leftTurn }).colour.id, 'orange');
  assert.equal(frontFace({ ...pose, r: downTurn }).colour.id, 'orange');
  assert.equal(rotationBetween(upright, leftTurn).direction, 'left');
  assert.equal(rotationBetween(rolled, downTurn).direction, 'up');
});

test('pose acquisition recovers front face at different scale, position, and roll', () => {
  const model = makeModel(), size = 48;
  for (const [axis, angle, roll, scale, x, y] of [[0, .2, .35, .16, .53, .46], [1, 1.3, 1.2, .21, .45, .54], [0, -1.4, -.6, .24, .51, .48], [1, 2.95, .8, .19, .48, .51]]) {
    const pose = { ...defaultPose(), r: multiply(rotation(2, roll), rotation(axis, angle)), scale, x, y };
    const observation = renderModel(model, pose, size);
    const fitted = fitPose(observation, size);
    assert.ok(fitted?.reliable, `fit unreliable: ${fitted?.loss}`);
    assert.equal(fitted.face.colour.id, frontFace(pose).colour.id);
    assert.ok(rotationBetween(pose.r, fitted.pose.r).angle < 15, `orientation error ${rotationBetween(pose.r, fitted.pose.r).angle}`);
  }
});

test('front face uses normal direction rather than coloured pixel area', () => {
  const pose = { ...defaultPose(), r: rotation(1, .3) };
  assert.equal(frontFace(pose).colour.id, 'green');
  assert.ok(frontFace({ ...pose, r: rotation(1, Math.PI / 4) }).margin < .01);
});

const observation = r => { const pose = { ...defaultPose(), r }; return { pose, reliable: true, face: frontFace(pose) }; };
test('turn events debounce face changes and do not invent turns across tracking loss', () => {
  const events = new RotationEvents();
  assert.equal(events.update(observation(identity()), 0), null);
  assert.equal(events.update(observation(identity()), 200), null);
  const target = rotation(1, Math.PI / 2);
  assert.equal(events.update(observation(target), 300), null);
  assert.equal(events.update(observation(target), 500).direction, 'left');
  assert.equal(events.update(observation(target), 700), null);
  events.update(null, 1400);
  assert.equal(events.update(observation(identity()), 1500), null);
  assert.equal(events.update(observation(identity()), 1700), null);
});

test('blank and single-colour images cannot establish a reliable pose', () => {
  assert.equal(fitPose(new Int8Array(48 * 48).fill(-1), 48), null);
  const fit = fitPose(new Int8Array(48 * 48).fill(3), 48);
  assert.equal(fit.reliable, false);
});

test('continuous video estimates the turn while object scale and position change', () => {
  const model = makeModel(), size = 48, events = new RotationEvents();
  let previous = null;
  const detected = [];
  const initial = multiply(rotation(2, .4), rotation(0, .1));
  for (let frame = 0; frame < 28; frame++) {
    const angle = Math.min(Math.PI / 2, Math.max(0, frame - 4) * Math.PI / 30);
    const pose = { ...defaultPose(), r: multiply(rotation(1, angle), initial), scale: .17 + frame * .0015, x: .48 + frame * .001, y: .51 - frame * .0007 };
    const fitted = fitPose(renderModel(model, pose, size), size, { previous });
    assert.ok(fitted.reliable, `frame ${frame} lost tracking`);
    previous = fitted.pose;
    const event = events.update(fitted, frame * 100);
    if (event) detected.push(event);
  }
  assert.equal(detected.length, 1);
  assert.equal(detected[0].direction, 'left');
  assert.equal(detected[0].from, 'green');
  assert.equal(detected[0].to, 'orange');
});

test('edge-on face jitter and diagonal turns are not labelled as cardinal turns', () => {
  const events = new RotationEvents();
  events.update(observation(identity()), 0); events.update(observation(identity()), 200);
  for (let i = 0; i < 5; i++) assert.equal(events.update(observation(rotation(1, Math.PI / 4 + (i % 2 ? .02 : -.02))), 300 + i * 100), null);
  const combined = multiply(rotation(0, .8), rotation(1, .8));
  assert.equal(rotationBetween(identity(), combined).direction, 'diagonal');
  for (let i = 0; i < 10; i++) events.update(observation(rotation(1, Math.PI / 4)), 800 + i * 100);
  events.update(observation(rotation(1, Math.PI / 2)), 1800);
  assert.equal(events.update(observation(rotation(1, Math.PI / 2)), 2000).direction, 'left');
});
