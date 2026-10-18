import { COLOURS, FACE_MARGIN, MIN_FACING, makeModel, project, rotationBetween } from './cube-model.js';
import { locateCore, MIN_CORE_SCORE } from './vision.js';
import { placeSearchResult } from './toy-search.js';
import { RotationEvents } from './tracker.js';
import { ScreenTurnEvents } from './screen-turns.js';
import { mirrorTurn } from '../mirrored-view.js';

// Owns automatic camera capture, tracking state, and programmatic configuration.
export function initializeTracking({ onSourceChange = () => {}, autoStart = false, profile: configuredProfile = 'auto', protrusion = .85, overlay = true } = {}) {
  const $ = id => document.getElementById(id);
  const video = $('camera'), preview = $('preview'), ctx = preview.getContext('2d');
  const sample = document.createElement('canvas'); sample.width = sample.height = 48;
  const sampleCtx = sample.getContext('2d', { willReadFrequently: true });
  const worker = new Worker(new URL('./tracking-worker.js', import.meta.url), { type: 'module' });
  const searchWorker = new Worker(new URL('./tracking-worker.js', import.meta.url), { type: 'module' });
  const transitions = new ScreenTurnEvents(), rollTransitions = new RotationEvents();
  const coreCanvas = document.createElement('canvas'); coreCanvas.width = coreCanvas.height = 96;
  const coreCtx = coreCanvas.getContext('2d', { willReadFrequently: true });
  const searchCanvas = document.createElement('canvas');
  const searchCtx = searchCanvas.getContext('2d', { willReadFrequently: true });
  let stream = null, generation = 0, busy = false, job = null;
  let roi = null, pose = null, fitted = null;
  let lastSample = 0, lastVideoTime = -1, lastAcquire = -Infinity, lastAccepted = -Infinity;
  let running = false, eventLog = [];
  let minimumRegion = 70, lastCore = null;
  let lastSearch = -Infinity;
  let lastVisualConfirmation = -Infinity;
  let searchBusy = false, searchJob = null;
  let expectedExtent = null;
  let calibration = {};
  let latestWhiteValue = null, activeProfile = null;
  let searchingForToy = false, cameraStarting = false, cameraWanted = autoStart;
  try {
    const saved = JSON.parse(localStorage.getItem('fidget-colours-v1') || '{}');
    for (const colour of COLOURS) {
      const value = saved?.[colour.id];
      if (value && [value.h, value.s, value.v].every(Number.isFinite)) calibration[colour.id] = value;
    }
  } catch { /* Storage can be disabled. */ }

  function message(text) { $('status').textContent = text; }
  function resetTracking() {
    generation++; latestWhiteValue = null; activeProfile = null; pose = null; fitted = null; transitions.reset(); rollTransitions.reset(); lastCore = null;
    lastAcquire = -Infinity; lastAccepted = -Infinity; lastVideoTime = -1;
    lastSearch = -Infinity;
    lastVisualConfirmation = performance.now();
    expectedExtent = roi ? roi.side / 3.2 : null;
    $('active').textContent = 'Waiting'; $('confidence').textContent = '—';
    window.dispatchEvent(new CustomEvent('fidgetface', { detail: { colour: null, confidence: 0, time: performance.now() } }));
  }
  function releaseSource() {
    running = false; searchingForToy = false; generation++; transitions.reset(); rollTransitions.reset(); pose = null; fitted = null;
    onSourceChange(null);
    stream?.getTracks().forEach(track => track.stop()); stream = null;
    video.pause(); video.srcObject = null; video.removeAttribute('src'); video.load();
    preview.hidden = true;
  }
  function initialiseSource() {
    const source = video;
    const width = source.videoWidth, height = source.videoHeight;
    preview.hidden = false;
    preview.width = Math.min(960, width); preview.height = Math.round(preview.width * height / width);
    const side = Math.min(width, height) * .6;
    roi = { x: (width - side) / 2, y: (height - side) / 2, side };
    resetTracking(); running = true; searchingForToy = true;
    if (searchingForToy) expectedExtent = null; // No selected size exists yet.
    onSourceChange('camera');
    message('Looking for the toy. Bring it into the camera view.');
  }
  async function startCamera() {
    if (cameraStarting || stream) return;
    cameraWanted = true; cameraStarting = true;
    releaseSource(); const request = generation;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access requires localhost or HTTPS and a supported browser.');
      const cameraStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { width: { ideal: 1280 }, height: { ideal: 720 } } });
      if (request !== generation) { cameraStream.getTracks().forEach(track => track.stop()); return; }
      stream = cameraStream; video.srcObject = stream; await video.play();
      if (request !== generation) return;
      initialiseSource();
      stream.getVideoTracks()[0].addEventListener('ended', () => { if (stream === cameraStream) stop(); });
    } catch (error) {
      if (request === generation) {
        releaseSource();
        message(`Could not open camera: ${error.message}. Check browser permissions and reload the page.`);
      }
    } finally { cameraStarting = false; }
  }
  function stop() {
    cameraWanted = false;
    releaseSource(); $('active').textContent = 'Stopped';
    message('Camera stopped.');
    window.dispatchEvent(new CustomEvent('fidgetface', { detail: { colour: null, confidence: 0, time: performance.now() } }));
  }
  function sourceSize() { return [video.videoWidth, video.videoHeight]; }
  function minimumBoxSize() { return Math.max(35, Math.min(...sourceSize()) / 6); }

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
    if (!searchJob || data.id !== generation || data.id !== searchJob.id || !running) return;
    // A newer local detection takes priority over an older full-frame search.
    if (!data.found || lastVisualConfirmation > searchJob.submittedAt) return;
    const { sourceWidth, sourceHeight } = searchJob;
    const relocated = placeSearchResult(data.found, sourceWidth, sourceHeight, roi);
    roi = relocated.region; minimumRegion = Math.max(minimumBoxSize(), roi.side * .55);
    resetTracking();
    searchingForToy = false;
    lastCore = { x: data.found.x * sourceWidth, y: data.found.y * sourceHeight, extent: data.found.width * sourceWidth };
    latestWhiteValue = data.found.whiteValue ?? null;
    message(relocated.moved ? 'Toy found in a new position. Resuming tracking…' : 'Toy reacquired. Resuming tracking…');
  };
  searchWorker.onerror = () => { searchBusy = false; };

  function draw() {
    if (!running || !roi) return;
    const source = video; if (video.readyState < 2) return;
    const [width] = sourceSize(), ratio = preview.width / width;
    // Reflect footage, selection box, and wireframe together. Restore before
    // drawing instruction text so it stays readable.
    ctx.save(); ctx.translate(preview.width, 0); ctx.scale(-1, 1);
    ctx.drawImage(source, 0, 0, preview.width, preview.height);
    ctx.lineWidth = 2; ctx.strokeStyle = '#9ce4cf'; ctx.setLineDash([7, 5]);
    const box = { x: roi.x, y: roi.y, width: roi.side, height: roi.side };
    if (!searchingForToy) ctx.strokeRect(box.x * ratio, box.y * ratio, box.width * ratio, box.height * ratio);
    ctx.setLineDash([]);
    if (pose && fitted?.reliable && overlay) {
      const [, height] = sourceSize();
      const region = { x: pose.x / width, y: pose.y / width, scale: pose.scale / width, r: pose.r, depth: pose.depth, principalX: .5, principalY: height / width / 2 };
      for (const polygon of makeModel(protrusion)) {
        if (polygon.colour === 6) continue;
        ctx.strokeStyle = COLOURS[polygon.colour].hex; ctx.globalAlpha = .65;
        ctx.beginPath(); polygon.vertices.forEach((p, i) => { const [x, y] = project(p, region, preview.width); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function queueSearch(now) {
    if (searchBusy || now - lastSearch < 500) return;
    lastSearch = now;
    const [sourceWidth, sourceHeight] = sourceSize();
    const ratio = 480 / Math.max(sourceWidth, sourceHeight);
    searchCanvas.width = Math.max(1, Math.round(sourceWidth * ratio));
    searchCanvas.height = Math.max(1, Math.round(sourceHeight * ratio));
    searchCtx.drawImage(video, 0, 0, searchCanvas.width, searchCanvas.height);
    const image = searchCtx.getImageData(0, 0, searchCanvas.width, searchCanvas.height);
    searchJob = { id: generation, sourceWidth, sourceHeight, submittedAt: performance.now() };
    searchBusy = true;
    searchWorker.postMessage({ type: 'search', id: generation, image, calibration, profile: configuredProfile,
      expectedWidth: searchingForToy ? null : expectedExtent ? expectedExtent / sourceWidth : null }, [image.data.buffer]);
  }

  function frame(now) {
    draw();
    if (running && !busy && roi && now - lastSample > 100 && (video.readyState >= 2 && video.currentTime !== lastVideoTime)) {
      lastSample = now; lastVideoTime = video.currentTime;
      if (stream && !searchingForToy && now - lastVisualConfirmation > 1500) {
        searchingForToy = true; pose = null; fitted = null;
        transitions.reset(); rollTransitions.reset();
        window.dispatchEvent(new CustomEvent('fidgetface', { detail: { colour: null, confidence: 0, time: now } }));
        message('Looking for the toy. Bring it into the camera view.');
      }
      if (searchingForToy) {
        queueSearch(now);
      } else {
        const scan = { x: roi.x - roi.side * .55, y: roi.y - roi.side * .55, side: roi.side * 2.1 };
        coreCtx.clearRect(0, 0, 96, 96);
        coreCtx.drawImage(video, scan.x, scan.y, scan.side, scan.side, 0, 0, 96, 96);
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
      if (!core || now - lastVisualConfirmation > 700) queueSearch(now);
      sampleCtx.clearRect(0, 0, 48, 48);
      sampleCtx.drawImage(video, roi.x, roi.y, roi.side, roi.side, 0, 0, 48, 48);
      const image = sampleCtx.getImageData(0, 0, 48, 48);
      const [width, height] = sourceSize();
      const principalX = (width / 2 - roi.x) / roi.side, principalY = (height / 2 - roi.y) / roi.side;
      const previous = pose ? { ...pose, x: (pose.x - roi.x) / roi.side, y: (pose.y - roi.y) / roi.side, scale: pose.scale / roi.side, principalX, principalY } : null;
      const acquire = !pose || (!fitted?.reliable && now - lastAcquire > 1200);
      if (acquire) lastAcquire = now;
      job = { id: generation, region: { ...roi }, time: now, previous, core };
      busy = true;
      const profile = configuredProfile === 'auto' && activeProfile && now - lastVisualConfirmation < 1500 ? activeProfile : configuredProfile;
      worker.postMessage({ id: generation, image, previous, acquire, protrusion: protrusion, principalX, principalY, calibration, profile, core }, [image.data.buffer]);
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { transitions.reset(); rollTransitions.reset(); } });
  window.addEventListener('pagehide', event => {
    releaseSource();
    if (!event.persisted) { worker.terminate(); searchWorker.terminate(); }
  });
  window.addEventListener('pageshow', event => { if (event.persisted && cameraWanted) void startCamera(); });
  if (autoStart) void startCamera();
  return { start: startCamera, stop };
}
