// Keep model fitting in the camera's original coordinates; reflect only the
// presentation and public actions, so the physical colour layout stays valid.
export function mirrorTurn(turn) {
  const directions = { left: 'right', right: 'left', clockwise: 'anticlockwise', anticlockwise: 'clockwise' };
  return { ...turn, direction: directions[turn.direction] ?? turn.direction };
}

export function previewToSource(clientX, clientY, rect, width, height) {
  const u = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  const v = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
  return { x: (1 - u) * width, y: v * height };
}
