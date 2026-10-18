import test from 'node:test';
import assert from 'node:assert/strict';
import { Coord } from '../src/games/tetris/Coord.js';
import { Grid } from '../src/games/tetris/Grid.js';
import { Row } from '../src/games/tetris/Row.js';
import { SPACE } from '../src/games/tetris/SPACE.js';
import { Input } from '../src/games/tetris/Input.js';
import { Tetris } from '../src/games/tetris/Tetris.js';
import { Square } from '../src/games/tetris/Square.js';
import { Pipe } from '../src/games/tetris/Pipe.js';
import { L } from '../src/games/tetris/L.js';
import { InverseL } from '../src/games/tetris/InverseL.js';
import { Z } from '../src/games/tetris/Z.js';
import { InverseZ } from '../src/games/tetris/InverseZ.js';

test('all six shapes keep the Java point order and defaults', t => {
  const cases = [
    [Square, [[4, 1], [5, 1], [4, 0], [5, 0]]],
    [Pipe, [[4, 3], [4, 2], [4, 1], [4, 0]]],
    [L, [[5, 2], [4, 2], [4, 1], [4, 0]]],
    [InverseL, [[4, 2], [5, 2], [5, 1], [5, 0]]],
    [Z, [[5, 1], [6, 1], [4, 0], [5, 0]]],
    [InverseZ, [[4, 1], [5, 1], [5, 0], [6, 0]]],
  ];
  const random = t.mock.method(Math, 'random');
  cases.forEach(([ShapeClass, points], index) => {
    const shape = new ShapeClass();
    assert.deepEqual(shape.points.map(p => [p.x, p.y]), points);
    assert.equal(shape.rotationStep, 1);
    assert.equal(shape.steps, ShapeClass === Pipe ? 2 : 0);
    random.mock.mockImplementation(() => (index + .5) / 6);
    const game = new Tetris(); game.newShape();
    assert.ok(game.piece instanceof ShapeClass);
  });
});

test('grid borders, coordinate helpers, and wall collisions match the Java grid', () => {
  const grid = new Grid(), point = new Coord(4, 1);
  assert.equal(point.toString(), '(4,1)');
  assert.deepEqual(point.below().above(), point);
  assert.deepEqual(point.left().right(), point);
  assert.equal(grid.rows.length, 21);
  assert.equal(grid.rows[0].row.length, 12);
  assert.ok(grid.rows[20].row.every(cell => cell === SPACE.FULL));
  const shape = new Square();
  for (let i = 0; i < 20; i++) shape.moveLeft(grid);
  assert.equal(Math.min(...shape.points.map(p => p.x)), 1);
  for (let i = 0; i < 20; i++) shape.moveRight(grid);
  assert.equal(Math.max(...shape.points.map(p => p.x)), 10);
  assert.equal(grid.get(new Coord(11, 0)), SPACE.FULL);
});

test('gravity timing and DOWN retain the Java turnTick behaviour', t => {
  t.mock.method(Math, 'random', () => 0);
  const game = new Tetris(); game.newShape();
  for (let i = 0; i < 20; i++) game.turnTick(null);
  assert.equal(game.tick, 20);
  assert.equal(game.grid.get(new Coord(4, 0)), SPACE.EMPTY);
  game.turnTick(null);
  assert.equal(game.tick, 1);
  assert.equal(game.grid.get(new Coord(4, 1)), SPACE.PLACING);
  assert.equal(game.grid.get(new Coord(4, 2)), SPACE.PLACING);
  game.turnTick(Input.DOWN);
  for (const y of [18, 19]) for (const x of [4, 5]) assert.equal(game.grid.get(new Coord(x, y)), SPACE.FULL);
  assert.equal(game.tick, 20);
  assert.deepEqual(game.piece.points.map(p => [p.x, p.y]), [[4, 1], [5, 1], [4, 0], [5, 0]]);
});

test('row clearing retains the original single descending pass', () => {
  const row = new Row();
  assert.equal(row.toString(), '##########');
  const grid = new Grid();
  for (const y of [18, 19]) for (let x = 1; x <= 10; x++) grid.rows[y].set(x, SPACE.FULL);
  grid.checkClears();
  assert.equal(grid.rows.length, 21);
  // The Java loop skips the row shifted into the just-cleared index.
  assert.equal(grid.rows[19].isFull(), true);
  assert.equal(grid.rows[18].isFull(), false);
  assert.equal(grid.rows[0].isFull(), false);
});

test('Tetris input queue drives the converted rules and returns SPACE cells', t => {
  t.mock.method(Math, 'random', () => 0);
  const game = new Tetris();
  game.handleAction({ type: 'rotation', direction: 'left' });
  game.update();
  assert.equal(game.getState().board[0][2], SPACE.PLACING);
  game.handleAction({ type: 'rotation', direction: 'right' });
  game.handleAction({ type: 'press' });
  game.update();
  assert.equal(game.getState().tick, 2);
  for (const y of [18, 19]) for (const x of [3, 4]) assert.equal(game.getState().board[y][x], SPACE.FULL);
  assert.equal(game.getState().board.length, 20);
  assert.equal(game.getState().board[0].length, 10);
});

test('downward cube rotation lowers one row while a key press hard drops', t => {
  t.mock.method(Math, 'random', () => 0);
  const game = new Tetris();
  game.handleAction({ type: 'rotation', direction: 'down' });
  game.update();
  assert.equal(game.tick, 0);
  assert.equal(game.grid.get(new Coord(4, 2)), SPACE.PLACING);
  assert.equal(game.grid.get(new Coord(4, 19)), SPACE.EMPTY);
  game.handleAction({ type: 'press', colour: 'pink' });
  game.update();
  assert.equal(game.grid.get(new Coord(4, 19)), SPACE.FULL);
});

test('console-loop adapter accepts asynchronous Java-style input without blocking the page', async t => {
  t.mock.method(Math, 'random', () => 0);
  const output = t.mock.method(console, 'log', () => {});
  const tokens = ['a', 's', 'd'];
  const game = new Tetris();
  await game.gameLoop(async () => tokens.shift());
  assert.equal(output.mock.callCount(), 3);
  assert.equal(game.getInput('a'), Input.LEFT);
  assert.equal(game.getInput('s'), Input.DOWN);
  assert.equal(game.getInput('d'), Input.RIGHT);
  assert.equal(game.getInput('other'), null);
});
