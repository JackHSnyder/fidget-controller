# fidget-controller
Created as part of Do You Have the GUTS? 2026 for the JPMorganChase challenge.

## Run locally

Install Node.js (version 20.19+ or 22.12+), then open a terminal in this folder:

```powershell
npm install
npm run dev
```

Open the Local address printed in the terminal (usually http://127.0.0.1:5173).
Keep the terminal running while using the page. Press Ctrl+C to stop it.
Saving a source file updates the browser automatically through Vite.

## Try the starter

Select one of the six colours, then click the large key to count a press.
You can also press Space when the page background has focus; focused buttons
support their normal Space/Enter controls. Reset session clears the counter.
This is a manual demo: camera, microphone, and automatic detection are not implemented.
Session state is held in memory and clears on reload. Google Fonts is optional;
system fonts are used if it is unavailable.

## Build for static hosting

```powershell
npm run build
npm run preview
```

The build writes the finished site to `dist/`. Upload that folder's contents to
static hosting when ready. The preview command is for checking the build locally.
No backend is required. Future camera/microphone features need localhost during
development or HTTPS when hosted, plus browser permission.
