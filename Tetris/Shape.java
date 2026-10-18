package Tetris;

import java.util.ArrayList;
import java.util.List;

public abstract class Shape {
    public List<Coord> points = new ArrayList<>();
    public int rotationStep = 1;
    public int steps;

    public void fall(Grid grid) {
        for (Coord point : points) {
            point.y++;
            grid.set(point.above(), SPACE.EMPTY);
            grid.set(point, SPACE.PLACING);
        }
    }

    public boolean checkBelow(Grid grid) {
        for (Coord point : points) {
            if (grid.get(point.below()) == SPACE.FULL) {
                return true;
            }
        }
        return false;
    }

    public void moveLeft(Grid grid) {
        for (Coord point : points) {
            if (grid.get(point.left()) == SPACE.FULL) {
                return;
            }
        }
        for (Coord point : points) {
            grid.set(point, SPACE.EMPTY);
            point.x--;
        }
        for (Coord point : points) {
            grid.set(point, SPACE.PLACING);
        }
    }

    public void moveRight(Grid grid) {
        for (Coord point : points) {
            if (grid.get(point.right()) == SPACE.FULL) {
                return;
            }
        }
        for (Coord point : points) {
            grid.set(point, SPACE.EMPTY);
            point.x++;
        }
        for (Coord point : points) {
            grid.set(point, SPACE.PLACING);
        }
    }

    public void place(Grid grid) {
        for (Coord point : points) {
            grid.set(point, SPACE.FULL);
        }
    }

}
