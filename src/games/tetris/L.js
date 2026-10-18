import { Shape } from './Shape.js';
import { Coord } from './Coord.js';

export class L extends Shape {
  constructor() {
    super();
    this.points.push(new Coord(5, 2), new Coord(4, 2), new Coord(4, 1), new Coord(4, 0));
  }
}
