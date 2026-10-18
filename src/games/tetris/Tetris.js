import { PIECE_SIZE, GRID_HEIGHT, GRID_WIDTH, TICK_MS } from './constants.js';
import { Grid } from './Grid.js';
import { Input } from './Input.js';
import { Square } from './Square.js';
import { Pipe } from './Pipe.js';
import { L } from './L.js';
import { InverseL } from './InverseL.js';
import { Z } from './Z.js';
import { InverseZ } from './InverseZ.js';

export { TICK_MS };

export class Tetris {
  static PIECE_SIZE = PIECE_SIZE;
  static GRID_HEIGHT = GRID_HEIGHT;
  static GRID_WIDTH = GRID_WIDTH;

  constructor({ onUpdate = () => {} } = {}) {
    this.tick = 0;
    this.grid = new Grid();
    this.piece = null;
    this.totalTicks = 0;
    this.pendingActions = [];
    this.timer = null;
    this.onUpdate = onUpdate;
  }

  getState() {
    return { tick: this.totalTicks, board: this.grid.rows.slice(0, GRID_HEIGHT)
      .map(row => row.row.slice(1, GRID_WIDTH + 1)) };
  }

  handleAction(action) {
    if (!action || typeof action.type !== 'string') return;
    this.pendingActions.push({ ...action });
  }

  update() {
    if (!this.piece) this.newShape();
    this.totalTicks++;

    const actions = this.pendingActions.splice(0);
    const directions = [];

    for (const action of actions) {
      if (action.type === 'rotation') {
        const direction = { 
          left: Input.LEFT, 
          right: Input.RIGHT, 
          down: Input.SOFT_DOWN 
        }[action.direction];

        if (direction) directions.push(direction);

      } else if (action.type === 'press') {
        directions.push(Input.DOWN);
      }
    }

    // Retain one original turn per mapped input, or one neutral turn per tick.
    if (directions.length) for (const direction of directions) this.turnTick(direction);
    else this.turnTick(null);
    this.onUpdate({ ...this.getState(), actions, deltaTimeMs: TICK_MS });
  }

  start() {
    if (this.timer !== null) return;
    if (!this.piece) this.newShape();
    this.timer = setInterval(() => this.update(), TICK_MS);
  }

  stop() {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.pendingActions.length = 0;
  }

  static main(readInput) {
    return new Tetris().gameLoop(readInput);
  }

  // Java's blocking Scanner is replaced with a supplied input function, which
  // may return a Promise. undefined ends input. Browser use calls start(),
  // which drives update() and turnTick() from the 50 ms timer instead.
  async gameLoop(readInput) {
    this.newShape();
    while (true) {
      const value = await readInput();
      if (value === undefined) return;
      this.turnTick(this.getInput(value));
      this.grid.print();
    }
  }

  turnTick(direction) {
    if (this.piece.checkBelow(this.grid)) {
      this.piece.place(this.grid);
      this.grid.checkClears();
      this.newShape();

      return;
    }

    if (direction === Input.SOFT_DOWN) {
      this.piece.fall(this.grid);
      this.tick = 0;

      return;
    }

    if (this.tick === 20) {
      this.tick = 0;
      this.piece.fall(this.grid);

    }

    if (direction !== Input.DOWN) {
      this.tick++;
      
      if (direction === Input.LEFT) this.piece.moveLeft(this.grid);
      else if (direction === Input.RIGHT) this.piece.moveRight(this.grid);

    } else {
      this.tick = 20;
      this.turnTick(direction);

      return;
    }
  }

  newShape() {
    switch (Math.floor(Math.random() * 6)) {
      case 0: this.piece = new Square(); break;
      case 1: this.piece = new Pipe(); break;
      case 2: this.piece = new L(); break;
      case 3: this.piece = new InverseL(); break;
      case 4: this.piece = new Z(); break;
      case 5: this.piece = new InverseZ(); break;
      default: throw new Error('Unexpected random shape index');
    }
  }

  getInput(value) {
    switch (value) {
      case 'a': return Input.LEFT;
      case 's': return Input.DOWN;
      case 'd': return Input.RIGHT;
      default: return null;
    }
  }
}
