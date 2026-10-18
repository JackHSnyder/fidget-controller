import { createMenu } from './menu.js';
import { initializeFidgetController } from './fidget-controller.js';

function initializeApplication() {
  const menu = createMenu();

  window.addEventListener('fidgetrotation', ({ detail }) => {
    menu.moveSelection(detail?.direction);
  });

  window.addEventListener('fidgetpress', ({ detail }) => menu.activateSelection(detail));

  initializeFidgetController();
}

initializeApplication();
