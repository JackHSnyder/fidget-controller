// Background playback has no mouse, keyboard, or file-selection controls.
export function initializeLoopingMusic({ audio, status, src }) {
  let resumeWhenVisible = false, pageActive = true, playVersion = 0;
  audio.controls = false;
  audio.loop = true;
  audio.volume = .2;
  audio.src = src;

  async function play() {
    const version = ++playVersion;
    if (document.hidden || !pageActive) { resumeWhenVisible = true; return; }
    try {
      await audio.play();
      if (document.hidden || !pageActive) pauseForPage();
    } catch (error) {
      if (version !== playVersion || document.hidden || !pageActive) return;
      status.textContent = error.name === 'NotAllowedError' ?
        'Background music is blocked by browser autoplay settings.' : 'Background music is unavailable.';
    }
  }

  function pauseForPage() {
    resumeWhenVisible ||= !audio.paused;
    audio.pause();
  }

  function resumeForPage() {
    if (resumeWhenVisible && !document.hidden && pageActive) {
      resumeWhenVisible = false;
      void play();
    }
  }

  audio.addEventListener('playing', () => { status.textContent = 'Music playing on repeat.'; });
  audio.addEventListener('error', () => { status.textContent = 'Background music is unavailable.'; });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseForPage();
    else resumeForPage();
  });
  window.addEventListener('pagehide', event => {
    pageActive = false;
    pauseForPage();
  });
  window.addEventListener('pageshow', () => { pageActive = true; resumeForPage(); });
  void play();
}
