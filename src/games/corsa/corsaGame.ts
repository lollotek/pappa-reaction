import { LAP_OPTIONS } from '../../config/settings';
import type { GameDef } from '../../game/GameDef';
import { CorsaSession } from './CorsaSession';
import type { CorsaScene } from './render/CorsaScene';
import { corsaTuning } from './tuning';

const max = corsaTuning.trap.max;

/** Corsa pazza dentro l'App comune: partite, voci di menu, regole. */
export function corsaGame(scene: CorsaScene): GameDef<CorsaSession> {
  return {
    id: 'corsa',
    title: 'Corsa pazza',
    keyActions: [
      { action: 'up', label: 'su' },
      { action: 'down', label: 'giù' },
      { action: 'left', label: 'sinistra' },
      { action: 'right', label: 'destra' },
      { action: 'dash', label: 'cacchetta' },
    ],
    touchControls: 'stick',

    createSession: (deps, req, realNow) => new CorsaSession(deps, scene, req, realNow),

    setupItems: (s) => [
      {
        kind: 'choice',
        label: 'Giri',
        options: LAP_OPTIONS.map(String),
        get: () => Math.max(0, LAP_OPTIONS.indexOf(s.get().lapCount as 3 | 5 | 9)),
        set: (v) => s.update({ lapCount: LAP_OPTIONS[v] }),
      },
    ],

    optionItems: () => ({ items: [], notes: [] }),

    rulesHtml: `
  <p><b>Lo scopo.</b> Quattro gatti corrono insieme sulla pista del giardino, in senso
    antiorario. Vince il primo che taglia il traguardo dopo l'ultimo giro (3, 5 o 9, a scelta nel menu
    Nuova partita). Nell'<b>ultimo giro</b> tutti si arrotolano e filano più veloci.</p>
  <p><b>La guida.</b> Tieni premuta la <b>direzione</b> in cui vuoi correre (le frecce sono
    quelle dello schermo, non quelle del gatto). Sterzare di colpo costa velocità: la
    <b>traiettoria interna</b> è la più corta, ma è anche quella dove gli altri lasciano le cacchette.</p>
  <p><b>Le cacchette.</b> Ad ogni giro chi taglia il traguardo riceve cacchette in base alla posizione:
    <b>0</b> il primo, <b>1</b> il secondo, <b>2</b> il terzo, <b>3</b> l'ultimo. Se ne tengono al
    massimo ${max}. Premi <b>CACCHETTA</b> per lasciarne una dietro di te: resta in pista alcuni
    secondi. Chi la pesta fa la faccia schifata e <b>si ferma</b> per un secondo e mezzo. Le tue
    non ti fanno nulla.</p>
  <p><b>Gli urti.</b> La pista è larga giusta per quattro gatti: se vi toccate di fianco
    rimbalzate e perdete un po' di abbrivio.</p>
  <p><b>Il consiglio.</b> Resta nelle retrovie nei primi giri per fare scorta di cacchette, poi
    mettile sulla traiettoria interna, prima della curva o subito dopo il traguardo.</p>
  <p><b>Controller.</b> Levetta o croce per correre, A (o RB) per la cacchetta, START pausa.</p>`,

    rulesTouchHtml: `
  <p><b>Su telefono e tablet.</b> Tieni il dispositivo in orizzontale. Muovi il cerchietto del
    joystick dentro il cerchio grande: il gatto corre da quella parte. CACCA lascia la cacchetta.
    Da soli: joystick a sinistra e CACCA a destra; in due: ognuno ha il suo sul proprio lato.
    Per la pausa tieni premuto il pulsante in alto al centro.</p>`,

    touchControlsHtml: `
<p class="menu-text">Si gioca con il <b>joystick</b> (il cerchietto da muovere dentro il cerchio grande)
  e il pulsante <b>CACCA</b>, in orizzontale. Da soli: joystick sotto il pollice sinistro, CACCA sotto il
  destro. In due: joystick e CACCA su ogni lato.</p>`,

    touchHumansHtml: (tags) =>
      tags.length === 1
        ? `<p class="menu-keys">${tags[0]} joystick a sinistra · CACCA a destra</p>`
        : `<p class="menu-keys">${tags[0]} comandi a sinistra · ${tags[1]} a destra</p>
      <p class="menu-text">Al massimo 2 giocatori con i comandi touch.</p>`,
  };
}
