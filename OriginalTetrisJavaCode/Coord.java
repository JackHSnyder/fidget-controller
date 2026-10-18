package Tetris;

public class Coord {
    public int x;
    public int y;

    public Coord(int x, int y) {
        this.x = x;
        this.y = y;
    }

    public Coord below() {
        return new Coord(x, y + 1);
    }

    public Coord above() {
        return new Coord(x, y - 1);
    }

    public Coord left() {
        return new Coord(x - 1, y);
    }

    public Coord right() {
        return new Coord(x + 1, y);
    }

    public String toString() {
        return "(" + x + "," + y + ")";
    }
}
