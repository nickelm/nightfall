import { saveSetting } from '../../client/core/settings.js';

// A real button keeps mouse clicks out of the canvas's mining/attack input.
export function updateMovementControl(game) {
  if (!game._movementControl) {
    const button = document.createElement('button');
    button.type = 'button';
    const label = document.createElement('span');
    const hint = document.createElement('span');
    button.append(label, hint);
    Object.assign(button.style, {
      position: 'fixed', top: '12px', left: '12px', zIndex: '1',
      display: 'flex', flexDirection: 'column', gap: '2px',
      padding: '8px 14px', textAlign: 'left', cursor: 'pointer',
      background: game.theme.colors.panel, color: game.theme.colors.candle,
      border: `1px solid ${game.theme.colors.pumpkin}`, borderRadius: '6px',
      font: game.font(18), maxWidth: 'calc(100vw - 24px)',
    });
    Object.assign(hint.style, { font: game.font(14), color: game.theme.colors.bone });
    // Mouse clicks keep focus on the game; activating the button must not attack.
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('keydown', (event) => {
      if (event.code === 'Space' || event.code === 'Enter') event.stopPropagation();
    });
    button.addEventListener('click', () => {
      saveSetting(game, 'movement', game.settings.movement === 'screen' ? 'facing' : 'screen');
      updateMovementControl(game);
    });
    document.body.append(button);
    game._movementControl = { button, label, hint };
  }

  const { button, label, hint } = game._movementControl;
  button.style.display = game.ui ? 'none' : 'flex';
  const mode = game.settings.movement;
  if (button.dataset.mode === mode) return;
  button.dataset.mode = mode;
  const screen = mode === 'screen';
  button.setAttribute('aria-pressed', String(screen));
  button.title = screen
    ? 'Move independently of aim. Click to switch to cursor-relative movement.'
    : 'W moves toward the cursor. Click to switch to screen-relative movement.';
  label.textContent = screen ? 'Movement: Screen' : 'Movement: Cursor';
  hint.textContent = screen ? 'W ↑ · A ← · S ↓ · D →' : 'W toward cursor · A/D strafe';
}
