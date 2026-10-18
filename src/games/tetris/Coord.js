export class Coord {
  constructor(x, y) { this.x = x; this.y = y; }
  below() { return new Coord(this.x, this.y + 1); }
  above() { return new Coord(this.x, this.y - 1); }
  left() { return new Coord(this.x - 1, this.y); }
  right() { return new Coord(this.x + 1, this.y); }
  toString() { return `(${this.x},${this.y})`; }
}
