# fidget-controller
Created as part of Do You Have the GUTS? 2026 for the JPMorganChase challenge.

## Run locally

Install Node.js (version 20.19+ or 22.12+), then open a terminal in this folder:

```powershell
npm install
npm run dev
```

Open the local address printed in the terminal (usually http://127.0.0.1:5173). The home page is a simple three item cube menu. For read-only tracking diagnostics, open `/tracker.html`.
Keep the terminal running while using the page. Press Ctrl+C to stop it.
Saving a source file updates the browser automatically through Vite.

## Use the cube menu

The site accepts cube input only. Pages have no buttons, links, file pickers,
sliders, native playback controls, or mouse/keyboard input handlers. Browser
permission prompts and browser-level controls are outside the site.

Camera and microphone startup is requested automatically on the menu, Tetris,
Play, Settings, and tracker pages. Allow browser access and bring the toy into
view. Tracking searches the full frame without manual selection.

The menu has three display-only items: Tetris, Play, and Settings. Turn up/down
to move the highlight and press a cube key to open the selected page. Left/right
do not move the single-column menu. In Play and Settings, turn up and
then press a key to return to the menu. Another turn cancels that return action.
In Tetris, left/right move the piece, down lowers one row, and a normal key press
hard drops. Tetris has no cube gesture for leaving the game; up turns are ignored
and subsequent presses still hard drop. Hidden-page inputs are discarded.

There is no mouse/keyboard fallback for blocked audio. If music or microphone
processing is blocked by browser autoplay policy, its status explains that;
hands-free audio requires autoplay to be allowed in the browser. The app cannot
bypass those permissions. Camera tracking can run without microphone permission.
Leaving a page releases its camera/microphone and pauses its music.

## Audio key presses

`src/audio/` owns microphone capture, sound recognition, and matching click times
to camera observations. `src/main.js` connects its `fidgetpress` events to the
menu, alongside the existing rotation events.

The detector was tuned using the supplied 26.281-second MP3. It checks short
attacks with strong energy around 6.5–10 kHz, a fast decay, and a rise above the
recent background level. A 180 ms interval and a relative-volume check suppress
ringing and quieter key returns. It does not use visual key movement. The audio
worklet runs separately from the video fitter, using the microphone's actual
sample rate. Microphone audio is processed locally and is neither recorded,
uploaded, nor played through the speakers.

Each click is paired with the latest camera observation captured before the
sound, allowing 120 ms for an in-flight video fit to complete. A colour remains
usable for up to 400 ms during a brief finger occlusion; repeated display-only
holds do not renew that deadline. No press event is emitted without a recent
colour or after an uncertain observation. Hiding the tab or leaving the page
stops the microphone; an enabled session resumes when returning to the tab.
Declined permission is not repeatedly requested on tab focus.

Click sensitivity is configured through the `initializeAudioClicks()` options
(default 1), rather than a UI slider. This is sound-pattern matching, not proof
that the toy made the noise: a nearby keyboard or a similar sharp sound can
still trigger it. The cooldown limits how quickly separate presses are recognized.
Reference regression checks cover 36 prominent attacks, two weaker matching
transients, and quieter returns; these are recording-specific checks, not a
measured live accuracy rate.
Listen for key presses on `window`:

```js
window.addEventListener('fidgetpress', ({ detail }) => {
  console.log(detail.colour, detail.time);
});
```

Press events contain `colour`, `time` (capture time in `performance.now()`
milliseconds), `source: 'audio'`, `rms`, `strength` (relative to background),
`bandEnergy` (fraction in the click band), `faceConfidence`, `faceSource`, and
`timestamp`. These scores are not calibrated probabilities. The demo also emits
`menuactivate` with the selected `item` and the press details.

`tests/fixtures/click-audio-features.json` contains only timing, band-energy, and
amplitude measurements from the reference clip, without audio samples. Optional
full decoding/replay is available with `tools/prepare-click-audio.py` (requires
soundfile and numpy), followed by `tools/check-click-audio.mjs`. Both tools take
file paths as arguments; keep temporary decoded samples outside tracked files.

## Track the fidget toy

`/tracker.html` shows the same automatic camera/microphone setup plus read-only
face and turn diagnostics. The tracker searches for the toy and follows it
when visible. No manual selection, calibration controls, uploads, video replay,
or event-download controls are exposed in the site. Offline inspection tools
and regression fixtures remain available in the repository.

Automatic colour setup compares daylight, recording, and indoor profiles. Saved
colour references from earlier versions remain readable. Programmatic options
on `initializeTracking()` configure profile, protrusion, and overlay; the site
has no settings inputs.

The preview is horizontally mirrored. Left/right and clockwise/anticlockwise
events follow the mirrored image. Up means the previous front face moves up and
the lower face comes forward. Conflicting direction evidence remains uncertain;
reacquisition resets history so an unseen turn cannot become a menu step.

### Physical layout

The model uses the confirmed **unmirrored** physical layout (green forward, purple up):

| Model direction | Colour |
| --- | --- |
| Front | Green |
| Back | Pink |
| Left | Light blue |
| Right | Orange |
| Top | Purple |
| Bottom | Dark blue |

Clockwise around green in the unmirrored image: light blue, purple, orange,
dark blue. The UI mirrors the preview only, after detection.

This describes the toy's geometry, **not** a required starting orientation.
It may start at any roll or with any face forward. A differently assembled toy
requires changing the face normals in `src/tracking/cube-model.js`. The programmatic protrusion option
adjusts keycap depth; other dimension ratios are in `makeModel()`.

### How detection works

`src/tracking/` contains the toy geometry, colour recognition, localisation,
pose fitting, movement recognition, tracking worker, and browser controller. The application
entry point (`src/main.js`) starts the components and connects cube turns to the menu.
The menu, preview mirroring, and styles stay in `src/`.

- `src/tracking/vision.js`: HSV segmentation, neutral white-frame localisation, paint
  sampling away from the centre print, and component positions constrained by
  the fitted toy. The neutral core follows independently of a successful pose
  fit, and the search region has a minimum size to stop progressive collapse.
  Local detection tolerates one obscured frame edge, weaker frame contrast,
  and a partly visible central key. The size floor can decrease as the toy
  moves farther away.
- `src/tracking/toy-search.js`: whole-camera reacquisition at multiple sizes and positions,
  including near the image edges. When local detection fails, or no face has
  been confirmed for 700 ms, this search runs at most twice per second using
  a reduced-resolution copy of the full camera image in a separate worker, so
  the preview and local tracking keep running. Candidates must have a white
  frame, a coloured centre, two other nearby colours, and a plausible geometric
  fit. Initial orientation comes from the observed key positions. Newer local
  detections take priority over older search results. Reacquisition moves
  the box to the detected toy and resets turn history, so unseen movement
  cannot become an invented menu action.
- `src/tracking/colour-profiles.js` and `src/tracking/frame-analysis.js`: lighting profiles and
  profile selection. Saturation and relative brightness help separate the blue
  keys when their hues overlap. User samples override the selected profile.
- `src/tracking/cube-model.js`: a white core and six tapered coloured keycaps, including
  side walls. A small perspective renderer uses a depth buffer for occlusion.
- `src/tracking/tracker.js`: searches model orientation, position, size, and perspective
  against the colour masks, then refines the previous pose on subsequent frames.
  The active face is selected by normal direction. Alternative quarter-turn
  hypotheses let the fitter recover from rapid rotations.
- `src/tracking/screen-turns.js`: face-change direction from the observed outgoing and
  incoming key motion relative to the core. Camera-space translation and size
  changes cancel out. Background components and physically hidden keys are
  excluded. Conflicting or absent evidence returns uncertain. Same-face roll
  events still use the fitted rotation matrices.
- If the model fit drops out, independent colour components around a freshly
  detected white core remain available. Recent side-to-centre movement provides
  an incoming direction (bottom to centre means up); centre-to-side movement
  provides an outgoing direction (centre to left means left). Changes must
  persist for 160 ms. Conflicting directions remain uncertain. Observations are
  normalised by core position and width, so translation and distance cancel out.
  Confirmed faces remain displayed through gaps up to 600 ms; turn evidence
  expires after 1.2 seconds. A covered incoming key can produce a direction
  with an unknown next colour, rather than losing the turn or guessing a colour.
  Model recovery uses the same transition state to avoid duplicate menu steps.
- `src/tracking/tracking-worker.js`: keeps fitting and full-frame searching off the UI thread.
- `src/tracking/controller.js`: automatic camera capture, saved colour references, overlay,
  worker coordination, and tracking events, started with `initializeTracking()`.
- `src/menu.js`: creates the menu with `createMenu()` and exposes `moveSelection()`.
- `src/audio/controller.js`: automatic microphone permission, capture, lifecycle, and public press events.
- `src/audio/click-detector.js`: spectrum, onset, decay, and duplicate/return suppression.
- `src/audio/click-worklet.js`: continuously processes microphone samples off the UI thread.
- `src/audio/face-clicks.js`: pairs audio capture times with recent front-face colours.
- `src/main.js`: starts tracking and the menu, then connects their events.

Fitting uses an approximate geometric model, not a trained object recognizer.
The displayed fit score is **not a calibrated probability**. At similar face
angles the tracker reports **Between faces**; poor fits or insufficient visible
colours report **Uncertain**. It debounces face transitions and discards direction
history after tracking loss, tab hiding, reselection, or large pose jumps.

There are real visual limits: fingers, motion blur, colour-matched backgrounds,
very small images, specular reflections, and colour shifts can defeat matching.
Use a plain background and even lighting. Camera perspective is fitted
approximately; this is not a calibrated metrology system. Shortest rotation
between accepted poses is reported; multiple unseen turns cannot be reconstructed.
Live accuracy requires testing a continuous recording from the target camera.

### Application events

The home page menu in `src/menu.js` has three vertically stacked items. Up and
down turns move the highlight one item; left and right have no effect. Uncertain,
diagonal, and roll events are ignored.

The connection to the detector lives in `src/main.js`:

```js
window.addEventListener('fidgetrotation', ({ detail }) => {
  menu.moveSelection(detail?.direction);
});
```

Replace `moveSelection()` with your own application's handler to consume cube
turns. The menu module is independent of camera and tracking implementation.

Listen on `window` for `fidgetface` (colour ID or null, model-fit score, time)
and `fidgetrotation` (from, to, direction, angle in degrees, time, timestamp).
Colour IDs are `pink`, `purple`, `orange`, `green`, `light-blue`, `dark-blue`.
Direction values are `left`, `right`, `up`, `down`, `clockwise`, `anticlockwise`,
`diagonal`, or `uncertain`. Face-change events have `angle: null`: screen motion
does not measure a 3D angle. Roll events retain an estimated angle in degrees.
Fallback turns carry `inferred: true` and `source: 'recent colour positions'`.
Their `to` can be `null` if only the outgoing key is visible; the menu still
consumes their direction. Face notifications identify brief holds with
`source: 'last confirmed face'`. Fit confidence remains a model score even when
the face is recovered by the colour fallback.
Event times are milliseconds on the local monotonic
clock for the camera, and video playback time for imported videos.

## Verification

```powershell
npm test
npm run build
```

Tests cover colour classification, arbitrary starting roll, different directions
for the same colour pair, scale/position variation, continuous synthetic turns,
edge-on ambiguity, tracking loss, and insufficient colour evidence. Synthetic
renders test geometry and event logic, not real-world robustness.

The supplied 34-second recording was sampled at 5 frames/second for sequential
offline replay. At 32 manually checked clear-face checkpoints, the revised
recording-lighting pipeline identified 27 correctly and returned uncertain for
five, with no incorrect colour labels at those checkpoints. This is a limited
check within one recording, not a general accuracy estimate. Fast turns,
occlusions, unlabelled intermediate frames, and new lighting remain limitations.
The first eight detected turns were checked visually and are regression-tested.
Derived colour masks and motion measurements are stored in
`tests/fixtures/recording-checkpoints.json`; original video/audio/RGB frames are
excluded. Those checkpoints isolate geometry/event regressions; they are not
an end-to-end browser benchmark or a substitute for testing the actual camera.

An opt-in check for the four supplied reference photos is available via
`tools/prepare-photo-check.py` (requires Pillow) followed by
`node tools/check-photos.mjs <temporary-output.json>`. The photo folder and output
path are arguments to the Python tool. It checks default-colour face detection
on cropped toys; the original photos are not stored in the repository. These
stills do not validate rotation direction, which needs continuous video.

## Build for static hosting

```powershell
npm run build
npm run preview
```

The build writes the finished site to `dist/`. Upload that folder's contents to
static hosting when ready. The preview command is for checking the build locally.
No backend is required. Camera/microphone access needs localhost during
development or HTTPS when hosted, plus browser permission.

### PC camera robustness checks

The dim-camera changes lower the neutral-frame brightness cutoff, allow one
covered border, compare narrow and broad frame bands, and constrain frame size
between observations. Tracking-box size now scales with camera resolution.
Whole-frame search ranks and suppresses duplicate candidates before verifying
at most 24 candidates, so textured backgrounds cannot monopolise the worker.
A central paint hint must agree with actual pixels before constraining the
model. Model fitting uses the fixed adjacent-key arrangement, and retries
orientation acquisition if that central evidence contradicts its prior pose.

Validation includes the supplied 35.6-second unmirrored PC recording, low-light
colour/exposure tests, layout/mirroring tests, and the earlier recording masks
converted from their mirrored coordinate convention. Heavy occlusion and
motion blur can still leave a turn uncertain. Use Automatic initially; if you
saved samples under a different camera, restore default colours or resample
all six keys under the current lighting.
