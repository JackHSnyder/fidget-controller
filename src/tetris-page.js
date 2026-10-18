import './style.css';
import './tetris.css';
import { Tetris } from './games/tetris/Tetris.js';
import { createTetrisRenderer } from './games/tetris/renderer.js';
import { initializeFidgetController } from './fidget-controller.js';
import { initializeLoopingMusic } from './audio/looping-music.js';

function initializeApplication() {
  initializeLoopingMusic({
    audio: document.getElementById('tetris-music'),
    status: document.getElementById('tetris-music-status'),
    src: `${import.meta.env.BASE_URL}audio/tetris.mp3`,
  });
  const render = createTetrisRenderer(document.getElementById('tetris-board'));
  const tetris = new Tetris({
    onUpdate({ tick, board }) {
      document.getElementById('tetris-tick').textContent = String(tick);
      render(board);
    },
  });
  render(tetris.getState().board);

  window.addEventListener('fidgetrotation', ({ detail }) => {
    if (document.hidden) return;
    const direction = detail?.direction;

    if (['left', 'right', 'down'].includes(direction)) {
      tetris.handleAction({ type: 'rotation', direction });
    }
  });

  window.addEventListener('fidgetpress', ({ detail }) => {
    if (detail && !document.hidden) {
      tetris.handleAction({ type: 'press' });
    }
  });

  initializeFidgetController();

  // Inputs and timers belong to this game instance, not the menu.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) tetris.stop();
    else tetris.start();
  });
  window.addEventListener('pagehide', () => tetris.stop());
  window.addEventListener('pageshow', () => { if (!document.hidden) tetris.start(); });
  if (!document.hidden) tetris.start();
  return tetris;
}

initializeApplication();
