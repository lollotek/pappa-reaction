/**
 * Tocco/clic su un elemento `[data-tap]` dentro `root`: vale solo se pressione
 * e rilascio avvengono sullo stesso `data-tap` di questo pannello.
 *
 * Non si usa `click`: su telefono il browser lo genera dopo il rilascio, quando
 * la schermata può essere già cambiata, e finirebbe sul pulsante che nel
 * frattempo è comparso sotto il dito (es. "Indietro" della schermata appena aperta).
 */
export function onTap(root: HTMLElement, handler: (tap: string) => void): void {
  let down: string | null = null;
  const tapOf = (e: PointerEvent) =>
    (e.target as HTMLElement).closest<HTMLElement>('[data-tap]')?.dataset.tap ?? null;
  root.addEventListener('pointerdown', (e) => {
    down = e.button === 0 ? tapOf(e) : null;
  });
  root.addEventListener('pointerup', (e) => {
    const pressed = down;
    down = null;
    if (pressed !== null && tapOf(e) === pressed) handler(pressed);
  });
  root.addEventListener('pointercancel', () => (down = null));
}
