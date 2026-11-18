/**
 * Minigiochi di Priamo Stadium, nell'ordine in cui compaiono nell'hub.
 * Ogni gioco pronto ha la sua pagina in un sottopercorso (`/pappa/`) con
 * i propri parametri URL; quelli "prossimamente" hanno solo la scheda.
 */
export type GameId = 'pappa' | 'scaccia';

export interface GameInfo {
  id: GameId;
  /** Titolo sulla scheda (su due righe). */
  title: [string, string];
  /** Riga sotto le schede quando il gioco è selezionato. */
  tagline: string;
  players: string;
  status: 'ready' | 'soon';
  /** Colori della scheda: sfondo, sfondo scuro, scritte. */
  colors: { bg: string; dark: string; ink: string };
}

export const GAMES: readonly GameInfo[] = [
  {
    id: 'pappa',
    title: ['Pappa', 'Reaction'],
    tagline: 'Scatta quando si alza il coperchio… ma occhio a finte e cacchette!',
    players: '1–4 giocatori',
    status: 'ready',
    colors: { bg: '#6a3f8f', dark: '#3b2252', ink: '#ffb347' },
  },
  {
    id: 'scaccia',
    title: ['Scaccia', 'la palla'],
    tagline: 'Difendi la cuccia e rimanda le palline agli altri gatti… con lo smash!',
    players: '1–4 giocatori',
    status: 'ready',
    colors: { bg: '#3f7a52', dark: '#24452f', ink: '#ffe066' },
  },
];

/** Giochi con una pagina propria (sottopercorso). */
export const PLAYABLE_IDS: readonly GameId[] = GAMES.filter((g) => g.status === 'ready').map(
  (g) => g.id,
);
