package Tetris;

import java.util.List;
import java.util.ArrayList;

public class Row {
    public List<SPACE> row = new ArrayList<>();

    public Row() {
        row.add(SPACE.FULL);
        for (int i = 0; i < Tetris.GRID_WIDTH; i++) {
            row.add(SPACE.EMPTY);
        }
        row.add(SPACE.FULL);
    }

    public SPACE get(int i) {
        return row.get(i);
    }

    public void set(int i, SPACE bool) {
        row.set(i, bool);
    }

    public void print() {
        for (int i = 1; i < Tetris.GRID_WIDTH + 1; i++) {
            if (row.get(i) == SPACE.PLACING) {
                System.out.print("0");
            } else if (row.get(i) == SPACE.FULL) {
                System.out.print("x");
            } else {
                System.out.print("#");
            }
        }
    }

    public boolean isFull() {
        for (SPACE space : row) {
            if (space == SPACE.EMPTY) {
                return false;
            }
        }
        return true;
    }
}
