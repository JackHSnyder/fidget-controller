import { analyseFrame } from './frame-analysis.js';
import { makeModel } from './cube-model.js';
import { findToy } from './toy-search.js';
self.onmessage = ({ data }) => {
  try {
    const started = performance.now();
    if (data.type === 'search') {
      const found = findToy(data.image, { calibration: data.calibration, profile: data.profile, expectedWidth: data.expectedWidth });
      self.postMessage({ id: data.id, found, duration: performance.now() - started });
      return;
    }
    const result = analyseFrame(data.image, { previous: data.previous, acquire: data.acquire, model: makeModel(data.protrusion), principalX: data.principalX, principalY: data.principalY, profile: data.profile, calibration: data.calibration, core: data.core });
    self.postMessage({ id: data.id, result, duration: performance.now() - started });
  } catch (error) { self.postMessage({ id: data.id, error: error.message }); }
};
