import { ROUND_OPTIONS } from '../../config/settings';
import type { GameDef } from '../../game/GameDef';
import type { GraffioScene } from './render/GraffioScene';
import { GraffioSession } from './GraffioSession';
import { graffioTuning } from './tuning';

const perfect = graffioTuning.scoring[0].points;

/** Graffio Killer dentro l'App comune: partite, voci di menu, regole. */
export function graffioGame(scene: GraffioScene): GameDef<GraffioSession> {
  return {
    id: 'graffio',
    title: 'Graffio Killer',
    keyActions: [{ action: 'dash', label: 'zampata' }],
    touchControls: 'single',

    createSession: (deps, req, realNow) => new GraffioSession(deps, scene, req, realNow),

    setupItems: (s) => [
      {
        kind: 'choice',
        label: 'Round',
        options: ROUND_OPTIONS.map(String),
        get: () => ROUND_OPTIONS.indexOf(s.get().roundCount as 3 | 5 | 7),
        set: (v) => s.update({ roundCount: ROUND_OPTIONS[v] }),
      },
    ],

    optionItems: () => ({ items: [], notes: [] }),

    rulesHtml: `
  <p><b>Lo scopo.</b> Ogni gatto sta sul suo tiragraffi. Davanti a lui cade un tubo di cartone
    con una <b>tacca rossa</b> (uguale per tutti, diversa a ogni round). Dai la <b>zampata</b>
    nell'istante in cui la tacca passa sulla <b>linea gialla</b> segnata dalle tacchette ai lati.</p>
  <p><b>I punti.</b> Più il taglio è vicino alla tacca, più punti: <b>${perfect}</b> se è perfetto,
    poi 7, 5, 3 e 1. Troppo presto, troppo tardi o niente zampata: <b>0</b>.
    Hai <b>una sola zampata</b> a round: se la dai mentre i tubi sono ancora fermi, è persa.</p>
  <p><b>La caduta.</b> I tubi si alzano, i gatti si mettono in posa e dopo una pausa a sorpresa
    cadono, ognuno con un piccolo ritardo diverso: non si può copiare il vicino.
    Round dopo round i tubi cadono <b>sempre più veloci</b>.</p>
  <p><b>La partita.</b> Si giocano 3, 5 o 7 round (a scelta nel menu Nuova partita). Vince chi
    ha più punti; a parità vince chi è stato più preciso in millisecondi.</p>
  <p><b>Controller.</b> A (o RB) per la zampata, START pausa.</p>`,

    rulesTouchHtml: `
  <p><b>Su telefono e tablet.</b> Tieni il dispositivo in orizzontale e tocca il pulsante
    <b>ZAMPATA</b>. Da soli: pulsante a destra; in due: ognuno ha il suo pulsante, uno per lato.
    Per la pausa tieni premuto il pulsante in alto al centro.</p>`,

    touchControlsHtml: `
<p class="menu-text">Si gioca con un solo pulsante, <b>ZAMPATA</b>, in orizzontale. Da soli: a destra.
  In due: un pulsante per lato.</p>`,

    touchHumansHtml: (tags) =>
      tags.length === 1
        ? `<p class="menu-keys">${tags[0]} ZAMPATA a destra</p>`
        : `<p class="menu-keys">${tags[0]} ZAMPATA a sinistra · ${tags[1]} a destra</p>
      <p class="menu-text">Al massimo 2 giocatori con i comandi touch.</p>`,
  };
}
