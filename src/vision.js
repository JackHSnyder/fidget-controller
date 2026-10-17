import { COLOURS, project, transform } from './cube-model.js';

export const MIN_CORE_SCORE = .55;

export function rgbToHsv(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  let h = 0;
  if (delta) h = max === r ? 60 * (((g - b) / delta) % 6) : max === g ? 60 * ((b - r) / delta + 2) : 60 * ((r - g) / delta + 4);
  return { h: (h + 360) % 360, s: max ? delta / max : 0, v: max / 255 };
}

export function classifyPixel(r, g, b, calibration = {}) {
  const { h, s, v } = rgbToHsv(r, g, b);
  if (s < .22 && v > .22) return 6; // white core; not an active face
  if (s < .25 || v < .07) return -1;
  let best = -1, distance = Infinity;
  COLOURS.forEach((colour, index) => {
    const reference = calibration[colour.id];
    const hue = reference?.h ?? colour.hue;
    const dh = Math.min(Math.abs(h - hue), 360 - Math.abs(h - hue));
    const minimumSaturation = reference ? Math.max(.22, reference.s * .52) : index === 2 ? .72 : .3;
    if (s < minimumSaturation || dh > (reference ? 21 : 24)) return;
    // Hue is primary. Value is intentionally weak: a shaded blue is still blue.
    const score = dh / 24 + (reference ? Math.abs(s - reference.s) * .45 + Math.abs(Math.log(Math.max(v, .07) / reference.v)) * .55 : 0);
    if (score < distance) { best = index; distance = score; }
  });
  return best;
}

export function segment(image, calibration = {}, faceHint = null) {
  const { width, height, data } = image;
  const labels = new Int8Array(width * height);
  for (let i = 0; i < labels.length; i++) labels[i] = classifyPixel(data[i * 4], data[i * 4 + 1], data[i * 4 + 2], calibration);
  if (faceHint) {
    const half = faceHint.width * .36;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (Math.abs((x + .5) / width - faceHint.x) > half || Math.abs((y + .5) / height - faceHint.y) > half) continue;
      const i = y * width + x, hsv = rgbToHsv(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
      // The cap's centre and bevel are one physical key even if its paint makes
      // the two areas look like different blues. Do not overwrite neutral print.
      if (hsv.s > .25 && hsv.v > .10) labels[i] = faceHint.colour;
    }
  }
  // Remove isolated colour speckles; retain multiple regions of the same key.
  const visited = new Uint8Array(labels.length), queue = new Int32Array(labels.length);
  for (let start = 0; start < labels.length; start++) {
    if (visited[start] || labels[start] < 0 || labels[start] === 6) continue;
    const colour = labels[start]; let tail = 1; queue[0] = start; visited[start] = 1;
    for (let head = 0; head < tail; head++) {
      const i = queue[head], x = i % width;
      for (const j of [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, i - width, i + width]) {
        if (j >= 0 && j < labels.length && !visited[j] && labels[j] === colour) { visited[j] = 1; queue[tail++] = j; }
      }
    }
    if (tail < Math.max(3, labels.length * .0012)) {
      for (let i = 0; i < tail; i++) labels[queue[i]] = -1;
    }
  }
  return labels;
}

