import { COLOUR_PROFILES } from './colour-profiles.js';
import { segment, classifyPixel, trackedKeyCentres, observeKeys, MIN_CORE_SCORE } from './vision.js';
import { fitPose } from './tracker.js';

export function analyseFrame(image, options = {}) {
  const choices = options.profile && options.profile !== 'auto' ? COLOUR_PROFILES.filter(p => p.id === options.profile) : COLOUR_PROFILES;
  let best = null;
  for (const profile of choices) {
    const calibration = { ...profile.calibration, ...options.calibration };
    let faceHint = null;
    if (options.core?.rgb && options.core.score > MIN_CORE_SCORE) {
      const colour = classifyPixel(...options.core.rgb, calibration);
      if (colour >= 0 && colour < 6) faceHint = { ...options.core, colour };
    }
    const labels = segment(image, calibration, faceHint);
    const fit = fitPose(labels, image.width, { ...options, faceHint });
    // Use unmodified segmentation for fallback evidence: the model's centre
    // hint must not manufacture the pixels that then confirm that same hint.
    const observation = observeKeys(faceHint ? segment(image, calibration) : labels, image.width, options.core, faceHint);
    const candidate = { ...(fit || { reliable: false, loss: Infinity, confidence: 0 }), profile: profile.id, coreHint: faceHint, labels,
      observation, centres: trackedKeyCentres(labels, image.width, fit, options.core) };
    if (!best || candidate.loss < best.loss || candidate.loss === best.loss &&
        candidate.observation.face !== null && best.observation.face === null) best = candidate;
  }
  return best;
}
