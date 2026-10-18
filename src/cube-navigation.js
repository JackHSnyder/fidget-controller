// Up arms the return action; another valid turn cancels it. A subsequent key
// press confirms navigation instead of also triggering the game's press action.
export function createCubeNavigation(status) {
  let armed = false;
  const reset = () => { armed = false; status.textContent = 'Turn up, then press a cube key to return to the menu.'; };
  reset();
  document.addEventListener('visibilitychange', reset);
  return {
    handleRotation(direction) {
      if (direction === 'up') {
        armed = true;
        status.textContent = 'Press a cube key to return to the menu. Another turn cancels.';
        return true;
      }
      if (['left', 'right', 'down', 'clockwise', 'anticlockwise', 'diagonal'].includes(direction)) reset();
      return false;
    },
    handlePress() {
      if (!armed) return false;
      reset();
      window.location.assign('./index.html');
      return true;
    },
  };
}
