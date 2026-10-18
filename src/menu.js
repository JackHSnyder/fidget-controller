// Owns menu rendering, selection, and keyboard controls.
// main.js connects cube turns to the exposed moveSelection() method.
export function createMenu() {
  const grid = document.getElementById('menu-grid');
  const status = document.getElementById('menu-status');
  const columns = 1;
  const items = [
    { label: 'Home', href: './home.html' },
    { label: 'Play', href: './play.html' },
    { label: 'Settings', href: './settings.html' },
  ];
  const buttons = [];
  let selected = 1; // Start on the middle item.

  function select(index, moveFocus = false) {
    selected = index;
    buttons.forEach((button, i) => {
      button.setAttribute('aria-pressed', String(i === selected));
      button.tabIndex = i === selected ? 0 : -1;
    });
    status.textContent = `Selected: ${items[selected].label}`;
    if (moveFocus) buttons[selected].focus();
  }

  function moveSelection(direction, moveFocus = false) {
    const row = Math.floor(selected / columns), column = selected % columns;
    // Stop at the edge. Ignore uncertain, diagonal, and roll events.
    switch (direction) {
      case 'left': case 'right': break;
      case 'up': if (row > 0) select(selected - columns, moveFocus); break;
      case 'down': if (row < Math.ceil(items.length / columns) - 1) select(selected + columns, moveFocus); break;
    }
  }

  items.forEach((item, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = item.label;
    button.addEventListener('focus', () => select(index));
    buttons.push(button);
    grid.append(button);
  });
  select(selected);

  // Keyboard controls only apply while focus is inside this menu.
  grid.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!event.repeat) activateSelection();
      return;
    }
    const direction = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[event.key];
    if (!direction) return;
    event.preventDefault();
    moveSelection(direction, true);
  });
  document.getElementById('menu-reset').addEventListener('click', () => select(1));

  function activateSelection(press = {}) {
    const item = items[selected];
    status.textContent = `Activated: ${item.label}${press.colour ? ` · ${press.colour.replaceAll('-', ' ')} key` : ''}`;
    window.dispatchEvent(new CustomEvent('menuactivate', { detail: { ...press, item: item.label } }));
    window.location.assign(item.href);
  }

  return { moveSelection, activateSelection };
}
