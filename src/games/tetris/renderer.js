import { GRID_HEIGHT, GRID_WIDTH } from './constants.js';
import { SPACE } from './SPACE.js';

export function createTetrisRenderer(container) {
  const cells = [];
  for (let y = 0; y < GRID_HEIGHT; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      const cell = container.ownerDocument.createElement('div');
      cell.className = 'tetris-cell tetris-cell--empty';
      cell.setAttribute('aria-hidden', 'true');
      cells.push(cell);
    }
  }
  container.replaceChildren(...cells);

  // Reuse the cells on each tick; the renderer never changes game state.
  return function render(board) {
    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
        const space = board[y][x];
        const state = space === SPACE.PLACING ? 'placing' : space === SPACE.FULL ? 'full' : 'empty';
        cells[y * GRID_WIDTH + x].className = `tetris-cell tetris-cell--${state}`;
      }
    }
  };
}
