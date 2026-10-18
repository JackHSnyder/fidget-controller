import workletUrl from './click-worklet.js?worker&url';
import { FaceClicks } from './face-clicks.js';

export function initializeAudioClicks({ autoStart = false, sensitivity = 1 } = {}) {
  const status = document.getElementById('click-status');
  const faces = new FaceClicks(), pending = new Set();
  let cameraActive = false, session = null, clicks = 0;
  let enabled = autoStart;

  function paintAudioState(active) {
    if (session !== active || !active.ready) return;
    const listening = active.context.state === 'running';
    status.textContent = listening ? 'Listening for key clicks. Keep the front-facing key visible.' :
      'Microphone audio is blocked by browser autoplay settings.';
  }

  async function resumeAudio(active) {
    try { await active.context.resume(); }
    catch { /* The browser may require its autoplay setting to be changed. */ }
    paintAudioState(active);
  }

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
    status.textContent = text;
  }

  async function start() {
    if (!cameraActive || session || document.hidden) return;
    if (!window.AudioContext || !navigator.mediaDevices?.getUserMedia) {
      status.textContent = 'Microphone clicks require a browser with Web Audio support.'; return;
    }
    let active = null;
    status.textContent = 'Opening microphone…';
    try {
      active = { context: new AudioContext({ latencyHint: 'interactive' }), ready: false };
      session = active;
      // Request the microphone even if resume() is waiting for a user gesture.
      // Awaiting resume first would leave automatic startup stuck indefinitely.
      void resumeAudio(active);
      const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: {
        channelCount: { ideal: 1 }, echoCancellation: false, noiseSuppression: false, autoGainControl: false,
      } });
      if (session !== active) { stream.getTracks().forEach(track => track.stop()); return; }
      active.stream = stream;
      if (!active.context.audioWorklet) throw new Error('Audio worklets are unavailable in this browser.');
      await active.context.audioWorklet.addModule(workletUrl);
      if (session !== active) return;
      active.node = new AudioWorkletNode(active.context, 'fidget-key-clicks');
      active.node.port.postMessage({ type: 'sensitivity', value: Number(sensitivity) });
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
        if (session === active) stop('Microphone disconnected. Reconnect it and reload the page.');
      });
      active.ready = true;
      paintAudioState(active);
    } catch (error) {
      if (!active || session === active) { enabled = false; stop(`Could not enable clicks: ${error.message}. Check browser permissions and reload the page.`); }
    }
  }

  window.addEventListener('fidgetface', ({ detail }) => { if (cameraActive && detail) faces.update(detail); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop('Key clicks paused while the page is hidden.');
    else if (enabled && cameraActive) void start();
  });
  window.addEventListener('pagehide', () => stop());

  return {
    start() { enabled = true; return session ? resumeAudio(session) : start(); },
    stop() { enabled = false; stop(); },
    setCameraActive(active) {
      cameraActive = active;
      if (!active) stop('Waiting for the camera to enable key clicks.');
      else if (enabled && !document.hidden) void start();
      else status.textContent = 'Key clicks are paused.';
    },
  };
}
