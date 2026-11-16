import { keyLabel } from '../config/keyLabel';
import type { MenuItem, MenuModel } from './MenuModel';

const escape = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Ultimo modo con cui si è usato il menu: decide se mostrare la voce selezionata. */
export type MenuInput = 'key' | 'mouse' | 'touch';

/**
 * Disegna un MenuModel come pannello DOM. Mouse: passarci sopra seleziona,
 * clic attiva, clic sulle frecce ‹ › cambia valore. La tastiera la gestisce l'App.
 * Col dito non c'è una voce "selezionata": tutte le voci sembrano pulsanti e
 * si illuminano solo mentre il dito è appoggiato.
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

    this.setInput('key');
    // In cattura: il menu sa che si usa la tastiera prima che l'App la gestisca.
    window.addEventListener('keydown', () => this.setInput('key'), { capture: true });

    this.root.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      this.setInput('mouse');
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
    let pressedEl: HTMLElement | null = null;
    const release = () => {
      pressedEl?.classList.remove('pressed');
      pressedEl = null;
    };
    this.root.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this.setInput(e.pointerType === 'mouse' ? 'mouse' : 'touch');
      pressed = hit(e);
      release();
      const target = e.target as HTMLElement;
      pressedEl =
        target.closest<HTMLElement>('[data-dir]') ?? target.closest<HTMLElement>('[data-index]');
      pressedEl?.classList.add('pressed');
    });
    this.root.addEventListener('pointerup', (e) => {
      release();
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
    this.root.addEventListener('pointerleave', () => {
      pressed = null;
      release();
    });
    this.root.addEventListener('pointercancel', () => {
      pressed = null;
      release();
    });
  }

  setInput(input: MenuInput): void {
    this.root.dataset.input = input;
  }

  /** `extra`: HTML aggiuntivo sotto il titolo (testo o funzione ricalcolata a ogni render). */
  show(model: MenuModel, extra: string | (() => string) = '', variant = ''): void {
    this.model = model;
    model.spatial = (from, dir) => this.neighbor(from, dir);
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

  /** Voce selezionabile più vicina sullo schermo nella direzione data (menu su due colonne). */
  private neighbor(from: number, dir: 'up' | 'down' | 'left' | 'right'): number | null {
    const items = [...this.root.querySelectorAll<HTMLElement>('.menu-item[data-index]')]
      .filter((el) => !el.classList.contains('menu-info'))
      .map((el) => ({ i: Number(el.dataset.index), r: el.getBoundingClientRect() }));
    const cur = items.find((it) => it.i === from)?.r;
    if (!cur) return null;
    const cx = (r: DOMRect) => r.left + r.width / 2;
    const cy = (r: DOMRect) => r.top + r.height / 2;
    let best: number | null = null;
    let bestScore = Infinity;
    for (const { i, r } of items) {
      if (i === from) continue;
      let ahead: boolean;
      let main: number;
      let cross: number;
      if (dir === 'up' || dir === 'down') {
        ahead = dir === 'down' ? r.top >= cur.bottom - 2 : r.bottom <= cur.top + 2;
        main = Math.abs(cy(r) - cy(cur));
        // Per una voce a tutta larghezza conta quanto si sovrappone, non il centro.
        const overlap = Math.min(r.right, cur.right) - Math.max(r.left, cur.left);
        cross = overlap > 0 ? 0 : Math.abs(cx(r) - cx(cur));
      } else {
        const sameRow = Math.min(r.bottom, cur.bottom) - Math.max(r.top, cur.top) > 0;
        ahead = sameRow && (dir === 'right' ? cx(r) > cx(cur) : cx(r) < cx(cur));
        main = Math.abs(cx(r) - cx(cur));
        cross = 0;
      }
      if (!ahead) continue;
      const score = main + cross * 4;
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    return best;
  }

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
    if (item.kind === 'info' && item.wide) cls.push('menu-span');
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
