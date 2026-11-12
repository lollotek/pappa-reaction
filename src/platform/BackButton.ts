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
    win.addEventListener('popstate', () => {
      this.armed = false;
      if (this.onBack()) this.arm();
    });
  }

  /** Da chiamare quando si entra in una schermata dove Indietro ha senso. */
  arm(): void {
    if (this.armed) return;
    this.armed = true;
    this.win.history.pushState({ pappa: true }, '');
  }
}
