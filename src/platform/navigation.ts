/**
 * Passaggi tra l'hub e le pagine dei giochi.
 *
 * Dall'hub si apre il gioco come pagina nuova; per tornare all'hub si torna
 * indietro nella cronologia (se il gioco era stato aperto dall'hub), così
 * l'Indietro di Android sull'hub esce davvero dall'app invece di riaprire il gioco.
 */
const FROM_HUB = 'priamo.fromHub';

export function openGame(url: string): void {
  try {
    sessionStorage.setItem(FROM_HUB, '1');
  } catch {
    /* senza sessionStorage si torna all'hub ricaricandolo */
  }
  location.assign(url);
}

/**
 * Torna all'hub. `extraEntries`: voci aggiunte alla cronologia dalla pagina
 * del gioco (vedi BackButton), da saltare insieme alla pagina stessa.
 */
export function backToHub(hubUrl: string, extraEntries: number): void {
  // Gioco aperto dentro l'hub (iframe): l'hub lo chiude e sistema la cronologia.
  if (window.parent !== window) {
    try {
      window.parent.postMessage({ priamo: 'close', extra: extraEntries }, location.origin);
      return;
    } catch {
      /* non si riesce a parlare con l'hub: si va alla pagina dell'hub */
    }
  }
  let fromHub = false;
  try {
    fromHub = sessionStorage.getItem(FROM_HUB) === '1';
  } catch {
    /* come sopra */
  }
  if (fromHub && history.length > 1 + extraEntries) {
    history.go(-(1 + extraEntries));
    // Se la cronologia non porta all'hub (pagina ricaricata in modo strano): si va a mano.
    const fallback = window.setTimeout(() => location.replace(hubUrl), 600);
    window.addEventListener('pagehide', () => window.clearTimeout(fallback), { once: true });
  } else {
    location.replace(hubUrl);
  }
}
