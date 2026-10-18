package Tetris;

public class Pipe extends Shape {

    public Pipe() {
        steps = 2;
        points.add(new Coord(4, 3));
        points.add(new Coord(4, 2));
        points.add(new Coord(4, 1));
        points.add(new Coord(4, 0));
    }

}
