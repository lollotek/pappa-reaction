import { describe, expect, it } from 'vitest';
import { MenuModel, type MenuItem } from '../src/ui/MenuModel';

function build() {
  const state = { choice: 0, slider: 5, key: 'KeyQ', actions: [] as string[], back: 0 };
  const items: MenuItem[] = [
    { kind: 'info', label: 'titoletto' },
    { kind: 'action', label: 'Gioca', onSelect: () => state.actions.push('gioca') },
    {
      kind: 'choice',
      label: 'Priamo',
      options: ['Umano', 'CPU'],
      get: () => state.choice,
      set: (i) => (state.choice = i),
    },
    {
      kind: 'slider',
      label: 'Volume',
      min: 0,
      max: 10,
      get: () => state.slider,
      set: (v) => (state.slider = v),
    },
    {
      kind: 'key',
      label: 'Scatto',
      get: () => state.key,
      capture: (code) => (code === 'Enter' ? 'riservato' : ((state.key = code), null)),
    },
  ];
  const menu = new MenuModel('Test', items, () => state.back++);
  return { menu, state };
}

describe('MenuModel', () => {
  it('parte dalla prima voce selezionabile e salta le info', () => {
    const { menu } = build();
    expect(menu.selected).toBe(1);
    menu.press('up'); // dalla prima voce, su → ultima (le info si saltano)
    expect(menu.selected).toBe(4);
    menu.press('down');
    expect(menu.selected).toBe(1);
  });

  it('azioni, scelte e cursori', () => {
    const { menu, state } = build();
    menu.press('enter');
    expect(state.actions).toEqual(['gioca']);
    menu.press('down');
    menu.press('right');
    expect(state.choice).toBe(1);
    menu.press('right'); // ciclico
    expect(state.choice).toBe(0);
    menu.press('left');
    expect(state.choice).toBe(1);
    menu.press('down');
    menu.press('right');
    expect(state.slider).toBe(6);
    for (let i = 0; i < 10; i++) menu.press('right');
    expect(state.slider).toBe(10); // limitato al massimo
  });

  it('cattura di un tasto: errore, poi accettato; ESC annulla', () => {
    const { menu, state } = build();
    menu.select(4);
    menu.press('enter');
    expect(menu.capturing).toBe(true);
    menu.capture('Enter');
    expect(menu.capturing).toBe(true);
    expect(menu.message).toBe('riservato');
    menu.capture('KeyZ');
    expect(menu.capturing).toBe(false);
    expect(state.key).toBe('KeyZ');

    menu.press('enter');
    menu.press('back');
    expect(menu.capturing).toBe(false);
    expect(state.back).toBe(0); // ESC durante la cattura non esce dal menu
    menu.press('back');
    expect(state.back).toBe(1);
  });
});
