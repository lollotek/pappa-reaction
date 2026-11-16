/**
 * Logica di un menu da tastiera (senza DOM): voci, selezione, scelte,
 * cursori e cattura di un tasto. La vista (MenuView) si limita a disegnarlo.
 */

export type MenuItem =
  | { kind: 'action'; label: string; onSelect: () => void; accent?: boolean }
  | {
      kind: 'choice';
      label: string;
      options: readonly string[];
      get: () => number;
      set: (index: number) => void;
      color?: string;
    }
  | {
      kind: 'slider';
      label: string;
      min: number;
      max: number;
      get: () => number;
      set: (v: number) => void;
    }
  | {
      kind: 'key';
      label: string;
      get: () => string;
      /** Restituisce un messaggio d'errore oppure null se il tasto è stato accettato. */
      capture: (code: string) => string | null;
      color?: string;
    }
  /** `wide`: su tutta la larghezza anche nei menu a due colonne, e va a capo. */
  | { kind: 'info'; label: string; wide?: boolean };

export type MenuKey = 'up' | 'down' | 'left' | 'right' | 'enter' | 'back';

export class MenuModel {
  selected = 0;
  /** In attesa di un tasto da assegnare (voce `key`). */
  capturing = false;
  message = '';
  /**
   * Navigazione "a vista" (voci su più colonne): la voce vicina nella direzione
   * data, o null se non ce n'è. Senza, le frecce seguono l'ordine della lista.
   */
  spatial: ((from: number, dir: 'up' | 'down' | 'left' | 'right') => number | null) | null =
    null;

  constructor(
    readonly title: string,
    public items: MenuItem[],
    private readonly onBack?: () => void,
  ) {
    this.selected = this.firstSelectable();
  }

  get current(): MenuItem | undefined {
    return this.items[this.selected];
  }

  /** Gestisce un comando di navigazione. Restituisce true se ha avuto effetto. */
  press(key: MenuKey): boolean {
    if (this.capturing) {
      if (key === 'back') {
        this.capturing = false;
        this.message = '';
        return true;
      }
      return false; // gli altri tasti arrivano da `capture`
    }
    const item = this.current;
    switch (key) {
      case 'up':
      case 'down': {
        const dir = key === 'up' ? -1 : 1;
        if (!this.spatial) return this.move(dir);
        // Oltre il bordo si riparte dall'altra estremità della lista.
        const i = this.spatial(this.selected, key) ?? this.edge(dir === 1 ? 'first' : 'last');
        return this.goTo(i);
      }
      case 'left':
      case 'right': {
        if (item && (item.kind === 'choice' || item.kind === 'slider')) {
          return this.adjust(item, key === 'left' ? -1 : 1);
        }
        const i = this.spatial?.(this.selected, key);
        return i == null ? false : this.goTo(i);
      }
      case 'enter':
        return item ? this.activate(item) : false;
      case 'back':
        if (!this.onBack) return false;
        this.onBack();
        return true;
    }
  }

  /** Tasto premuto durante la cattura: lo assegna o mostra l'errore. */
  capture(code: string): void {
    const item = this.current;
    if (!this.capturing || item?.kind !== 'key') return;
    const error = item.capture(code);
    this.message = error ?? '';
    if (!error) this.capturing = false;
  }

  select(index: number): void {
    if (this.isSelectable(index)) this.selected = index;
  }

  activate(item: MenuItem): boolean {
    this.message = '';
    switch (item.kind) {
      case 'action':
        item.onSelect();
        return true;
      case 'choice':
        return this.adjust(item, 1);
      case 'key':
        this.capturing = true;
        this.message = 'Premi il nuovo tasto… (ESC annulla)';
        return true;
      default:
        return false;
    }
  }

  adjust(item: MenuItem, dir: -1 | 1): boolean {
    if (item.kind === 'choice') {
      const n = item.options.length;
      item.set((item.get() + dir + n) % n);
      return true;
    }
    if (item.kind === 'slider') {
      const v = Math.min(item.max, Math.max(item.min, item.get() + dir));
      if (v === item.get()) return false;
      item.set(v);
      return true;
    }
    return false;
  }

  private move(dir: -1 | 1): boolean {
    const n = this.items.length;
    for (let step = 1; step <= n; step++) {
      const i = (this.selected + dir * step + n * step) % n;
      if (this.isSelectable(i)) {
        this.selected = i;
        this.message = '';
        return true;
      }
    }
    return false;
  }

  private goTo(i: number): boolean {
    if (i === this.selected || !this.isSelectable(i)) return false;
    this.selected = i;
    this.message = '';
    return true;
  }

  private edge(which: 'first' | 'last'): number {
    const order = this.items.map((_, i) => i);
    if (which === 'last') order.reverse();
    return order.find((i) => this.isSelectable(i)) ?? this.selected;
  }

  private isSelectable(i: number): boolean {
    const item = this.items[i];
    return item !== undefined && item.kind !== 'info';
  }

  private firstSelectable(): number {
    const i = this.items.findIndex((it) => it.kind !== 'info');
    return Math.max(0, i);
  }
}
