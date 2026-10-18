package Tetris;

import java.util.List;
import java.util.ArrayList;

public class Grid {
    List<Row> rows = new ArrayList<>();

    public Grid() {
        for (int i = 0; i < Tetris.GRID_HEIGHT + 1; i++) {
            rows.add(new Row());
        }
        for (int i = 0; i < Tetris.GRID_WIDTH + 1; i++) {
            rows.get(Tetris.GRID_HEIGHT).set(i, SPACE.FULL);
        }
    }

    public SPACE get(Coord coord) {
        return rows.get(coord.y).get(coord.x);
    }

    public void set(Coord coord, SPACE space) {
        rows.get(coord.y).set(coord.x, space);
    }

    public void print() {
        for (int i = 0; i < Tetris.GRID_HEIGHT + 1; i++) {
            rows.get(i).print();
            System.out.println();
        }
    }

    public void checkClears() {
        for (int i = Tetris.GRID_HEIGHT - 1; i >= 0; i--) {
            if (rows.get(i).isFull()) {
                rows.remove(i);
                rows.add(0, new Row());
            }
        }
    }

}
