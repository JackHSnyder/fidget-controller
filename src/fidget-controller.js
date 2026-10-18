import { mountControllerPanel } from './controller-panel.js';
import { initializeTracking } from './tracking/controller.js';
import { initializeAudioClicks } from './audio/controller.js';

export function initializeFidgetController() {
  const container = document.getElementById('fidget-controller');
  if (container) mountControllerPanel(container, { detailed: container.dataset.detailed === 'true' });
  const audio = initializeAudioClicks({ autoStart: true });
  const tracking = initializeTracking({ autoStart: true,
    onSourceChange: source => audio.setCameraActive(source === 'camera') });
  return { tracking, audio };
}
