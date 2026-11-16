/**
 * Funzioni del dispositivo per giocare su telefono e tablet (M10):
 * schermo intero, blocco della rotazione, niente standby.
 * Tutto è "se il browser lo permette": dove manca, il gioco funziona lo stesso.
 */

type OrientationWithLock = ScreenOrientation & { lock?: (type: string) => Promise<void> };
type WebkitDocument = Document & {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type WebkitElement = HTMLElement & {
  webkitRequestFullscreen?: (options?: FullscreenOptions) => Promise<void> | void;
};
interface WakeLockSentinelLike {
  released: boolean;
  release(): Promise<void>;
  addEventListener(type: 'release', fn: () => void): void;
}
type WakeLockNavigator = Navigator & {
  wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> };
  standalone?: boolean;
};

/**
 * Orientamento da bloccare: quello orizzontale attuale (primary o secondary),
 * non "landscape" generico, che lascerebbe capovolgere lo schermo inclinandolo.
 */
export function lockTypeFor(current: string | undefined): string {
  return current === 'landscape-primary' || current === 'landscape-secondary'
    ? current
    : 'landscape';
}

/** Evento di Chrome/Edge/Samsung Internet che permette di proporre l'installazione. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Pulsante "Installa": `prompt` apre la finestra del browser (Android, desktop Chromium),
 * `manual` mostra le istruzioni (iPhone, Firefox, browser dentro le app), null lo nasconde
 * (già installato, o computer senza la finestra del browser).
 */
export function installMode(o: {
  canPrompt: boolean;
  touch: boolean;
  standalone: boolean;
}): 'prompt' | 'manual' | null {
  if (o.standalone) return null;
  if (o.canPrompt) return 'prompt';
  return o.touch ? 'manual' : null;
}

/** iPhone o iPad (anche iPad che si presenta come Mac). */
export function isIosDevice(ua: string, maxTouchPoints: number): boolean {
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
}

export class Device {
  private wakeLock: WakeLockSentinelLike | null = null;
  private wantAwake = false;
  private readonly doc = document as WebkitDocument;
  private readonly nav = navigator as WakeLockNavigator;
  private installEvent: BeforeInstallPromptEvent | null = null;

  constructor(
    /** Il sistema (o l'utente) ha chiuso lo schermo intero. */
    onFullscreenExit: () => void,
    /** È cambiata la possibilità di installare il gioco (pulsante "Installa"). */
    onInstallChange: () => void = () => {},
  ) {
    // Il browser propone l'installazione: si tiene l'evento per il pulsante "Installa".
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.installEvent = e as BeforeInstallPromptEvent;
      onInstallChange();
    });
    window.addEventListener('appinstalled', () => {
      this.installEvent = null;
      onInstallChange();
    });
    const onChange = () => {
      if (!this.isFullscreen) onFullscreenExit();
    };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    // Il wake lock viene rilasciato quando la pagina va in secondo piano: si richiede al ritorno.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.updateWakeLock();
    });
  }

  /** Il browser permette lo schermo intero di una pagina (no su iPhone). */
  get fullscreenSupported(): boolean {
    return Boolean(this.doc.fullscreenEnabled || this.doc.webkitFullscreenEnabled);
  }

  get isFullscreen(): boolean {
    return Boolean(this.doc.fullscreenElement || this.doc.webkitFullscreenElement);
  }

  /** Avviato dalla schermata Home (PWA installata). */
  get standalone(): boolean {
    const mode = (m: string) => window.matchMedia?.(`(display-mode: ${m})`).matches ?? false;
    return mode('fullscreen') || mode('standalone') || this.nav.standalone === true;
  }

  /** Il browser può mostrare la sua finestra di installazione. */
  get canPromptInstall(): boolean {
    return this.installEvent !== null;
  }

  get isIos(): boolean {
    return isIosDevice(navigator.userAgent, navigator.maxTouchPoints ?? 0);
  }

  /** Apre la finestra di installazione del browser (serve un gesto). L'evento vale una volta sola. */
  async promptInstall(): Promise<boolean> {
    const e = this.installEvent;
    if (!e) return false;
    this.installEvent = null;
    try {
      await e.prompt();
      return (await e.userChoice).outcome === 'accepted';
    } catch {
      return false;
    }
  }

  get wakeLockSupported(): boolean {
    return this.nav.wakeLock !== undefined;
  }

  /**
   * Schermo intero e blocco della rotazione. Va chiamato da un gesto
   * dell'utente (tocco, tasto): altrimenti il browser rifiuta, in silenzio.
   */
  async enterFullscreen(): Promise<void> {
    if (!this.fullscreenSupported || this.isFullscreen) return;
    const el = document.documentElement as WebkitElement;
    try {
      if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
      else await el.webkitRequestFullscreen?.();
    } catch {
      return;
    }
    await this.lockOrientation();
  }

  async exitFullscreen(): Promise<void> {
    if (!this.isFullscreen) return;
    try {
      if (document.exitFullscreen) await document.exitFullscreen();
      else await this.doc.webkitExitFullscreen?.();
    } catch {
      /* già uscito */
    }
  }

  /** Blocca l'orizzontale attuale (Android, solo a schermo intero). */
  async lockOrientation(): Promise<void> {
    const o = screen.orientation as OrientationWithLock | undefined;
    if (!o?.lock) return;
    try {
      await o.lock(lockTypeFor(o.type));
    } catch {
      /* non supportato (iPhone, desktop) o non a schermo intero */
    }
  }

  /** Tiene acceso lo schermo finché il gioco è visibile. */
  keepAwake(on: boolean): void {
    this.wantAwake = on;
    void this.updateWakeLock();
  }

  private async updateWakeLock(): Promise<void> {
    if (!this.wantAwake) {
      const lock = this.wakeLock;
      this.wakeLock = null;
      await lock?.release().catch(() => {});
      return;
    }
    if (!this.nav.wakeLock || document.visibilityState !== 'visible') return;
    if (this.wakeLock && !this.wakeLock.released) return;
    try {
      const lock = await this.nav.wakeLock.request('screen');
      this.wakeLock = lock;
      lock.addEventListener('release', () => {
        if (this.wakeLock === lock) this.wakeLock = null;
      });
    } catch {
      /* rifiutato (risparmio energetico, pagina non visibile): si riprova al ritorno */
    }
  }
}
