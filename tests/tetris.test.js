import test from 'node:test';
import assert from 'node:assert/strict';
import { Tetris, TICK_MS } from '../src/games/tetris/Tetris.js';

test('Tetris advances once per 50 ms and processes queued input once in arrival order', t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const updates = [], game = new Tetris({ onUpdate: state => updates.push(state) });
  game.start();
  game.handleAction({ type: 'rotation', direction: 'left' });
  game.handleAction({ type: 'press', colour: 'pink' });
  t.mock.timers.tick(49);
  assert.equal(updates.length, 0);
  t.mock.timers.tick(1);
  assert.equal(updates[0].tick, 1);
  assert.equal(updates[0].deltaTimeMs, TICK_MS);
  assert.deepEqual(updates[0].actions, [{ type: 'rotation', direction: 'left' }, { type: 'press', colour: 'pink' }]);
  t.mock.timers.tick(50);
  assert.equal(updates[1].tick, 2);
  assert.deepEqual(updates[1].actions, []);
  assert.equal(updates[1].board.length, 20);
  assert.equal(updates[1].board[0].length, 10);
  game.stop();
});

test('start is idempotent; stop cancels ticks and pending inputs; restart continues the tick count', t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const updates = [], game = new Tetris({ onUpdate: state => updates.push(state) });
  game.start(); game.start();
  t.mock.timers.tick(100);
  assert.equal(game.getState().tick, 2);
  game.handleAction({ type: 'press' });
  game.stop(); game.stop();
  t.mock.timers.tick(1000);
  assert.equal(game.getState().tick, 2);
  game.start();
  t.mock.timers.tick(50);
  assert.equal(game.getState().tick, 3);
  assert.deepEqual(updates.at(-1).actions, []);
  game.stop();
});

test('update can be called manually; newly queued inputs wait for the next tick and board snapshots are isolated', () => {
  const updates = [];
  const game = new Tetris({ onUpdate(state) {
    updates.push(state);
    if (state.tick === 1) game.handleAction({ type: 'rotation', direction: 'down' });
    state.board[0][0] = 'pink';
  } });
  game.handleAction(null); game.handleAction({});
  game.update();
  assert.deepEqual(updates[0].actions, []);
  game.update();
  assert.deepEqual(updates[1].actions, [{ type: 'rotation', direction: 'down' }]);
  assert.equal(game.getState().board[0][0], 'EMPTY');
});
