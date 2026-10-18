// Display-only items are selected and activated exclusively by cube events.
// main.js connects cube turns to the exposed moveSelection() method.
export function createMenu() {
  const grid = document.getElementById('menu-grid');
  const status = document.getElementById('menu-status');
  const columns = 1;
  const items = [
    { label: 'Tetris', href: './tetris.html' },
    { label: 'Play', href: './play.html' },
    { label: 'Settings', href: './settings.html' },
  ];
  const buttons = [];
  let selected = 1; // Start on the middle item.

  function select(index) {
    selected = index;
    buttons.forEach((button, i) => {
      button.setAttribute('aria-current', String(i === selected));
    });
    status.textContent = `Selected: ${items[selected].label}`;
  }

  function moveSelection(direction) {
    const row = Math.floor(selected / columns), column = selected % columns;
    // Stop at the edge. Ignore uncertain, diagonal, and roll events.
    switch (direction) {
      case 'left': case 'right': break;
      case 'up': if (row > 0) select(selected - columns); break;
      case 'down': if (row < Math.ceil(items.length / columns) - 1) select(selected + columns); break;
    }
  }

  grid.setAttribute('role', 'list');
  items.forEach(item => {
    const button = document.createElement('div');
    button.className = 'menu-item';
    button.setAttribute('role', 'listitem');
    button.textContent = item.label;
    buttons.push(button);
    grid.append(button);
  });
  select(selected);

  function activateSelection(press = {}) {
    const item = items[selected];
    status.textContent = `Activated: ${item.label}${press.colour ? ` · ${press.colour.replaceAll('-', ' ')} key` : ''}`;
    window.dispatchEvent(new CustomEvent('menuactivate', { detail: { ...press, item: item.label } }));
    window.location.assign(item.href);
  }

  return { moveSelection, activateSelection };
}
