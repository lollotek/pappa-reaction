import { keyLabel } from '../config/keyLabel';
import type { MenuItem, MenuModel } from './MenuModel';

const escape = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * Disegna un MenuModel come pannello DOM. Mouse: passarci sopra seleziona,
 * clic attiva, clic sulle frecce ‹ › cambia valore. La tastiera la gestisce l'App.
 */
export class MenuView {
  readonly root: HTMLElement;
  private model: MenuModel | null = null;

  constructor(
    container: HTMLElement,
    private readonly onChange: () => void,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'menu';
    this.root.hidden = true;
    container.appendChild(this.root);

    this.root.addEventListener('mousemove', (e) => {
      const li = (e.target as HTMLElement).closest<HTMLElement>('[data-index]');
      if (!li || !this.model || this.model.capturing) return;
      const i = Number(li.dataset.index);
      if (i !== this.model.selected) {
        this.model.select(i);
        this.render();
      }
    });
    // Clic gestito con pointerdown/pointerup e identificato dall'indice della voce,
    // non dall'elemento: se il menu viene ridisegnato tra pressione e rilascio
    // (es. l'audio si sblocca al primo clic) l'evento `click` andrebbe perso.
    let pressed: { index: number; dir: string | undefined } | null = null;
    const hit = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      const li = target.closest<HTMLElement>('[data-index]');
      if (!li) return null;
      return {
        index: Number(li.dataset.index),
        dir: target.closest<HTMLElement>('[data-dir]')?.dataset.dir,
      };
    };
    this.root.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      pressed = hit(e);
    });
    this.root.addEventListener('pointerup', (e) => {
      const down = pressed;
      pressed = null;
      const up = hit(e);
      if (!down || !up || up.index !== down.index || !this.model || this.model.capturing) return;
      const item = this.model.items[up.index];
      if (!item) return;
      this.model.select(up.index);
      if (down.dir) this.model.adjust(item, Number(down.dir) as -1 | 1);
      else this.model.activate(item);
      this.render();
      this.onChange();
    });
    this.root.addEventListener('pointerleave', () => (pressed = null));
  }

  /** `extra`: HTML aggiuntivo sotto il titolo (testo o funzione ricalcolata a ogni render). */
  show(model: MenuModel, extra: string | (() => string) = '', variant = ''): void {
    this.model = model;
    this.extra = typeof extra === 'string' ? () => extra : extra;
    this.root.className = variant ? `menu ${variant}` : 'menu';
    this.root.hidden = false;
    this.render();
  }

  hide(): void {
    this.model = null;
    this.root.hidden = true;
  }

  private extra: () => string = () => '';

  render(): void {
    const m = this.model;
    if (!m) return;
    const rows = m.items
      .map((item, i) => this.row(item, i, i === m.selected, m.capturing))
      .join('');
    this.root.innerHTML = `
      <h2>${escape(m.title)}</h2>
      ${this.extra()}
      <ul>${rows}</ul>
      <p class="menu-message">${escape(m.message)}</p>
      <p class="menu-help kbd-only">↑↓ scegli · ←→ cambia · INVIO conferma · ESC indietro</p>`;
  }

  private row(item: MenuItem, i: number, selected: boolean, capturing: boolean): string {
    const cls = ['menu-item', `menu-${item.kind}`];
    if (selected) cls.push('selected');
    if (item.kind === 'action' && item.accent) cls.push('accent');
    const color = 'color' in item && item.color ? ` style="--accent:${item.color}"` : '';
    const label = `<span class="menu-label">${escape(item.label)}</span>`;
    let value = '';
    switch (item.kind) {
      case 'choice':
        value = this.arrows(escape(item.options[item.get()]));
        break;
      case 'slider': {
        const blocks = Array.from({ length: item.max - item.min }, (_, k) =>
          k < item.get() - item.min ? '■' : '□',
        ).join('');
        value = this.arrows(`<span class="menu-bar">${blocks}</span> ${item.get()}`);
        break;
      }
      case 'key':
        value =
          selected && capturing
            ? '<kbd class="waiting">…</kbd>'
            : `<kbd>${escape(keyLabel(item.get()))}</kbd>`;
        break;
    }
    return `<li class="${cls.join(' ')}" data-index="${i}"${color}>${label}${value}</li>`;
  }

  private arrows(inner: string): string {
    return `<span class="menu-value"><span class="menu-arrow" data-dir="-1">‹</span>${inner}<span class="menu-arrow" data-dir="1">›</span></span>`;
  }
}