export function keyCentres(labels, size, anchor = { x: .5, y: .5 }, expected = null) {
  anchor ||= { x: .5, y: .5 };
  const result = Array(6).fill(null), scores = Array(6).fill(0);
  const visited = new Uint8Array(labels.length), queue = new Int32Array(labels.length);
  for (let start = 0; start < labels.length; start++) {
    const colour = labels[start];
    if (colour < 0 || colour >= 6 || visited[start]) continue;
    let tail = 1, sumX = 0, sumY = 0, border = false;
    queue[0] = start; visited[start] = 1;
    for (let head = 0; head < tail; head++) {
      const i = queue[head], x = i % size, y = Math.floor(i / size);
      sumX += x + .5; sumY += y + .5;
      if (!x || x === size - 1 || !y || y === size - 1) border = true;
      for (const j of [x ? i - 1 : -1, x < size - 1 ? i + 1 : -1, i - size, i + size]) {
        if (j >= 0 && j < labels.length && labels[j] === colour && !visited[j]) { visited[j] = 1; queue[tail++] = j; }
      }
    }
    const x = sumX / tail / size, y = sumY / tail / size, distance = Math.hypot(x - anchor.x, y - anchor.y);
    if (tail < 3 || tail > labels.length * .3 || border && tail > labels.length * .035 || distance > .6) continue;
    const predicted = expected?.[colour];
    if (expected && (!predicted || Math.hypot(x - predicted[0], y - predicted[1]) > .2)) continue;
    const score = predicted ? tail / (1 + (Math.hypot(x - predicted[0], y - predicted[1]) / .1) ** 2) : tail / (1 + (distance / .4) ** 4);
    if (score > scores[colour]) { scores[colour] = score; result[colour] = [x, y]; }
  }
  return result;
}

export function trackedKeyCentres(labels, size, fit, anchor) {
  if (!fit?.reliable) return Array(6).fill(null);
  const expected = COLOURS.map(colour => {
    if (transform(fit.pose.r, colour.normal)[2] > .45) return null;
    return project(colour.normal.map(v => v * 1.6), fit.pose, size).slice(0, 2).map(v => v / size);
  });
  return keyCentres(labels, size, anchor, expected);
}

// Independent observations survive a failed 3D fit. Require a freshly detected
// white frame; never interpret an arbitrary colour blob as the toy's centre.
export function observeKeys(labels, size, core, faceHint = null) {
  const empty = { centres: Array(6).fill(null), face: null };
  if (!(core?.score > MIN_CORE_SCORE && core.width > 0)) return empty;
  const centres = keyCentres(labels, size, core).map(p =>
    p && Math.hypot(p[0] - core.x, p[1] - core.y) / core.width < 1.6 ? p : null);
  let face = null;
  if (faceHint) {
    const p = centres[faceHint.colour];
    let paint = 0, area = 0;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (Math.abs((x + .5) / size - core.x) > core.width * .28 ||
          Math.abs((y + .5) / size - core.y) > core.width * .28) continue;
      area++;
      if (labels[y * size + x] === faceHint.colour) paint++;
    }
    // Corroborate the independent paint samples with actual central pixels
    // and a central component. A side key alone cannot become the active face.
    if (p && Math.hypot(p[0] - core.x, p[1] - core.y) < core.width * .32 &&
        area >= 4 && paint / area > .45) face = faceHint.colour;
  }
  return { centres, face };
}

// Chamfer distance gives the pose search a gradient even before masks overlap.
export function distanceMaps(labels, size) {
  return COLOURS.map((_, colour) => {
    const d = Float32Array.from(labels, label => label === colour ? 0 : size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = y * size + x;
      if (x) d[i] = Math.min(d[i], d[i - 1] + 1);
      if (y) d[i] = Math.min(d[i], d[i - size] + 1);
      if (x && y) d[i] = Math.min(d[i], d[i - size - 1] + 1.414);
      if (x < size - 1 && y) d[i] = Math.min(d[i], d[i - size + 1] + 1.414);
    }
    for (let y = size - 1; y >= 0; y--) for (let x = size - 1; x >= 0; x--) {
      const i = y * size + x;
      if (x < size - 1) d[i] = Math.min(d[i], d[i + 1] + 1);
      if (y < size - 1) d[i] = Math.min(d[i], d[i + size] + 1);
      if (x < size - 1 && y < size - 1) d[i] = Math.min(d[i], d[i + size + 1] + 1.414);
      if (x && y < size - 1) d[i] = Math.min(d[i], d[i + size - 1] + 1.414);
    }
    return d;
  });
}

