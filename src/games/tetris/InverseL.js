import { Shape } from './Shape.js';
import { Coord } from './Coord.js';

export class InverseL extends Shape {
  constructor() {
    super();
    this.points.push(new Coord(4, 2), new Coord(5, 2), new Coord(5, 1), new Coord(5, 0));
  }
}
