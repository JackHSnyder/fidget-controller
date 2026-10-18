import { Shape } from './Shape.js';
import { Coord } from './Coord.js';

export class Square extends Shape {
  constructor() {
    super();
    this.points.push(new Coord(4, 1), new Coord(5, 1), new Coord(4, 0), new Coord(5, 0));
  }
}
