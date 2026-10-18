package Tetris;

import java.util.Random;
import java.util.Scanner;

public class Tetris {
    static final int PIECE_SIZE = 4;
    static final int GRID_HEIGHT = 20;
    static final int GRID_WIDTH = 10;
    static int tick = 0;

    static Grid grid = new Grid();
    static Shape piece;
    static Scanner scanner = new Scanner(System.in);

    public static void main(String[] args) {
        gameLoop();
    }

    public static void gameLoop() {
        newShape();
        while (true) {
            turnTick(getInput());
            grid.print();
        }
    }

    public static void turnTick(Input direction) {
        if (piece.checkBelow(grid)) {
            piece.place(grid);
            grid.checkClears();
            newShape();
            return;
        }
        if (tick == 20) {
            tick = 0;
            piece.fall(grid);
        }
        if (direction != Input.DOWN) {
            tick++;
            if (direction == Input.LEFT) {
                piece.moveLeft(grid);
            } else if (direction == Input.RIGHT) {
                piece.moveRight(grid);
            }
        } else {
            tick = 20;
            turnTick(direction);
            return;
        }
    }

    public static void newShape() {
        Random random = new Random();
        piece = switch (random.nextInt(6)) {
            case 0 -> new Square();
            case 1 -> new Pipe();
            case 2 -> new L();
            case 3 -> new InverseL();
            case 4 -> new Z();
            case 5 -> new InverseZ();
            default -> throw new AssertionError();
        };
    }

    public static Input getInput() {
        return switch (scanner.next()) {
            case "a" -> Input.LEFT;
            case "s" -> Input.DOWN;
            case "d" -> Input.RIGHT;
            default -> null;
        };
    }
}
