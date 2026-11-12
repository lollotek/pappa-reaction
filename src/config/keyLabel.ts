const NAMED: Record<string, string> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Space: 'Spazio',
  ShiftLeft: 'Shift sx',
  ShiftRight: 'Shift dx',
  ControlLeft: 'Ctrl sx',
  ControlRight: 'Ctrl dx',
  AltLeft: 'Alt',
  AltRight: 'AltGr',
  Backspace: '⌫',
  Comma: ',',
  Period: '.',
  Slash: '-',
  Semicolon: 'ò',
  Quote: 'à',
  BracketLeft: 'è',
  BracketRight: '+',
  Backslash: 'ù',
  Minus: "'",
  Equal: 'ì',
  IntlBackslash: '<',
};

/** Nome leggibile di un tasto (`KeyboardEvent.code`), pensato per tastiera italiana. */
export function keyLabel(code: string): string {
  if (NAMED[code]) return NAMED[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return code;
}
