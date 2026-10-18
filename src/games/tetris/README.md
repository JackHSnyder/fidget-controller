# Java Tetris conversion

Each Java source in the original `Tetris/` folder has a corresponding ES module
here. Class names, point ordering, grid walls/floor, six-shape selection,
gravity counter, DOWN behaviour, and row-clearing iteration are preserved.
`constants.js` shares dimensions without circular imports. Java enums become
frozen objects and lists become arrays. Each `Tetris` instance owns the original
static game state.

`tetris-page.js` imports `Tetris.js` directly and creates `new Tetris({ onUpdate })`.
The class owns the 50 ms timer, input queue, state snapshots, and original rules;
there is no separate `tetris.js` wrapper. Use `start()`, `stop()`, `handleAction()`,
`update()`, and `getState()` on that instance.
On each update the class passes left/right rotation actions as movement, down
rotation as a one-row soft drop, and press actions as a hard drop to `turnTick()`.
The original `getInput()` parser remains available to the console loop. With no
mapped input the class makes one neutral turn to advance
gravity. Multiple mapped inputs make multiple original turns in arrival order.
`getState().tick` counts elapsed updates (`totalTicks`); the original `tick`
property remains the gravity counter used by `turnTick()`.

The returned `board` is the playable 20-by-10 area, excluding wall and floor
cells. Cells contain `SPACE.EMPTY`, `SPACE.FULL`, or `SPACE.PLACING` strings
(rather than the previous scaffold's `null`). `renderer.js` renders these cells
as the 10-by-20 board on `tetris.html`, called by `tetris-page.js` through
`onUpdate`. Orange cells are the active piece; green cells are placed blocks.
The page starts the shared camera/microphone controller automatically and forwards
its rotation and press events. Rendering does not change the game rules.
Tetris has no return-to-menu gesture. Up turns are ignored, and a following key
press still hard drops. Inputs received while the page is hidden are ignored.

DOWN is the original recursive hard drop; SOFT_DOWN moves one row. UP and
clockwise/anticlockwise have no assigned gameplay operation. No shape rotation,
extra shapes, scoring, or game-over rules were added.
The source's delayed initial drawing and single-pass row-clearing behaviour
are also unchanged.

For console-style use, `Tetris.main(readInput)` / `game.gameLoop(readInput)`
accept a function returning an input token (or a Promise for one). Returning
`undefined` ends input. Browser use calls `start()` instead of that console loop.
Console printing uses `console.log()`.
