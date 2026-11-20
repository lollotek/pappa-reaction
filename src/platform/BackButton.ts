/**
 * Tasto/gesto Indietro (Android) e pulsante Indietro del browser.
 *
 * Si "arma" aggiungendo una voce alla cronologia: quando l'utente torna
 * indietro la voce viene consumata e arriva `popstate`. Se il gioco gestisce
 * l'Indietro (pausa, menu precedente) la voce si rimette; sul titolo no,
 * così un secondo Indietro esce davvero dal gioco.
 */
export class BackButton {
  private armed = false;

  constructor(
    /** Restituisce true se l'Indietro è stato gestito dal gioco. */
    private readonly onBack: () => boolean,
    private readonly win: Window = window,
  ) {
    const back = () => {
      this.armed = false;
      if (this.onBack()) this.arm();
    };
    if (this.embedded) {
      // Dentro l'hub la cronologia è solo dell'hub: avvisa lui di aggiungere la voce
      // e riceve da lui l'Indietro.
      win.addEventListener('message', (e) => {
        if (e.origin === win.location.origin && e.data?.priamo === 'back') back();
      });
    } else {
      win.addEventListener('popstate', back);
    }
  }

  /** Il gioco sta in un iframe dell'hub (l'hub gestisce la cronologia). */
  private get embedded(): boolean {
    return this.win.parent !== this.win;
  }

  /** Voci aggiunte alla cronologia e non ancora consumate (0 o 1). */
  get extraEntries(): number {
    return this.armed ? 1 : 0;
  }

  /** Da chiamare quando si entra in una schermata dove Indietro ha senso. */
  arm(): void {
    if (this.armed) return;
    this.armed = true;
    if (this.embedded) this.win.parent.postMessage({ priamo: 'arm' }, this.win.location.origin);
    else this.win.history.pushState({ pappa: true }, '');
  }
}
