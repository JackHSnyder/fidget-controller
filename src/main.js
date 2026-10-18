import { createMenu } from './menu.js';
import { initializeTracking } from './tracking/controller.js';
import { initializeAudioClicks } from './audio/controller.js';

function initializeApplication() {
  const menu = createMenu();
  const audio = initializeAudioClicks();

  window.addEventListener('fidgetrotation', ({ detail }) => {
    menu.moveSelection(detail?.direction);
  });

  window.addEventListener('fidgetpress', ({ detail }) => menu.activateSelection(detail));

  initializeTracking({ onSourceChange: source => audio.setCameraActive(source === 'camera') });
}

initializeApplication();
