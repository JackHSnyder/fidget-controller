import workletUrl from './click-worklet.js?worker&url';
import { FaceClicks } from './face-clicks.js';

export function initializeAudioClicks() {
  const button = document.getElementById('microphone');
  const status = document.getElementById('click-status');
  const sensitivity = document.getElementById('click-sensitivity');
  const faces = new FaceClicks(), pending = new Set();
  let cameraActive = false, session = null, clicks = 0;

  function closeSession(active) {
    if (!active) return;
    active.stream?.getTracks().forEach(track => track.stop());
    active.source?.disconnect();
    active.node?.disconnect();
    if (active.node) active.node.port.onmessage = null;
    void active.context.close().catch(() => {});
  }

  function stop(text = 'Key clicks off.') {
    const active = session; session = null;
    closeSession(active);
    for (const timer of pending) clearTimeout(timer);
    pending.clear(); faces.reset();
    button.textContent = 'Enable clicks'; button.disabled = !cameraActive;
    button.setAttribute('aria-pressed', 'false');
    status.textContent = text;
  }

  async function start() {
    if (!cameraActive || session) return;
    if (!window.AudioContext || !navigator.mediaDevices?.getUserMedia) {
      status.textContent = 'Microphone clicks require a browser with Web Audio support.'; return;
    }
    const active = { context: new AudioContext({ latencyHint: 'interactive' }) };
    session = active; button.disabled = true;
    status.textContent = 'Opening microphone…';
    try {
      // Resume during the button gesture, before waiting for microphone permission.
      await active.context.resume();
      if (session !== active) return;
      const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: {
        channelCount: { ideal: 1 }, echoCancellation: false, noiseSuppression: false, autoGainControl: false,
      } });
      if (session !== active) { stream.getTracks().forEach(track => track.stop()); return; }
      active.stream = stream;
      if (!active.context.audioWorklet) throw new Error('Audio worklets are unavailable in this browser.');
      await active.context.audioWorklet.addModule(workletUrl);
      if (session !== active) return;
      active.node = new AudioWorkletNode(active.context, 'fidget-key-clicks');
      active.node.port.postMessage({ type: 'sensitivity', value: Number(sensitivity?.value || 1) });
      active.node.port.onmessage = ({ data }) => {
        if (session !== active || document.hidden || !cameraActive) return;
        const click = { ...data, time: performance.now() + (data.time - active.context.currentTime) * 1000 };
        // Give a video fit already in flight time to report its capture-time colour.
        const timer = setTimeout(() => {
          pending.delete(timer);
          if (session !== active || document.hidden) return;
          const press = faces.match(click);
          if (!press) { status.textContent = 'Click heard; waiting for a clear front-facing key.'; return; }
          clicks++;
          status.textContent = `${press.colour.replaceAll('-', ' ')} key pressed · ${clicks} ${clicks === 1 ? 'click' : 'clicks'}`;
          window.dispatchEvent(new CustomEvent('fidgetpress', { detail: press }));
        }, 120);
        pending.add(timer);
      };
      active.source = active.context.createMediaStreamSource(stream);
      active.source.connect(active.node);
      active.node.connect(active.context.destination);
      stream.getAudioTracks()[0].addEventListener('ended', () => {
        if (session === active) stop('Microphone disconnected. Enable clicks to try again.');
      });
      button.disabled = false; button.textContent = 'Disable clicks';
      button.setAttribute('aria-pressed', 'true');
      status.textContent = 'Listening for key clicks. Keep the front-facing key visible.';
    } catch (error) {
      if (session === active) stop(`Could not enable clicks: ${error.message}`);
    }
  }

  button.addEventListener('click', () => { if (session) stop(); else void start(); });
  sensitivity?.addEventListener('input', () => {
    session?.node?.port.postMessage({ type: 'sensitivity', value: Number(sensitivity.value) });
  });
  window.addEventListener('fidgetface', ({ detail }) => { if (cameraActive && detail) faces.update(detail); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop('Key clicks paused. Enable clicks when you return.');
  });
  window.addEventListener('pagehide', () => stop());

  return {
    setCameraActive(active) {
      cameraActive = active;
      if (!active) stop('Start the camera to enable key clicks.');
      else { button.disabled = false; status.textContent = 'Enable clicks to use the microphone for key presses.'; }
    },
  };
}
