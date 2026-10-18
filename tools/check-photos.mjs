// Opt-in evaluation of temporary RGB crops produced by prepare-photo-check.py.
import { readFile } from 'node:fs/promises';
import { segment } from '../src/tracking/vision.js';
import { fitPose } from '../src/tracking/tracker.js';
import { FACE_MARGIN, MIN_FACING } from '../src/tracking/cube-model.js';
const frames = JSON.parse(await readFile(process.argv[2], 'utf8'));
let failed = false;
for (const frame of frames) {
  const labels = segment({ width: 48, height: 48, data: frame.rgba });
  const start = performance.now(), result = fitPose(labels, 48, { principalX: frame.principalX, principalY: frame.principalY });
  console.log(JSON.stringify({ photo: frame.name, expected: frame.expected, detected: result?.face.colour.id, reliable: result?.reliable, loss: result?.loss, overlap: result?.overlap, margin: result?.face.margin, facing: result?.face.facing, milliseconds: performance.now() - start }));
  if (!result?.reliable || result.face.colour.id !== frame.expected || result.face.margin < FACE_MARGIN || result.face.facing < MIN_FACING) failed = true;
}
process.exitCode = failed ? 1 : 0;
