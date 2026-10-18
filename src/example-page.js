import './style.css';
import { initializeFidgetController } from './fidget-controller.js';
import { createCubeNavigation } from './cube-navigation.js';

const navigation = createCubeNavigation(document.getElementById('cube-navigation'));
window.addEventListener('fidgetrotation', ({ detail }) => navigation.handleRotation(detail?.direction));
window.addEventListener('fidgetpress', ({ detail }) => { if (detail) navigation.handlePress(); });
initializeFidgetController();
