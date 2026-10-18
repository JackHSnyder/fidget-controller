import { Shape } from './Shape.js';
import { Coord } from './Coord.js';

export class Pipe extends Shape {
  constructor() {
    super();
    this.steps = 2;
    this.points.push(new Coord(4, 3), new Coord(4, 2), new Coord(4, 1), new Coord(4, 0));
  }
}
