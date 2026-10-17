import { COLOUR_PROFILES } from './colour-profiles.js';
import { locateCore, segment, keyCentres, exposureCalibration } from './vision.js';
import { fitPose } from './tracker.js';
import { COLOURS } from './cube-model.js';

function seededPose(front, centres, choice = 0) {
  const normal = COLOURS[front].normal;
  const side = centres.map((point, index) => ({ point, index }))
    .filter(({ point, index }) => point && COLOURS[index].normal.reduce((sum, n, i) => sum + n * normal[i], 0) === 0)
    .sort((a, b) => Math.abs(Math.hypot(a.point[0] - .5, a.point[1] - .5) - .32) - Math.abs(Math.hypot(b.point[0] - .5, b.point[1] - .5) - .32))[choice];
  if (!side) return null;
  const n = COLOURS[side.index].normal;
  const cross = [normal[1] * n[2] - normal[2] * n[1], normal[2] * n[0] - normal[0] * n[2], normal[0] * n[1] - normal[1] * n[0]];
  const dx = side.point[0] - .5, dy = side.point[1] - .5, length = Math.hypot(dx, dy);
  if (length < .1) return null;
  const s = [dx / length, dy / length, 0], t = [s[1], -s[0], 0], z = [0, 0, -1];
  const r = s.flatMap((v, i) => n.map((value, j) => v * value + t[i] * cross[j] + z[i] * normal[j]));
  return { x: .5, y: .5, scale: 1 / 6.4, depth: 12, principalX: .5, principalY: .5, r };
}

// Full-frame search has no dependency on the old tracking box. Geometry uses
// square pixels even on a landscape/portrait camera; normalised x/y differ.
export function findToy(image, { calibration = {}, profile = 'auto', expectedWidth = null } = {}) {
  const profiles = profile === 'auto' ? COLOUR_PROFILES : COLOUR_PROFILES.filter(p => p.id === profile);
  return locateCore(image, { wide: true, accept(core) {
    if (core.score < .7) return false;
    if (expectedWidth && (core.width < expectedWidth * .45 || core.width > expectedWidth * 2.5)) return false;
    const side = core.width * image.width * 3.2;
    const left = core.x * image.width - side / 2, top = core.y * image.height - side / 2;
    const size = 48, data = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const sx = Math.floor(left + (x + .5) * side / size), sy = Math.floor(top + (y + .5) * side / size);
      if (sx < 0 || sx >= image.width || sy < 0 || sy >= image.height) continue;
      const i = (sy * image.width + sx) * 4;
      data.set(image.data.subarray(i, i + 4), (y * size + x) * 4);
    }
    return profiles.some(p => {
      const labels = segment({ data, width: size, height: size }, exposureCalibration({ ...p.calibration, ...calibration }, core.whiteValue));
      const centres = keyCentres(labels, size);
      // Verify several nearby colours and their geometric arrangement. Local
      // tracking is more permissive; moving the box anywhere in the camera
      // needs stronger evidence to avoid latching onto hands or clothing.
      const central = centres.findIndex(point => point && Math.hypot(point[0] - .5, point[1] - .5) < .12);
      const nearby = centres.filter(point => point && Math.hypot(point[0] - .5, point[1] - .5) < .48);
      if (central < 0 || nearby.length < 3) return false;
      for (const choice of [0, 1]) {
        const previous = seededPose(central, centres, choice);
        if (!previous) continue;
        const fit = fitPose(labels, size, { previous, coarse: false, faceHint: { colour: central } });
        if (fit?.reliable && Math.hypot(fit.pose.x - .5, fit.pose.y - .5) < .12) return true;
      }
      return false;
    });
  } });
}

export function placeSearchResult(found, imageWidth, imageHeight, oldRegion) {
  const x = found.x * imageWidth, y = found.y * imageHeight;
  const extent = found.width * imageWidth;
  const side = Math.min(Math.max(60, extent * 3.2), Math.max(imageWidth, imageHeight));
  const moved = !oldRegion || Math.hypot(x - oldRegion.x - oldRegion.side / 2,
    y - oldRegion.y - oldRegion.side / 2) > oldRegion.side * .45;
  return { region: { x: x - side / 2, y: y - side / 2, side }, moved };
}
