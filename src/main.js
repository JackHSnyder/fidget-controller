import './style.css';
import './menu.js';
import { COLOURS, FACE_MARGIN, MIN_FACING, makeModel, project, rotationBetween } from './cube-model.js';
import { locateCore, rgbToHsv, MIN_CORE_SCORE } from './vision.js';
import { placeSearchResult } from './toy-search.js';
import { RotationEvents } from './tracker.js';
import { ScreenTurnEvents } from './screen-turns.js';
import { mirrorTurn, previewToSource } from './mirrored-view.js';

const $ = id => document.getElementById(id);
const video = $('camera'), preview = $('preview'), ctx = preview.getContext('2d');
const sample = document.createElement('canvas'); sample.width = sample.height = 48;
const sampleCtx = sample.getContext('2d', { willReadFrequently: true });
const pixelCanvas = document.createElement('canvas'); pixelCanvas.width = pixelCanvas.height = 9;
const pixelCtx = pixelCanvas.getContext('2d', { willReadFrequently: true });
const worker = new Worker(new URL('./tracking-worker.js', import.meta.url), { type: 'module' });
const searchWorker = new Worker(new URL('./tracking-worker.js', import.meta.url), { type: 'module' });
const transitions = new ScreenTurnEvents(), rollTransitions = new RotationEvents();
const coreCanvas = document.createElement('canvas'); coreCanvas.width = coreCanvas.height = 96;
const coreCtx = coreCanvas.getContext('2d', { willReadFrequently: true });
const searchCanvas = document.createElement('canvas');
const searchCtx = searchCanvas.getContext('2d', { willReadFrequently: true });
let stream = null, photo = null, fileUrl = null, generation = 0, busy = false, job = null;
let roi = null, pose = null, fitted = null, drag = null, calibrationColour = null;
let lastSample = 0, lastVideoTime = -1, lastAcquire = -Infinity, lastAccepted = -Infinity;
let selecting = false, running = false, photoDirty = false, eventLog = [];
let minimumRegion = 70, lastCore = null;
let lastSearch = -Infinity;
let lastVisualConfirmation = -Infinity;
let searchBusy = false, searchJob = null;
let expectedExtent = null;
let calibration = {};
let latestWhiteValue = null, activeProfile = null;
try {
  const saved = JSON.parse(localStorage.getItem('fidget-colours-v1') || '{}');
  for (const colour of COLOURS) {
    const value = saved?.[colour.id];
    if (value && [value.h, value.s, value.v].every(Number.isFinite)) calibration[colour.id] = value;
  }
} catch { /* Storage can be disabled. */ }

function message(text) { $('status').textContent = text; }
function storeCalibration() {
  try { localStorage.setItem('fidget-colours-v1', JSON.stringify(calibration)); } catch { /* Session calibration still works. */ }
}
function paintCalibration() {
  for (const button of $('calibration').children) {
    button.classList.toggle('sampled', Boolean(calibration[button.dataset.colour]));
    button.setAttribute('aria-pressed', String(calibrationColour === button.dataset.colour));
  }
}
for (const colour of COLOURS) {
  const button = document.createElement('button'); button.type = 'button'; button.dataset.colour = colour.id;
  button.style.setProperty('--swatch', colour.hex); button.textContent = colour.name;
  button.addEventListener('click', () => {
    calibrationColour = colour.id; selecting = false; paintCalibration();
    message(`Click the coloured plastic of the ${colour.name.toLowerCase()} key. Avoid its symbol and highlights.`);
  });
  $('calibration').append(button);
}
paintCalibration();

