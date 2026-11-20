# Corsa pazza — Game Design Document

> Quarto minigioco di _Priamo Stadium_ (hub: [GDD §13](GDD.md#13-priamo-stadium-hub-dei-minigiochi)), con gli stessi quattro gatti di Pappa Reaction.
> Versione documento: 0.1 — 2026-11-20 (prima versione giocabile)

---

## 1. Concept in una frase

Quattro gatti corrono insieme per 9 giri su una pista di terra battuta nel giardino; chi è dietro riceve **cacchette** da lasciare sulla pista, e chi le pesta si ferma a fare la faccia schifata.

## 2. La pista

- **Giardino di Pappa Reaction** (prato, siepe, steccato), ripreso dall'alto con camera fissa.
- **Anello di terra battuta** tra due steccati di legno: rettangolo con gli angoli arrotondati all'esterno, isola d'erba al centro (lì stanno giro e classifica).
- Si corre in **senso antiorario** sullo schermo; il traguardo (a scacchi) è sul rettilineo in basso. Quattro frecce verdi dipinte ricordano il verso.
- **Larghezza 3,8** (il gatto ne occupa ~0,8): quattro affiancati ci stanno giusti, senza toccarsi.
- **Traiettoria interna**: la linea vicino all'isola è la più corta (gli angoli interni sono quasi netti), ma è dove gli altri lasciano le cacchette.
- Misure e raggi: `src/games/corsa/tuning.ts` (`track`). La geometria (distanza dai bordi, punto sulla linea mediana, lunghezza del giro) è in `src/games/corsa/core/track.ts`.

## 3. Partita

- **Giri**: 3, 5 o **9** (predefinito), a scelta in Nuova partita. Vince il primo che taglia il traguardo dopo l'ultimo giro; la classifica dei restanti è per strada fatta.
- **Partenza**: i gatti stanno affiancati un po' prima del traguardo, nelle quattro corsie, **sorteggiate** a ogni partita (nessuno parte sempre all'interno). "Pronti… via!" di 2,6 s.
- **Ultimo giro**: i gatti si arrotolano e **caricano a +12% di velocità** (posa di corsa a tutta velocità), banner "ULTIMO GIRO!" e musica più veloce.
- Un giro è una corsa di circa 37 unità; con la velocità massima di 6,6 una gara a 9 giri dura circa 45–55 secondi.

## 4. Comandi

| Azione    | Tastiera                         | Controller         | Touch                             |
| --------- | -------------------------------- | ------------------ | --------------------------------- |
| Correre   | 4 direzioni (tasti del gatto)    | levetta o croce    | joystick virtuale (a sinistra)    |
| Cacchetta | tasto principale (`Q` per Priamo)| A (o RB/RT)        | pulsante CACCA (a destra)         |
| Pausa     | ESC                              | START              | tocco lungo sul pulsante in alto  |

- Le **frecce sono quelle dello schermo**, non del gatto: tieni premuta la direzione in cui vuoi andare. Il gatto gira il muso da quella parte (11 rad/s) e corre; lasciando i tasti frena.
- **Sterzare a fondo costa velocità**: la velocità target è `max · (0,45 + 0,55 · cos(angolo tra muso e direzione voluta))`, quindi la traiettoria conta.
- Con il joystick o la levetta la velocità segue anche **quanto** si spinge.
- **Tasti predefiniti**. Sinistra, destra e tasto principale sono quelli di Scaccia. Su e giù non hanno tasto negli altri giochi; qui prendono (se liberi, senza toccare le impostazioni salvate): Priamo `S` `D`, Tempesta `H` `N`, Poh `K` `;`, Mariù `'` `/`. Si cambiano in **Comandi**.
  | Gatto | Su | Giù | Sinistra | Destra | Cacchetta |
  | ----- | -- | --- | -------- | ------ | --------- |
  | Priamo | `S` | `D` | `Z` | `X` | `Q` |
  | Tempesta | `H` | `N` | `V` | `B` | `T` |
  | Poh | `K` | `;` | `,` | `.` | `O` |
  | Mariù | `'` | `/` | `←` | `→` | `↑` |
- **Touch**: al massimo 2 giocatori. Da soli: joystick sotto il pollice sinistro, CACCA sotto il destro. In due: una colonna per lato, CACCA sopra e joystick sotto.

## 5. Cacchette (rimonta)

La rimonta è asimmetrica e legata alla posizione al passaggio del traguardo:

| Posizione al traguardo di un giro | Cacchette ricevute |
| --------------------------------- | ------------------ |
| 1° | 0 |
| 2° | 1 |
| 3° | 2 |
| 4° | 3 |

- **Riserva massima 3** per gatto (i pallini nel pannello del gatto).
- Si ricevono ai traguardi dei giri 1…8 (al 9° si vince, non serve altro).
- Con **CACCHETTA** il gatto ne lascia una **dietro di sé** (0,35 s di ricarica tra una e l'altra). Resta **9 s** in pista, poi lampeggia e sparisce. Ha un anello a terra nel colore del suo proprietario.
- **Effetto**: chi pesta la cacchetta di un altro **si ferma 1,5 s** (si arriva da fermi, giro su sé stesso, faccia schifata con la nuvoletta puzzolente, "puah!"). Poi 0,7 s di grazia: non si può essere stordito di nuovo subito. La cacchetta pestata sparisce.
- **Immunità propria**: il gatto che l'ha lasciata ci passa sopra liberamente.
- **Strategia**: restare nelle retrovie nei primi giri per fare scorta; piazzare le cacchette sulla corda poco prima di una curva o subito dopo il traguardo, costringendo chi insegue ad allargare.

### Perché cacchette e non vortici

Il design di partenza usava un "vortice di polvere". Al suo posto: la **cacchetta**, già in Pappa Reaction (gatto che ci passa sopra fa la faccia schifata, nuvoletta puzzolente). Alternative valutate, tutte con asset già pronti:

- **Scatola di cartone** — "se c'è una scatola, il gatto ci entra": chi ci passa si siede e resta bloccato (texture cartone di Graffio Killer).
- **Ciotola di crocchette** — chi passa si ferma a mangiare (posa "eat" di Pappa).
- **Mix a sorte** — più varietà ma meno leggibilità per chi pianifica lo sbarramento.

La scelta dei vortici/cacchette è nel solo `trap` del tuning e negli asset della scena: cambiare ostacolo è una modifica locale.

## 6. Urti

Due gatti che si toccano si separano e rimbalzano un po' (bounce 0,45) e perdono il 3% di abbrivio a ogni passo di contatto; il "calcio" dell'urto si smorza in fretta. Contro lo steccato si striscia, frenando in proporzione a quanto ci si va contro.

## 7. CPU

La CPU segue una corsia vicina all'interno con un po' di ondeggiamento, guarda avanti (2,4 + 0,28·velocità) per scegliere dove andare, **scansa le cacchette** degli altri se se ne accorge e lascia le sue a chi la insegue da vicino e nella sua corsia. Rivede la mossa solo ogni tanto: è il suo tempo di reazione.

| Parametro                         | Facile | Normale | Difficile |
| --------------------------------- | ------ | ------- | --------- |
| Rivede la mossa ogni              | 260 ms | 150 ms  | 80 ms     |
| Velocità (frazione del massimo)   | 80%    | 90%     | 97%       |
| Ondeggiamento                     | 0,9    | 0,5     | 0,25      |
| Cacchetta a chi insegue           | 25%    | 50%     | 85%       |
| Si accorge delle cacchette        | 50%    | 80%     | 95%       |

Nei test (partite simulate tra CPU) 9 giri durano 38–52 s.

## 8. HUD

- **Isola centrale**: "GIRO n/9" (giro del primo) e classifica live con i colori dei gatti.
- **Angoli**: un pannello per gatto con posizione (1°…4°), cacchette in riserva (3 pallini) e tasti.
- **Nuvolette** sopra i gatti: "+n cacca" quando se ne ricevono, "puah!" quando si pesta.
- **Fine**: "Nome vince la corsa!" con classifica (tempo del vincitore e giro raggiunto dagli altri), Rivincita o Menu.

## 9. Audio

Suoni già esistenti: via, cacchetta lasciata (`poop`), stordito (`phew` e miagolio seccato), urto (`bonk`), cacchette ricevute (`spawn`), ultimo giro (`roundStartFinal`), fanfara e miagolio contento al vincitore. Musica di Pappa a 132 BPM, 156 nell'ultimo giro.

## 10. Parametri

Tutti in `src/games/corsa/tuning.ts`: pista, gatto (velocità 6,6, accelerazione, sterzo, attrito), cacchette (raggio, durata, riserva, premi, stordimento), gara (giri, intro, griglia), CPU.

## 11. Idee per dopo

- Ostacoli alternativi (scatola di cartone, ciotola di crocchette) magari come varianti selezionabili.
- Scia (slipstream): chi sta a ruota dell'avversario va un po' più veloce.
- Altre piste (balcone, salotto) e piste a forma di otto.
