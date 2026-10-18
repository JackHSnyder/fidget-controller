import test from 'node:test';
import assert from 'node:assert/strict';
import { Tetris } from '../src/games/tetris/Tetris.js';
import { createTetrisRenderer } from '../src/games/tetris/renderer.js';

test('renderer follows real game ticks from falling to placed blocks without rebuilding cells or mutating the board', t => {
  t.mock.method(Math, 'random', () => 0); // Square, with the Java spawn/fall timing.
  const container = {
    ownerDocument: { createElement: () => ({ className: '', setAttribute() {} }) },
    replaceChildren(...children) { this.children = children; },
  };
  const render = createTetrisRenderer(container);
  const originalCells = [...container.children];
  const game = new Tetris({ onUpdate: ({ board }) => render(board) });
  render(game.getState().board);
  const count = state => container.children.filter(cell => cell.className.endsWith(`--${state}`)).length;
  assert.equal(container.children.length, 200);
  assert.equal(count('empty'), 200);

  for (let i = 0; i < 21; i++) game.update();
  assert.equal(count('placing'), 4);
  assert.equal(count('full'), 0);
  game.handleAction({ type: 'press' });
  game.update();
  assert.equal(count('placing'), 0);
  assert.equal(count('full'), 4);

  const before = game.getState();
  render(before.board);
  assert.deepEqual(game.getState(), before);
  assert.ok(container.children.every((cell, i) => cell === originalCells[i]));
});
