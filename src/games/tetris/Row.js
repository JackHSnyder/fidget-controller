import { GRID_WIDTH } from './constants.js';
import { SPACE } from './SPACE.js';

export class Row {
  constructor() {
    this.row = [SPACE.FULL];
    for (let i = 0; i < GRID_WIDTH; i++) this.row.push(SPACE.EMPTY);
    this.row.push(SPACE.FULL);
  }
  get(i) { return this.row[i]; }
  set(i, space) { this.row[i] = space; }
  toString() {
    let output = '';
    for (let i = 1; i < GRID_WIDTH + 1; i++) {
      if (this.row[i] === SPACE.PLACING) output += '0';
      else if (this.row[i] === SPACE.FULL) output += 'x';
      else output += '#';
    }
    return output;
  }
  print() { console.log(this.toString()); }
  isFull() {
    for (const space of this.row) if (space === SPACE.EMPTY) return false;
    return true;
  }
}
