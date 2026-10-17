import { COLOUR_PROFILES } from './colour-profiles.js';
import { segment, classifyPixel, trackedKeyCentres, observeKeys, MIN_CORE_SCORE, exposureCalibration } from './vision.js';
import { fitPose } from './tracker.js';

export function analyseFrame(image, options = {}) {
  const choices = options.profile && options.profile !== 'auto' ? COLOUR_PROFILES.filter(p => p.id === options.profile) : COLOUR_PROFILES;
  let best = null;
  for (const profile of choices) {
    const calibration = exposureCalibration({ ...profile.calibration, ...options.calibration }, options.core?.whiteValue);
    let faceHint = null;
    if (options.core?.rgb && options.core.score > MIN_CORE_SCORE) {
      const colour = classifyPixel(...options.core.rgb, calibration);
      if (colour >= 0 && colour < 6) faceHint = { ...options.core, colour };
    }
    const rawLabels = segment(image, calibration);
    const observation = observeKeys(rawLabels, image.width, options.core, faceHint);
    // Printed symbols and fingers can contaminate the four paint samples.
    // Only constrain geometry when the independent central pixels agree.
    if (observation.face === null) faceHint = null;
    const labels = faceHint ? segment(image, calibration, faceHint) : rawLabels;
    const fit = fitPose(labels, image.width, { ...options, faceHint });
    // Use unmodified segmentation for fallback evidence: the model's centre
    // hint must not manufacture the pixels that then confirm that same hint.
    const candidate = { ...(fit || { reliable: false, loss: Infinity, confidence: 0 }), profile: profile.id, coreHint: faceHint, labels,
      observation, centres: trackedKeyCentres(labels, image.width, fit, options.core) };
    const score = value => value.loss - (value.reliable ? .08 : 0) - (value.observation.face !== null ? .10 : 0);
    if (!best || score(candidate) < score(best)) best = candidate;
  }
  return best;
}
