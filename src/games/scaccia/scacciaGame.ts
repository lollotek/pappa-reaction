import { TARGET_OPTIONS } from '../../config/settings';
import type { GameDef } from '../../game/GameDef';
import type { ScacciaScene } from './render/ScacciaScene';
import { ScacciaSession } from './ScacciaSession';
import { scacciaTuning } from './tuning';

const minutes = scacciaTuning.match.timeLimit / 60;

/** Scaccia la palla dentro l'App comune: partite, voci di menu, regole. */
export function scacciaGame(scene: ScacciaScene): GameDef<ScacciaSession> {
  return {
    id: 'scaccia',
    title: 'Scaccia la palla',
    keyActions: [
      { action: 'left', label: 'sinistra' },
      { action: 'right', label: 'destra' },
      { action: 'dash', label: 'smash' },
    ],
    touchControls: 'strip',

    createSession: (deps, req, realNow) => new ScacciaSession(deps, scene, req, realNow),

    setupItems: (s) => [
      {
        kind: 'choice',
        label: 'Punti per vincere',
        options: TARGET_OPTIONS.map(String),
        get: () => TARGET_OPTIONS.indexOf(s.get().targetScore as 3 | 5 | 7),
        set: (v) => s.update({ targetScore: TARGET_OPTIONS[v] }),
      },
    ],

    optionItems: (s) => ({
      items: [
        {
          kind: 'choice',
          label: 'Limite di tempo',
          options: ['no', `${minutes} min`],
          get: () => (s.get().timeLimit ? 1 : 0),
          set: (v) => s.update({ timeLimit: v === 1 }),
        },
      ],
      notes: [`Limite di tempo: dopo ${minutes} minuti vince chi è in testa.`],
    }),

    rulesHtml: `
  <p><b>Lo scopo.</b> Ogni gatto difende la sua cuccia dietro al cuscino a salsicciotto.
    Respingi le palline verso le cucce degli altri e non farle entrare nella tua.</p>
  <p><b>I punti.</b> Pallina nella cuccia di un altro: <b>+1</b> all'ultimo gatto che l'ha
    toccata (l'alone sotto la palla ha il suo colore). Pallina nella tua cuccia: <b>−1</b>
    (mai sotto zero). Una pallina appena nata e mai toccata fa solo perdere il punto.</p>
  <p><b>Le palline.</b> Ne arriva una nuova dal centro ogni tanto, fino a 3 in campo; se il
    campo resta vuoto ne arriva subito un'altra. Più restano in gioco, più vanno veloci.</p>
  <p><b>Lo smash.</b> Premi <b>SMASH</b> appena prima che la palla arrivi: la zampata la
    rilancia molto più forte, con la scia. Se intanto corri di lato le dai <b>effetto</b> e
    la traiettoria curva.</p>
  <p><b>Il consiglio.</b> Tieni il cuscino al centro del tuo lato e spostati verso gli
    angoli solo quando serve.</p>
  <p><b>La partita.</b> Vince il primo che arriva ai punti scelti (3, 5 o 7). Con il limite
    di tempo, allo scadere vince chi è in testa; se in testa sono pari, il prossimo gol decide.</p>
  <p><b>I lati.</b> Il primo giocatore umano è in basso, il secondo in alto, poi ai lati.
    Ai lati "sinistra" fa salire il cuscino e "destra" lo fa scendere.</p>
  <p><b>Controller.</b> Levetta o croce per muoversi, A (o RB) smash, START pausa.</p>`,

    rulesTouchHtml: `
  <p><b>Su telefono e tablet.</b> Tieni il dispositivo in orizzontale. Trascina il dito sulla
    striscia: il cuscino segue il dito. SMASH è il pulsante tondo. Da soli: striscia a sinistra,
    SMASH a destra; in due: ognuno ha striscia e SMASH sul suo lato.
    Per la pausa tieni premuto il pulsante in alto al centro.</p>`,

    touchControlsHtml: `
<p class="menu-text">Si gioca con la <b>striscia</b> da trascinare (il cuscino segue il dito) e il
  pulsante <b>SMASH</b>, in orizzontale. Da soli: striscia sotto il pollice sinistro, SMASH sotto il
  destro. In due: striscia e SMASH su ogni lato.</p>`,

    touchHumansHtml: (tags) =>
      tags.length === 1
        ? `<p class="menu-keys">${tags[0]} striscia a sinistra · SMASH a destra</p>`
        : `<p class="menu-keys">${tags[0]} comandi a sinistra (in basso) · ${tags[1]} a destra (in alto)</p>
      <p class="menu-text">Al massimo 2 giocatori con i comandi touch.</p>`,
  };
}
