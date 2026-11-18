import { describe, expect, it } from 'vitest';
import { Gamepads, type PadState } from '../src/input/Gamepads';

function pad(index: number, pressed: number[] = [], axes: number[] = [0, 0]): PadState {
  return {
    index,
    connected: true,
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i) })),
    axes,
  };
}

describe('controller', () => {
  it('conta solo la pressione, non il pulsante tenuto', () => {
    let state = [pad(0)];
    const g = new Gamepads(() => state);
    expect(g.poll(0).presses).toEqual([]);
    state = [pad(0, [0])];
    expect(g.poll(16).presses).toEqual([{ pad: 0, action: 'dash', t: 16 }]);
    expect(g.poll(32).presses).toEqual([]);
    state = [pad(0, [1])];
    expect(g.poll(48).presses).toEqual([{ pad: 0, action: 'fake', t: 48 }]);
  });

  it('un controller appena collegato con un pulsante già premuto non scatta', () => {
    const g = new Gamepads(() => [pad(0, [0])]);
    expect(g.poll(0).presses).toEqual([]);
  });

  it('il k-esimo controller comanda il k-esimo umano', () => {
    let state = [pad(0), pad(3)];
    const g = new Gamepads(() => state);
    g.poll(0);
    state = [pad(0), pad(3, [0])];
    const inputs = Gamepads.toInputs(g.poll(10), [1, 2]);
    expect(inputs).toEqual([{ player: 2, action: 'dash', t: 10 }]);
    // Più controller che umani: quelli in più non comandano nessuno.
    expect(Gamepads.toInputs(g.poll(20), [1])).toEqual([]);
  });

  it('zona morta e croce', () => {
    let state = [pad(0, [], [0.1, -0.2])];
    const g = new Gamepads(() => state);
    g.poll(0);
    expect(g.axis(0)).toEqual({ x: 0, y: 0 });
    state = [pad(0, [], [1, 0])];
    g.poll(1);
    expect(g.axis(0).x).toBeCloseTo(1);
    state = [pad(0, [14])];
    g.poll(2);
    expect(g.axis(0)).toEqual({ x: -1, y: 0 });
    expect(g.axis(5)).toEqual({ x: 0, y: 0 });
  });

  it('menu: frecce con ripetizione, A conferma, B indietro, START', () => {
    let state = [pad(0)];
    const g = new Gamepads(() => state);
    g.poll(0);
    state = [pad(0, [13])];
    expect(g.poll(10).menu).toEqual(['down']);
    expect(g.poll(100).menu).toEqual([]);
    expect(g.poll(400).menu).toEqual(['down']);
    state = [pad(0, [0, 9])];
    const f = g.poll(500);
    expect(f.menu).toEqual(['enter']);
    expect(f.start).toBe(true);
    state = [pad(0, [1])];
    expect(g.poll(520).menu).toEqual(['back']);
  });

  it('senza Gamepad API non succede niente', () => {
    const g = new Gamepads(() => {
      throw new Error('negato');
    });
    expect(g.poll(0)).toEqual({ presses: [], menu: [], start: false });
    expect(g.count).toBe(0);
  });
});
