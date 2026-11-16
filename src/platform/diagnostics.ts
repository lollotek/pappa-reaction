/**
 * Riga di diagnosi nelle Opzioni: con uno screenshot di un playtester si capisce
 * perché i comandi touch o lo schermo intero non partono.
 */

/** Browser e sistema in breve, dallo user agent (es. "Chrome 131 · Android 14"). */
export function describeBrowser(ua: string): string {
  const v = (re: RegExp) => re.exec(ua)?.[1];
  let browser = 'browser ?';
  const rules: [RegExp, string][] = [
    [/SamsungBrowser\/(\d+)/, 'Samsung Internet'],
    [/EdgA?\/(\d+)/, 'Edge'],
    [/OPR\/(\d+)/, 'Opera'],
    [/FxiOS\/(\d+)/, 'Firefox'],
    [/Firefox\/(\d+)/, 'Firefox'],
    [/CriOS\/(\d+)/, 'Chrome'],
    [/Chrome\/(\d+)/, 'Chrome'],
    [/Version\/(\d+)[.\d]* .*Safari/, 'Safari'],
  ];
  for (const [re, name] of rules) {
    const n = v(re);
    if (n) {
      browser = `${name} ${n}`;
      break;
    }
  }
  // Browser dentro un'app (WebView): spesso senza schermo intero né installazione.
  const app =
    v(/(Instagram|FBAN|FBAV|WhatsApp|Telegram|Line)\b/) ?? (/; wv\)/.test(ua) ? 'WebView' : '');
  if (app) browser += ` in ${app === 'FBAN' || app === 'FBAV' ? 'Facebook' : app}`;

  let os = '';
  const android = v(/Android (\d+)/);
  const ios = v(/(?:iPhone|CPU) OS (\d+)/);
  if (android) os = `Android ${android}`;
  else if (ios) os = /iPad/.test(ua) ? `iPadOS ${ios}` : `iOS ${ios}`;
  else if (/Windows/.test(ua)) os = 'Windows';
  // "Sito desktop" si presenta come Mac (iPhone, iPad) o come Linux (Android).
  else if (/Macintosh/.test(ua)) os = 'Mac';
  else if (/Linux/.test(ua)) os = 'Linux';
  return os ? `${browser} · ${os}` : browser;
}

export interface DiagnosticsInput {
  ua: string;
  /** Puntatore principale: dito (`coarse`), mouse (`fine`) o nessuno. */
  pointer: 'dito' | 'mouse' | 'nessuno';
  maxTouchPoints: number;
  sawTouch: boolean;
  touchPref: string;
  touchMode: boolean;
  fullscreenApi: boolean;
  standalone: boolean;
  canPromptInstall: boolean;
  width: number;
  height: number;
}

const yn = (b: boolean) => (b ? 'sì' : 'no');

export function diagnosticsLine(d: DiagnosticsInput): string {
  return [
    describeBrowser(d.ua),
    `${d.width}×${d.height}`,
    `puntatore ${d.pointer}, ${d.maxTouchPoints} tocchi`,
    `tocco visto ${yn(d.sawTouch)}`,
    `touch ${d.touchPref}→${yn(d.touchMode)}`,
    `schermo intero ${yn(d.fullscreenApi)}`,
    `app ${d.standalone ? 'installata' : d.canPromptInstall ? 'installabile' : 'no'}`,
  ].join(' · ');
}
