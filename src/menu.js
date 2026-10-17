// This module consumes controller events. It does not know about the camera,
// colours, or pose fitting, so the same pattern can drive another application.
const grid = document.getElementById('menu-grid');
const status = document.getElementById('menu-status');
const columns = 3;
const items = ['Home', 'Music', 'Games', 'Photos', 'Messages', 'Notes', 'Calendar', 'Settings', 'Help'];
const buttons = [];
let selected = 4; // Start in the centre, with a neighbour in each direction.

function select(index, moveFocus = false) {
  selected = index;
  buttons.forEach((button, i) => {
    button.setAttribute('aria-pressed', String(i === selected));
    button.tabIndex = i === selected ? 0 : -1;
  });
  status.textContent = `Selected: ${items[selected]}`;
  if (moveFocus) buttons[selected].focus();
}

export function moveSelection(direction, moveFocus = false) {
  const row = Math.floor(selected / columns), column = selected % columns;
  // Stop at the edge. Ignore uncertain, diagonal, and roll events.
  switch (direction) {
    case 'left': if (column > 0) select(selected - 1, moveFocus); break;
    case 'right': if (column < columns - 1) select(selected + 1, moveFocus); break;
    case 'up': if (row > 0) select(selected - columns, moveFocus); break;
    case 'down': if (row < Math.ceil(items.length / columns) - 1) select(selected + columns, moveFocus); break;
  }
}

items.forEach((name, index) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = name;
  button.addEventListener('click', () => select(index));
  buttons.push(button);
  grid.append(button);
});
select(selected);

// The integration point: one detected cube turn moves one menu cell.
window.addEventListener('fidgetrotation', ({ detail }) => {
  moveSelection(detail?.direction);
});

// Keyboard controls only apply while focus is inside this menu.
grid.addEventListener('keydown', event => {
  const direction = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[event.key];
  if (!direction) return;
  event.preventDefault();
  moveSelection(direction, true);
});
document.getElementById('menu-reset').addEventListener('click', () => select(4));