// Locate the neutral core independently of coloured key fitting. This keeps a
// failed pose from freezing the search box while the real toy continues moving.
export function locateCore({ data, width, height }, { wide = false, relaxed = false, accept = null } = {}) {
  const stride = width + 1, sums = new Int32Array(stride * (height + 1));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x, hsv = rgbToHsv(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
    const skin = (hsv.h < 50 || hsv.h > 315) && hsv.s > .09;
    const neutral = !skin && hsv.s < .3 && hsv.v > .44 ? 1 : 0;
    const k = (y + 1) * stride + x + 1;
    sums[k] = neutral + sums[k - 1] + sums[k - stride] - sums[k - stride - 1];
  }
  const average = (x, y, w, h) => (sums[(y + h) * stride + x + w] - sums[y * stride + x + w] - sums[(y + h) * stride + x] + sums[y * stride + x]) / (w * h);
  let best = null;
  // Look for a neutral frame around a coloured centre, not simply the largest
  // pale blob (which can be a hand or the wall). No symbols are recognised.
  const minimum = wide ? 6 : Math.round(width * (relaxed ? .10 : .16));
  const maximum = wide ? Math.min(width, height) * .65 : width * (relaxed ? .5 : .4);
  for (let side = minimum; side <= maximum; side += wide ? Math.max(1, Math.round(side * .14)) : 1) {
    const band = Math.max(1, Math.round(side * .12));
    const inset = wide || relaxed ? Math.ceil(side / 2) : null;
    for (let cy = inset ?? Math.round(height * .22); cy < (inset === null ? height * .78 : height - inset); cy += wide ? 2 : 1) for (let cx = inset ?? Math.round(width * .22); cx < (inset === null ? width * .78 : width - inset); cx += wide ? 2 : 1) {
      const x = cx - Math.floor(side / 2), y = cy - Math.floor(side / 2);
      if (x < 0 || y < 0 || x + side > width || y + side > height) continue;
      const inner = average(x + band, y + band, side - 2 * band, side - 2 * band);
      if (inner > (relaxed ? .68 : .55)) continue;
      const edges = [average(x, y, side, band), average(x, y + side - band, side, band), average(x, y, band, side), average(x + side - band, y, band, side)];
      const border = edges.reduce((a, b) => a + b, 0) / 4, weakest = Math.min(...edges);
      if (border < (relaxed ? .35 : .45) || weakest < (relaxed ? .08 : .2)) continue;
      const score = border - inner * .6 + weakest * .3 - (wide ? 0 : 2 * ((cx / width - .5) ** 2 + (cy / height - .5) ** 2)) - (wide ? 0 : .08 * Math.log(side / width / .25) ** 2);
      if (score > .5 && (!best || score > best.score)) {
        const candidate = { x: cx / width, y: cy / height, width: side / width, height: side / height, extent: side / width, score };
        if (!accept || accept(candidate)) best = candidate;
      }
    }
  }
  if (best) {
    const channels = [[], [], []], half = Math.max(1, best.width * width * .045);
    // Four paint samples avoid the printed centre icon, whose contrasting ink
    // otherwise makes a light-blue key look dark blue (and vice versa).
    for (const dx of [-.2, .2]) for (const dy of [-.2, .2]) {
      const cx = (best.x + dx * best.width) * width, cy = (best.y + dy * best.height) * height;
      for (let y = Math.max(0, Math.floor(cy - half)); y < Math.min(height, cy + half); y++) {
        for (let x = Math.max(0, Math.floor(cx - half)); x < Math.min(width, cx + half); x++) {
        const i = (y * width + x) * 4, hsv = rgbToHsv(data[i], data[i + 1], data[i + 2]);
        if (hsv.s < .25 || hsv.v < .15) continue;
        for (let c = 0; c < 3; c++) channels[c].push(data[i + c]);
        }
      }
    }
    if (channels[0].length >= 6) best.rgb = channels.map(values => values.sort((a, b) => a - b)[Math.floor(values.length / 2)]);
  }
  return best;
}
