import { ROUND_OPTIONS } from '../../config/settings';
import type { GameDef } from '../../game/GameDef';
import { MatchSession } from '../../game/MatchSession';
import type { MatchScene } from '../../scenes/MatchScene';

/** Pappa Reaction dentro l'App comune: partite, voci di menu, regole. */
export function pappaGame(scene: MatchScene): GameDef<MatchSession> {
  return {
    id: 'pappa',
    title: 'Pappa Reaction',
    keyActions: [
      { action: 'dash', label: 'scatto' },
      { action: 'fake', label: 'finta' },
    ],
    touchControls: 'buttons',

    createSession(deps, req, realNow) {
      const demo = !req.showHud;
      return new MatchSession(
        { ...deps, scene },
        {
          players: req.players,
          difficulty: req.difficulty,
          roundCount: demo ? 5 : req.settings.roundCount,
          keys: req.settings.keys,
          trickyReferee: !demo && req.settings.trickyReferee,
          screenEffects: req.screenEffects,
          showHud: req.showHud,
          seed: req.seed,
        },
        realNow,
      );
    },

    setupItems: (s) => [
      {
        kind: 'choice',
        label: 'Round',
        options: ROUND_OPTIONS.map(String),
        get: () => ROUND_OPTIONS.indexOf(s.get().roundCount as 3 | 5 | 7),
        set: (v) => s.update({ roundCount: ROUND_OPTIONS[v] }),
      },
    ],

    optionItems: (s) => ({
      items: [
        {
          kind: 'choice',
          label: 'Arbitro',
          options: ['normale', 'furbo'],
          get: () => (s.get().trickyReferee ? 1 : 0),
          set: (v) => s.update({ trickyReferee: v === 1 }),
        },
      ],
      notes: ['Arbitro furbo: alle finte la musica fa un singhiozzo.'],
    }),

    rulesHtml: `
  <p><b>Lo scopo.</b> I gatti girano attorno alla ciotola. Quando la mano alza il coperchio
    e la musica si ferma, premi <b>SCATTO</b>: il più veloce prende la pappa.</p>
  <p><b>La pappa.</b> Crocchette 1 punto, tonno 2, salmone 3, gamberetto d'oro 5.
    Se due gatti sono più veloci entro 3 centesimi, se la dividono.</p>
  <p><b>Falsa partenza.</b> Se scatti con il coperchio chiuso sbatti contro il coperchio
    e resti stordito per 1,5 secondi.</p>
  <p><b>Le finte.</b> A volte la mano solleva appena il coperchio: è una finta, e la musica
    continua! Con <b>FINTA</b> puoi far finta di scattare per ingannare gli altri.</p>
  <p><b>La cacchetta.</b> Se sotto il coperchio c'è la cacchetta, <b>non scattare</b>:
    chi scatta salta il round dopo (all'ultimo round perde 1 punto).</p>
  <p><b>La partita.</b> Vince chi ha più punti dopo l'ultimo round. In caso di parità
    si va allo spareggio tra i primi.</p>
  <p><b>Controller.</b> A (o RB) scatto, B (o X) finta, START pausa.</p>`,

    rulesTouchHtml: `
  <p><b>Su telefono e tablet.</b> Tieni il dispositivo in orizzontale. Da soli: SCATTO a destra,
    FINTA a sinistra. In due: ognuno ha una colonna di pulsanti sul suo lato.
    Per la pausa tieni premuto il pulsante in alto al centro.</p>`,

    touchControlsHtml: `
<p class="menu-text">Si gioca con i pulsanti ai lati dello schermo, in orizzontale.
  Da soli: <b>SCATTO</b> sotto il pollice destro, <b>FINTA</b> sotto il sinistro.
  In due: una colonna di pulsanti per lato.</p>`,

    touchHumansHtml: (tags) =>
      tags.length === 1
        ? `<p class="menu-keys">${tags[0]} SCATTO a destra · FINTA a sinistra</p>`
        : `<p class="menu-keys">${tags[0]} pulsanti a sinistra · ${tags[1]} a destra</p>
      <p class="menu-text">Al massimo 2 giocatori con i pulsanti touch.</p>`,
  };
}
