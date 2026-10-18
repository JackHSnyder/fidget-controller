import { GRID_HEIGHT, GRID_WIDTH } from './constants.js';
import { Row } from './Row.js';
import { SPACE } from './SPACE.js';

export class Grid {
  constructor() {
    this.rows = [];
    for (let i = 0; i < GRID_HEIGHT + 1; i++) this.rows.push(new Row());
    for (let i = 0; i < GRID_WIDTH + 1; i++) this.rows[GRID_HEIGHT].set(i, SPACE.FULL);
  }
  get(coord) { return this.rows[coord.y].get(coord.x); }
  set(coord, space) { this.rows[coord.y].set(coord.x, space); }
  print() { console.log(this.rows.map(row => row.toString()).join('\n')); }
  checkClears() {
    for (let i = GRID_HEIGHT - 1; i >= 0; i--) {
      if (this.rows[i].isFull()) {
        this.rows.splice(i, 1);
        this.rows.unshift(new Row());
      }
    }
  }
}
