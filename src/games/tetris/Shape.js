import { SPACE } from './SPACE.js';

export class Shape {
  constructor() { this.points = []; this.rotationStep = 1; this.steps = 0; }
  fall(grid) {
    for (const point of this.points) {
      point.y++;
      grid.set(point.above(), SPACE.EMPTY);
      grid.set(point, SPACE.PLACING);
    }
  }
  checkBelow(grid) {
    for (const point of this.points) if (grid.get(point.below()) === SPACE.FULL) return true;
    return false;
  }
  moveLeft(grid) {
    for (const point of this.points) if (grid.get(point.left()) === SPACE.FULL) return;
    for (const point of this.points) { grid.set(point, SPACE.EMPTY); point.x--; }
    for (const point of this.points) grid.set(point, SPACE.PLACING);
  }
  moveRight(grid) {
    for (const point of this.points) if (grid.get(point.right()) === SPACE.FULL) return;
    for (const point of this.points) { grid.set(point, SPACE.EMPTY); point.x++; }
    for (const point of this.points) grid.set(point, SPACE.PLACING);
  }
  place(grid) {
    for (const point of this.points) grid.set(point, SPACE.FULL);
  }
}
