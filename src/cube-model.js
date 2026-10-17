// Camera coordinates: x right, y down, z away from the camera. Unmirrored.
export const FACE_MARGIN = .07;
export const MIN_FACING = .6;
export const COLOURS = [
  { id: 'pink', name: 'Pink', hex: '#ee4279', hue: 344, normal: [0, 0, 1] },
  { id: 'purple', name: 'Purple', hex: '#9356c0', hue: 274, normal: [0, -1, 0] },
  { id: 'orange', name: 'Orange', hex: '#f57625', hue: 20, normal: [-1, 0, 0] },
  { id: 'green', name: 'Green', hex: '#86bc48', hue: 94, normal: [0, 0, -1] },
  { id: 'light-blue', name: 'Light blue', hex: '#2fafd5', hue: 197, normal: [1, 0, 0] },
  { id: 'dark-blue', name: 'Dark blue', hex: '#334683', hue: 229, normal: [0, 1, 0] },
];

export const identity = () => [1, 0, 0, 0, 1, 0, 0, 0, 1];
export const transform = (r, p) => [0, 1, 2].map(i => r[i * 3] * p[0] + r[i * 3 + 1] * p[1] + r[i * 3 + 2] * p[2]);
export function multiply(a, b) {
  return Array.from({ length: 9 }, (_, i) => {
    const row = Math.floor(i / 3), col = i % 3;
    return a[row * 3] * b[col] + a[row * 3 + 1] * b[col + 3] + a[row * 3 + 2] * b[col + 6];
  });
}
export const transpose = r => [r[0], r[3], r[6], r[1], r[4], r[7], r[2], r[5], r[8]];
export function rotation(axis, angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return axis === 0 ? [1, 0, 0, 0, c, -s, 0, s, c]
    : axis === 1 ? [c, 0, s, 0, 1, 0, -s, 0, c] : [c, -s, 0, s, c, 0, 0, 0, 1];
}

// Closed geometry includes keycap side walls, not just six flat coloured squares.
// Dimensions are ratios of the core's half-width, adjustable in the UI.
export function makeModel(protrusion = .85) {
  const polygons = [];
  const ring = (n, radius, half) => {
    const axis = n.findIndex(v => v !== 0), others = [0, 1, 2].filter(i => i !== axis);
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => {
      const p = n.map(v => v * radius);
      p[others[0]] = a * half; p[others[1]] = b * half;
      return p;
    });
  };
  for (const colour of COLOURS) {
    polygons.push({ colour: 6, vertices: ring(colour.normal, 1, 1) });
  }
  COLOURS.forEach(({ normal }, colour) => {
    const bottom = ring(normal, 1 + protrusion * .52, .79);
    const top = ring(normal, 1 + protrusion, .65);
    polygons.push({ colour, vertices: top }, { colour, vertices: [...bottom].reverse() });
    for (let i = 0; i < 4; i++) polygons.push({ colour, vertices: [bottom[i], bottom[(i + 1) % 4], top[(i + 1) % 4], top[i]] });
  });
  return polygons;
}

export function project(point, pose, size) {
  const p = transform(pose.r, point);
  const denominator = 1 + p[2] / pose.depth;
  const cx = pose.principalX ?? .5, cy = pose.principalY ?? .5;
  return [size * (cx + (pose.x - cx + pose.scale * p[0]) / denominator), size * (cy + (pose.y - cy + pose.scale * p[1]) / denominator), p[2]];
}

// Small software z-buffer: hidden keys cannot vote as front-facing colours.
export function renderModel(model, pose, size = 48) {
  const labels = new Int8Array(size * size).fill(-1);
  const depth = new Float32Array(size * size).fill(Infinity);
  for (const polygon of model) {
    const points = polygon.vertices.map(p => project(p, pose, size));
    for (let k = 1; k < points.length - 1; k++) {
      const [a, b, c] = [points[0], points[k], points[k + 1]];
      const area = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
      if (Math.abs(area) < .01) continue;
      const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), maxX = Math.min(size - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
      const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), maxY = Math.min(size - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
      for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
        const u = ((b[1] - c[1]) * (x + .5 - c[0]) + (c[0] - b[0]) * (y + .5 - c[1])) / area;
        const v = ((c[1] - a[1]) * (x + .5 - c[0]) + (a[0] - c[0]) * (y + .5 - c[1])) / area;
        if (u < 0 || v < 0 || u + v > 1) continue;
        // Perspective-correct camera depth; constant offset cancels ordering.
        const z = 1 / (u / (pose.depth + a[2]) + v / (pose.depth + b[2]) + (1 - u - v) / (pose.depth + c[2]));
        const i = y * size + x;
        if (z < depth[i]) { depth[i] = z; labels[i] = polygon.colour; }
      }
    }
  }
  return labels;
}

export function frontFace(pose) {
  // Account for an off-axis object centre, not just optical-axis z.
  const view = [((pose.principalX ?? .5) - pose.x) / pose.scale / pose.depth, ((pose.principalY ?? .5) - pose.y) / pose.scale / pose.depth, -1];
  const length = Math.hypot(...view);
  const faces = COLOURS.map((colour, index) => {
    const n = transform(pose.r, colour.normal);
    return { index, colour, facing: n.reduce((sum, v, i) => sum + v * view[i] / length, 0) };
  }).sort((a, b) => b.facing - a.facing);
  return { ...faces[0], margin: faces[0].facing - faces[1].facing };
}

export function rotationBetween(from, to) {
  const delta = multiply(to, transpose(from));
  const angle = Math.acos(Math.max(-1, Math.min(1, (delta[0] + delta[4] + delta[8] - 1) / 2)));
  const vector = [delta[7] - delta[5], delta[2] - delta[6], delta[3] - delta[1]];
  const length = Math.hypot(...vector);
  if (angle < .12 || length < 1e-5) return { direction: 'uncertain', angle: angle * 180 / Math.PI };
  const axis = vector.map(v => v / length);
  const absolute = axis.map(Math.abs), dominant = absolute.indexOf(Math.max(...absolute));
  const ordered = [...absolute].sort((a, b) => b - a);
  if (ordered[0] < .8 || ordered[0] - ordered[1] < .3) return { direction: 'diagonal', angle: angle * 180 / Math.PI };
  // Direction = where the old front face moves in the unmirrored image.
  const direction = dominant === 0 ? (axis[0] > 0 ? 'down' : 'up')
    : dominant === 1 ? (axis[1] > 0 ? 'left' : 'right')
      : (axis[2] > 0 ? 'clockwise' : 'anticlockwise');
  return { direction, angle: angle * 180 / Math.PI };
}
