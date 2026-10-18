# Tetris music

Place your MP3 here with the name `tetris.mp3` to use it as the default looping
track on the Tetris page. Vite serves it at `/audio/tetris.mp3` and includes it
in the production build. No music file is included with this setup.

Music attempts to start on page load. There are no playback controls, volume
sliders, or file pickers in the cube-only interface. If the browser blocks
autoplay, the page reports that state; allow autoplay in browser settings for
hands-free playback. The site cannot bypass browser autoplay policy.
Music pauses when the page is hidden and resumes when returning if it was
playing. Leaving the page stops playback. The default starting volume is 20%.

The default path is configured in `src/tetris-page.js`; reusable playback and
lifecycle handling are in `src/audio/looping-music.js`.
