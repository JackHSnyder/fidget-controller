# fidget-controller
Created as part of Do You Have the GUTS? 2026 for the JPMorganChase challenge.

## Run locally

Install Node.js (version 20.19+ or 22.12+), then open a terminal in this folder:

```powershell
npm install
npm run dev
```

Open the local address printed in the terminal (usually http://127.0.0.1:5173). The home page is a simple three item cube menu. For camera calibration, video replay, and tracking details, open `/tracker.html`.
Keep the terminal running while using the page. Press Ctrl+C to stop it.
Saving a source file updates the browser automatically through Vite.

## Use the cube menu

The home page has three items: Home, Play, and Settings. Start the camera, drag
a box around the whole toy, then turn the cube up or down to move the highlight.
The menu starts on Play. Left and right turns do not move the single-column menu.

Choose **Enable clicks** and allow microphone access to press a key as well as
turn the cube. A matching click opens the highlighted item's plain example page:
`home.html`, `play.html`, or `settings.html`. Mouse hover and clicks do not select
or activate the menu items. Keyboard arrows and Enter/Space remain available
when the menu has keyboard focus. Each example page has a **Back to the menu** link. Returning to the menu
requires starting the camera and enabling clicks again.
The microphone is separate from the camera, so camera tracking still works if
microphone access is declined. **Disable clicks** releases the microphone.

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
colour or after an uncertain observation. File/photo review does not use live
microphone sound. Stopping/changing the camera, hiding the tab, or leaving the
page stops the microphone. Enable clicks again after returning to the tab.

The full tracker has a **Click sensitivity** slider. Increase it for quiet clicks
or reduce it if background sounds trigger the detector. This is sound-pattern
matching, not proof that the toy made the noise: a nearby keyboard or a similar
sharp, high-frequency sound can still trigger it. The cooldown also limits how
quickly separate presses can be recognized. The reference regression checks
cover 36 prominent attacks, two weaker matching transients, and the quieter
returns; these are recording-specific checks, not a measured live accuracy rate.

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

The full camera, calibration, and replay interface is available at `/tracker.html`.

1. Choose **Start camera**, allow camera access, and drag a box tightly around
   the **entire toy**, including the protruding keys. The box becomes square;
   leave a small margin. The tracker follows its position and apparent size.
2. Keep at least two coloured keys visible. **Automatic** colour setup compares
   daylight, earlier recording, and dim indoor profiles. The indoor profile
   and new colour samples adapt to exposure using the surrounding white frame. For the recording's camera/lighting, **Recording lighting** can
   also be selected explicitly. If colours are misclassified under
   your lighting, select each colour under **Colour and toy setup** and click
   an unprinted patch of its plastic in the preview. Samples persist locally.
3. Turn the toy. **Forward face** is the face with its outward normal closest
   to pointing at the camera, rather than whichever colour occupies most pixels.
4. Recent turns show the previous colour, next colour, and camera-relative
   direction. Download events exports JSON. If the toy leaves the box, the
   tracker searches the whole camera automatically. **Select toy again** remains
   available to correct a mistaken selection.

The preview is **horizontally mirrored**. A left turn means the old front face moves left
in that image and the right-hand face comes forward. Up means the old front
face moves up and the bottom face comes forward. Clockwise/anticlockwise describe
rolls in the mirrored image. These directions do not depend on which colour was on top.
Combined rotations are labelled diagonal, and unresolved direction is uncertain.
Footage, selection boxes, and wireframes share the same reflection. Pointer
coordinates are converted back for toy selection and colour sampling. Internal
geometry uses the original camera image; public events, the menu, and exported
directions swap left/right and clockwise/anticlockwise to match the preview.

Photos and videos can be loaded locally for testing. Imported videos start
paused; use the playback slider to find the toy, select it, then press Play.
Seeking resets tracking history, so it cannot invent a turn across the seek.
Photos report orientation only; events require consecutive video frames. Files are not uploaded. No
microphone is used during imported photo/video review.

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
requires changing the face normals in `src/tracking/cube-model.js`. The protrusion slider
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
- `src/tracking/controller.js`: camera/files, selection, colour sampling, overlay,
  worker coordination, and tracking events, started with `initializeTracking()`.
- `src/menu.js`: creates the menu with `createMenu()` and exposes `moveSelection()`.
- `src/audio/controller.js`: microphone permission, capture, controls, and public press events.
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