function resetTracking() {
  generation++; latestWhiteValue = null; activeProfile = null; pose = null; fitted = null; transitions.reset(); rollTransitions.reset(); lastCore = null;
  lastAcquire = -Infinity; lastAccepted = -Infinity; lastVideoTime = -1; photoDirty = true;
  lastSearch = -Infinity;
  lastVisualConfirmation = performance.now();
  expectedExtent = roi ? roi.side / 3.2 : null;
  $('active').textContent = 'Waiting'; $('confidence').textContent = '—';
  window.dispatchEvent(new CustomEvent('fidgetface', { detail: { colour: null, confidence: 0, time: performance.now() } }));
}
function releaseSource() {
  running = false; generation++; transitions.reset(); rollTransitions.reset(); pose = null; fitted = null;
  stream?.getTracks().forEach(track => track.stop()); stream = null;
  video.pause(); video.srcObject = null; video.removeAttribute('src'); video.load();
  if (fileUrl) URL.revokeObjectURL(fileUrl);
  fileUrl = null; photo = null;
  $('replay').hidden = true;
}
function initialiseSource() {
  const source = photo || video;
  const width = source.naturalWidth || source.videoWidth, height = source.naturalHeight || source.videoHeight;
  preview.width = Math.min(960, width); preview.height = Math.round(preview.width * height / width);
  const side = Math.min(width, height) * .6;
  roi = { x: (width - side) / 2, y: (height - side) / 2, side };
  resetTracking(); running = true; selecting = true; $('empty').hidden = true;
  $('stop').disabled = false; $('select').disabled = false;
  message('Drag a box around the entire toy, including all protruding keys. Leave a small margin.');
}
$('start').addEventListener('click', async () => {
  releaseSource(); const request = generation; $('start').disabled = true;
  try {
    const cameraStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { width: { ideal: 1280 }, height: { ideal: 720 } } });
    if (request !== generation) { cameraStream.getTracks().forEach(track => track.stop()); return; }
    stream = cameraStream; video.srcObject = stream; await video.play();
    if (request !== generation) return;
    initialiseSource();
    stream.getVideoTracks()[0].addEventListener('ended', () => { if (stream === cameraStream) stop(); });
  } catch (error) { if (request === generation) message(`Could not open camera: ${error.message}`); }
  finally { $('start').disabled = false; }
});
function stop() {
  releaseSource(); $('stop').disabled = true; $('active').textContent = 'Stopped';
  message('Stopped. Start the camera or load a photo / video.');
  window.dispatchEvent(new CustomEvent('fidgetface', { detail: { colour: null, confidence: 0, time: performance.now() } }));
}
$('stop').addEventListener('click', stop);
$('select').addEventListener('click', () => {
  resetTracking(); selecting = true; calibrationColour = null; paintCalibration();
  message('Drag around the entire toy, including the side keys.');
});
$('sourceFile').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  releaseSource(); const request = generation; fileUrl = URL.createObjectURL(file);
  try {
    if (file.type.startsWith('image/')) {
      const image = new Image(); image.src = fileUrl; await image.decode();
      if (request !== generation) return; photo = image;
    } else if (file.type.startsWith('video/')) {
      video.src = fileUrl; video.loop = false; await video.play(); video.pause();
      if (request !== generation) return;
    } else throw new Error('Choose an image or video file.');
    initialiseSource();
    if (!photo) { $('replay').hidden = false; $('seek').max = String(video.duration); $('playReplay').textContent = 'Play video'; }
  } catch (error) { if (request === generation) message(`Could not load file: ${error.message}`); }
  event.target.value = '';
});
video.addEventListener('ended', () => { transitions.reset(); rollTransitions.reset(); $('playReplay').textContent = 'Play video'; message('Video ended. Use the replay controls to review it.'); });
$('playReplay').addEventListener('click', async () => {
  if (video.paused) { if (video.ended) { video.currentTime = 0; resetTracking(); } await video.play(); $('playReplay').textContent = 'Pause video'; }
  else { video.pause(); $('playReplay').textContent = 'Play video'; }
});
$('seek').addEventListener('input', () => { video.pause(); video.currentTime = Number($('seek').value); resetTracking(); $('playReplay').textContent = 'Play video'; });
video.addEventListener('timeupdate', () => { if (!stream) { $('seek').value = String(video.currentTime); $('replayTime').textContent = `${video.currentTime.toFixed(1)} / ${video.duration.toFixed(1)} s`; } });
$('clearCalibration').addEventListener('click', () => { calibration = {}; calibrationColour = null; storeCalibration(); paintCalibration(); resetTracking(); message('Using default colours. Sample each key if your lighting changes its appearance.'); });
$('geometry').addEventListener('change', () => { resetTracking(); });
$('profile').addEventListener('change', () => { resetTracking(); });
$('clearEvents').addEventListener('click', () => { eventLog = []; $('events').replaceChildren(); transitions.reset(); rollTransitions.reset(); $('direction').textContent = 'No turn yet'; });
$('download').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify({ directionConvention: 'Movement of previous front face in horizontally mirrored camera preview', events: eventLog }, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = 'fidget-rotations.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});

function sourceSize() { return photo ? [photo.naturalWidth, photo.naturalHeight] : [video.videoWidth, video.videoHeight]; }
// Keep tracking behaviour independent of the camera's capture resolution.
function minimumBoxSize() { return Math.max(35, Math.min(...sourceSize()) / 6); }
function pointer(event) {
  const rect = preview.getBoundingClientRect(), [width, height] = sourceSize();
  return previewToSource(event.clientX, event.clientY, rect, width, height);
}
preview.addEventListener('pointerdown', event => {
  if (!running) return;
  const p = pointer(event);
  if (calibrationColour) {
    const [width, height] = sourceSize();
    pixelCtx.drawImage(photo || video, Math.max(0, Math.min(width - 9, p.x - 4)), Math.max(0, Math.min(height - 9, p.y - 4)), 9, 9, 0, 0, 9, 9);
    const data = pixelCtx.getImageData(0, 0, 9, 9).data, samples = [];
    for (let i = 0; i < data.length; i += 4) { const hsv = rgbToHsv(data[i], data[i + 1], data[i + 2]); if (hsv.s > .25 && hsv.v > .08) samples.push(hsv); }
    if (samples.length < 10) { message('That sample is too neutral or dark. Click an unprinted coloured area.'); return; }
    const sin = samples.reduce((n, v) => n + Math.sin(v.h * Math.PI / 180), 0), cos = samples.reduce((n, v) => n + Math.cos(v.h * Math.PI / 180), 0);
    calibration[calibrationColour] = { whiteValue: latestWhiteValue, h: (Math.atan2(sin, cos) * 180 / Math.PI + 360) % 360, s: samples.reduce((n, v) => n + v.s, 0) / samples.length, v: samples.reduce((n, v) => n + v.v, 0) / samples.length };
    calibrationColour = null; storeCalibration(); paintCalibration(); resetTracking(); message('Colour sample saved on this browser.'); return;
  }
  if (!selecting) return;
  preview.setPointerCapture(event.pointerId); drag = { start: p, end: p };
});
preview.addEventListener('pointermove', event => { if (drag) drag.end = pointer(event); });
preview.addEventListener('pointercancel', () => { drag = null; });
preview.addEventListener('pointerup', event => {
  if (!drag) return;
  drag.end = pointer(event);
  const side = Math.max(Math.abs(drag.end.x - drag.start.x), Math.abs(drag.end.y - drag.start.y));
  const cx = (drag.start.x + drag.end.x) / 2, cy = (drag.start.y + drag.end.y) / 2;
  if (side > 35) { roi = { x: cx - side / 2, y: cy - side / 2, side }; minimumRegion = Math.max(minimumBoxSize(), side * .78); selecting = false; resetTracking(); message('Finding the toy’s orientation…'); }
  drag = null;
});

function appendEvent(turn) {
  turn = mirrorTurn(turn);
  const name = id => COLOURS.find(c => c.id === id)?.name || id || 'Unknown face';
  const entry = { ...turn, timestamp: new Date().toISOString() }; eventLog.push(entry);
  if (eventLog.length > 1000) eventLog.shift();
  const label = turn.direction === 'uncertain' ? 'Direction uncertain' : turn.direction === 'diagonal' ? 'Diagonal / combined turn' : turn.direction;
  $('direction').textContent = label;
  const li = document.createElement('li'); li.textContent = `${name(turn.from)} → ${name(turn.to)} · ${label}${Number.isFinite(turn.angle) ? ` · ${Math.round(turn.angle)}°` : ''}`;
  $('events').prepend(li); while ($('events').children.length > 12) $('events').lastChild.remove();
  window.dispatchEvent(new CustomEvent('fidgetrotation', { detail: entry }));
}

worker.onmessage = ({ data }) => {
  busy = false;
  if (!job || data.id !== generation || data.id !== job.id) return;
  const { region, time, previous, core } = job;
  if (data.error) { message(`Tracking failed: ${data.error}`); return; }
  const result = data.result; fitted = result;
  if (result?.reliable || Number.isInteger(result?.observation?.face)) {
    lastVisualConfirmation = performance.now();
    activeProfile = result.profile;
    expectedExtent = Number.isInteger(result?.observation?.face) && core ? core.width * region.side : result.pose.scale * region.side * 2;
  }
  const motionCore = core?.score > MIN_CORE_SCORE ? core : result?.reliable ? { x: result.pose.x, y: result.pose.y, width: result.pose.scale * 2 } : null;
  const clearFace = result?.reliable && result.face.margin >= FACE_MARGIN && result.face.facing >= MIN_FACING;
  const turn = transitions.update({ face: clearFace ? result.face.index : null, core: motionCore,
    centres: result?.centres, observation: result?.observation }, time);
  if (turn) appendEvent(turn);
  $('timing').textContent = `${Math.round(data.duration)} ms / fit`;
  if (!result?.reliable) {
    const recovered = COLOURS[transitions.activeFace];
    const fresh = recovered && result?.observation?.face === transitions.activeFace;
    $('active').textContent = recovered?.name ?? 'Uncertain'; $('active').style.color = recovered?.hex ?? '';
    $('confidence').textContent = recovered ? fresh ? 'Colour position fallback' : 'Last confirmed face · brief gap' : 'No confirmed face';
    rollTransitions.update(null, time);
    window.dispatchEvent(new CustomEvent('fidgetface', { detail: { colour: recovered?.id ?? null, confidence: result?.confidence ?? 0,
      source: fresh ? 'recent colour positions' : recovered ? 'last confirmed face' : 'unavailable', time } }));
    if (time - lastAccepted > 900) pose = null;
    message(recovered ? 'Using recent colour positions while the model recovers.' : 'Searching the camera for the toy. Uncover its keys or sample its colours if needed.');
    return;
  }
  const jump = previous && rotationBetween(previous.r, result.pose.r).angle > 48;
  if (jump) rollTransitions.reset();
  pose = { ...result.pose, x: region.x + result.pose.x * region.side, y: region.y + result.pose.y * region.side, scale: result.pose.scale * region.side };
  lastAccepted = time;
  const visibleFace = clearFace ? result.face.colour : result.observation?.face === transitions.activeFace ? COLOURS[transitions.activeFace] : null;
  if (visibleFace) {
    $('active').textContent = visibleFace.name; $('active').style.color = visibleFace.hex;
    message(clearFace ? 'Tracking. Turn the toy while keeping it visible.' : 'Using colour position while the model is between faces.');
  } else { $('active').textContent = 'Between faces'; message('Two faces are similarly forward-facing. Waiting for a clear face.'); }
  $('confidence').textContent = !clearFace && visibleFace ? 'Colour position fallback' : `${Math.round(result.confidence * 100)}% model fit`;
  const roll = rollTransitions.update(result, time);
  if (roll && roll.from === roll.to && ['clockwise', 'anticlockwise'].includes(roll.direction)) appendEvent(roll);
  window.dispatchEvent(new CustomEvent('fidgetface', { detail: { colour: visibleFace?.id ?? null, confidence: result.confidence,
    source: clearFace ? 'model fit' : visibleFace ? 'recent colour positions' : 'unavailable', time } }));
  const side = roi.side * .7 + pose.scale * 5.6 * .3;
  const [width, height] = sourceSize(), clampedSide = Math.min(Math.max(side, minimumRegion), Math.max(width, height));
  roi = { side: clampedSide, x: pose.x - clampedSide / 2, y: pose.y - clampedSide / 2 };
};
worker.onerror = event => { busy = false; message(`Tracking worker error: ${event.message}`); };

searchWorker.onmessage = ({ data }) => {
  searchBusy = false;
  if (!searchJob || data.id !== generation || data.id !== searchJob.id || !running || selecting || calibrationColour) return;
  // A newer local detection takes priority over an older full-frame search.
  if (!data.found || lastVisualConfirmation > searchJob.submittedAt) return;
  const { sourceWidth, sourceHeight } = searchJob;
  const relocated = placeSearchResult(data.found, sourceWidth, sourceHeight, roi);
  roi = relocated.region; minimumRegion = Math.max(minimumBoxSize(), roi.side * .55);
  resetTracking();
  lastCore = { x: data.found.x * sourceWidth, y: data.found.y * sourceHeight, extent: data.found.width * sourceWidth };
  message(relocated.moved ? 'Toy found in a new position. Resuming tracking…' : 'Toy reacquired. Resuming tracking…');
};
searchWorker.onerror = () => { searchBusy = false; };

function draw() {
  if (!running || !roi) return;
  const source = photo || video; if (!photo && video.readyState < 2) return;
  const [width] = sourceSize(), ratio = preview.width / width;
  // Reflect footage, selection box, and wireframe together. Restore before
  // drawing instruction text so it stays readable.
  ctx.save(); ctx.translate(preview.width, 0); ctx.scale(-1, 1);
  ctx.drawImage(source, 0, 0, preview.width, preview.height);
  ctx.lineWidth = 2; ctx.strokeStyle = '#9ce4cf'; ctx.setLineDash([7, 5]);
  const box = drag ? { x: Math.min(drag.start.x, drag.end.x), y: Math.min(drag.start.y, drag.end.y), width: Math.abs(drag.end.x - drag.start.x), height: Math.abs(drag.end.y - drag.start.y) } : { x: roi.x, y: roi.y, width: roi.side, height: roi.side };
  ctx.strokeRect(box.x * ratio, box.y * ratio, box.width * ratio, box.height * ratio); ctx.setLineDash([]);
  if (pose && fitted?.reliable && $('overlay').checked) {
    const [, height] = sourceSize();
    const region = { x: pose.x / width, y: pose.y / width, scale: pose.scale / width, r: pose.r, depth: pose.depth, principalX: .5, principalY: height / width / 2 };
    for (const polygon of makeModel(Number($('geometry').value))) {
      if (polygon.colour === 6) continue;
      ctx.strokeStyle = COLOURS[polygon.colour].hex; ctx.globalAlpha = .65;
      ctx.beginPath(); polygon.vertices.forEach((p, i) => { const [x, y] = project(p, region, preview.width); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  if (selecting) { ctx.fillStyle = '#102a26cc'; ctx.fillRect(12, 12, Math.min(preview.width - 24, 420), 33); ctx.fillStyle = '#fff'; ctx.font = '14px system-ui'; ctx.fillText('Drag a box around the whole toy to begin', 22, 34); }
}

function frame(now) {
  draw();
  if (running && !selecting && !calibrationColour && !busy && roi && now - lastSample > 100 && (photo ? photoDirty : video.readyState >= 2 && video.currentTime !== lastVideoTime)) {
    lastSample = now; lastVideoTime = video.currentTime; photoDirty = false;
    const scan = { x: roi.x - roi.side * .55, y: roi.y - roi.side * .55, side: roi.side * 2.1 };
    coreCtx.clearRect(0, 0, 96, 96);
    coreCtx.drawImage(photo || video, scan.x, scan.y, scan.side, scan.side, 0, 0, 96, 96);
    const foundCore = locateCore(coreCtx.getImageData(0, 0, 96, 96), { relaxed: true,
      // A printed icon or fingertip must not shrink the box to a tiny false core.
      expectedWidth: expectedExtent ? expectedExtent / scan.side : null,
    });
    let core = null;
    if (foundCore?.rgb && foundCore.score > MIN_CORE_SCORE) {
      const current = { x: scan.x + foundCore.x * scan.side, y: scan.y + foundCore.y * scan.side, extent: foundCore.extent * scan.side };
      // Pose already follows motion between core detections. Adding the delta
      // from an older core again would double-count that motion after a gap.
      if (pose) { pose.x = current.x; pose.y = current.y; }
      lastCore = current; latestWhiteValue = foundCore.whiteValue ?? latestWhiteValue;
      const [sourceWidth, sourceHeight] = sourceSize();
      minimumRegion = Math.min(minimumRegion, Math.max(minimumBoxSize(), current.extent * 3));
      const side = Math.min(Math.max(minimumRegion, roi.side * .6 + current.extent * 2.7 * .4), Math.max(sourceWidth, sourceHeight));
      roi = { side, x: current.x - side / 2, y: current.y - side / 2 };
      core = { ...foundCore, x: (current.x - roi.x) / side, y: (current.y - roi.y) / side, width: current.extent / side };
    }
    if (!searchBusy && (!core || now - lastVisualConfirmation > 700) && now - lastSearch >= 500) {
      lastSearch = now;
      const [sourceWidth, sourceHeight] = sourceSize();
      const ratio = 480 / Math.max(sourceWidth, sourceHeight);
      searchCanvas.width = Math.max(1, Math.round(sourceWidth * ratio));
      searchCanvas.height = Math.max(1, Math.round(sourceHeight * ratio));
      searchCtx.drawImage(photo || video, 0, 0, searchCanvas.width, searchCanvas.height);
      const image = searchCtx.getImageData(0, 0, searchCanvas.width, searchCanvas.height);
      searchJob = { id: generation, sourceWidth, sourceHeight, submittedAt: performance.now() };
      searchBusy = true;
      searchWorker.postMessage({ type: 'search', id: generation, image, calibration, profile: $('profile').value,
        expectedWidth: expectedExtent ? expectedExtent / sourceWidth : null }, [image.data.buffer]);
    }
    sampleCtx.clearRect(0, 0, 48, 48);
    sampleCtx.drawImage(photo || video, roi.x, roi.y, roi.side, roi.side, 0, 0, 48, 48);
    const image = sampleCtx.getImageData(0, 0, 48, 48);
    const [width, height] = sourceSize();
    const principalX = (width / 2 - roi.x) / roi.side, principalY = (height / 2 - roi.y) / roi.side;
    const previous = pose ? { ...pose, x: (pose.x - roi.x) / roi.side, y: (pose.y - roi.y) / roi.side, scale: pose.scale / roi.side, principalX, principalY } : null;
    const acquire = !pose || (!fitted?.reliable && now - lastAcquire > 1200);
    if (acquire) lastAcquire = now;
    job = { id: generation, region: { ...roi }, time: stream || photo ? now : video.currentTime * 1000, previous, core };
    busy = true;
    const profile = $('profile').value === 'auto' && activeProfile && now - lastVisualConfirmation < 1500 ? activeProfile : $('profile').value;
    worker.postMessage({ id: generation, image, previous, acquire, protrusion: Number($('geometry').value), principalX, principalY, calibration, profile, core }, [image.data.buffer]);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
document.addEventListener('visibilitychange', () => { if (document.hidden) { transitions.reset(); rollTransitions.reset(); } });
window.addEventListener('pagehide', () => { releaseSource(); worker.terminate(); searchWorker.terminate(); });
