// Shared, display-only preview and tracking status for the menu and games.
export function mountControllerPanel(container, { detailed = false } = {}) {
  container.innerHTML = `
    <video id="camera" autoplay playsinline muted hidden></video>
    <canvas id="preview" width="960" height="540" aria-label="Mirrored camera preview. The toy is found automatically." hidden></canvas>
    <p id="status" role="status">Opening camera. Allow access, then bring the toy into view.</p>
    <p id="click-status" role="status">Waiting for the camera to start microphone clicks.</p>
    <div${detailed ? '' : ' hidden'}>
      <p>Forward face: <span id="active">Waiting</span> · <span id="confidence"></span></p>
      <p>Last turn: <span id="direction">No turn yet</span> · <span id="timing"></span></p>
      <ol id="events" aria-label="Recent cube turns"></ol>
    </div>`;
}
