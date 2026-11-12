# Pappa Reaction — Game Design Document

> Minigioco di riflessi per 1–4 giocatori su tastiera, realizzato in Three.js.
> Nome provvisorio: **Pappa Reaction** (fa parte del progetto _Priamo Stadium_).
> Versione documento: 0.1 — 2026-11-11

---

## 1. Concept in una frase

Quattro gatti girano attorno a una ciotola coperta; quando una mano alza il coperchio e la musica si ferma, chi scatta per primo si prende la pappa. Ma il coperchio può fare finte, gli avversari possono fare finte e sotto il coperchio a volte c'è una cacchetta.

## 2. Pilastri di design

1. **Riflessi puri e leggibili** — il vincitore del round è deciso dal tempo di reazione, non dalla fisica o dalla posizione sulla pista.
2. **Bluff e psicologia** — finte del coperchio e finte dei giocatori creano tensione e falsi allarmi.
3. **Rischio/ricompensa** — premere presto è punito (falsa partenza, cacchetta); esitare fa perdere la pappa.
4. **Partite brevi** — 5 round, ~2 minuti a partita, rivincita immediata.

## 3. Personaggi

| Gatto    | Razza / aspetto                       | Riferimento                  |
| -------- | ------------------------------------- | ---------------------------- |
| Priamo   | nero a pelo lungo _(provvisorio)_     | gatto_nero_pelolungo.png     |
| Tempesta | nero a pelo lungo _(provvisorio)_     | gatto_nero_pelolungo.png     |
| Poh      | europeo bianco e nero _(provvisorio)_ | gatto_europeo_bianconero.png |
| Margot   | europeo bianco e nero _(provvisorio)_ | gatto_europeo_bianconero.png |

- 2 gatti **neri a pelo lungo** (occhi gialli/ambra) → [docs/reference/gatto_nero_pelolungo.png](reference/gatto_nero_pelolungo.png)
- 2 gatti **europei bianco e nero** (tuxedo) → [docs/reference/gatto_europeo_bianconero.png](reference/gatto_europeo_bianconero.png)

Per distinguere i due gatti dello stesso tipo: colore del collare/fiocco + colore del badge giocatore (P1 blu, P2 rosso, P3 verde, P4 giallo) sopra la testa, più piccole differenze di macchie/forma.

Le statistiche dei gatti sono **identiche** (solo estetica), per mantenere il gioco equo.

## 4. Il campo

- **Pista circolare** su cui i 4 gatti trottano in senso antiorario, equidistanti (90° l'uno dall'altro).
- **Struttura centrale**: una ciotola/piatto grande coperto da un **coperchio di legno** (a cupola).
- **La mano arbitro**: scende dall'alto, afferra il pomello del coperchio e lo solleva. È il "telegrafo" di tutte le azioni del round (finte comprese). Al reveal la mano strappa il coperchio verso l'alto, fuori dall'inquadratura, così nessun gatto resta nascosto; a fine round lo riabbassa.
- **Ambientazione**: salotto di casa — parquet, parete con finestra e quadretti, libreria, tiragraffi, piante; la pista è un tappeto rotondo intrecciato (fascia chiara).

## 5. Flusso di una partita

```
TITOLO (demo tra CPU sullo sfondo) → NUOVA PARTITA (umano/CPU per gatto, difficoltà, round)
   → ROUND 1..N → CLASSIFICA FINALE → (INVIO rivincita | ESC menu)
                 ↕ ESC: PAUSA (riprendi / ricomincia / menu)
```

Dal titolo: **Gioca**, **Regole**, **Comandi** (rimappatura e prova tasti), **Opzioni** (volumi, audio, arbitro). Le scelte restano salvate nel browser.

### 5.1 Fasi di un round (state machine)

| Fase          | Cosa succede                                                                                                                                                         | Durata indicativa |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `ROUND_INTRO` | Scritta "ROUND N", i gatti si posizionano sulla pista. Input ignorati.                                                                                               | 1.5 s             |
| `CIRCLING`    | Musichetta in loop, i gatti girano. La mano può fare **finte del coperchio**. I giocatori possono fare **finte di scatto**. Premere SCATTO qui = **falsa partenza**. | casuale 2.5–7 s   |
| `REVEAL`      | Il coperchio si alza di colpo, **la musica si interrompe**, appare il contenuto. Parte il cronometro (t0).                                                           | —                 |
| `DASH`        | I giocatori premono SCATTO; i gatti corrono verso il centro. Finestra di input aperta per `revealWindow` (es. 1.5 s).                                                | ≤ 1.5 s           |
| `RESOLVE`     | Si calcola il vincitore, animazione di presa, tempi mostrati sopra ogni gatto ("0.19 sec.").                                                                         | 2 s               |
| `ROUND_END`   | Aggiornamento punteggi, coperchio richiuso, gatti tornano in pista.                                                                                                  | 1 s               |

### 5.2 Fine partita

Dopo il round 5: classifica, il gatto vincitore fa festa sopra il coperchio. `INVIO` avvia la rivincita.

**Spareggio a morte improvvisa**: se dopo il round 5 più gatti sono primi a pari punti, si giocano round extra **solo tra i gatti in testa** (gli altri restano fuori), **senza cacchetta**, finché uno resta da solo in testa. Un pareggio entro la soglia nello spareggio divide i punti e quindi fa ripetere il round.

## 6. Meccaniche

### 6.1 Scatto (tasto principale)

- Valido solo durante `DASH`. Il tempo di reazione = `t_press − t0` in millisecondi.
- Ogni giocatore può scattare **una sola volta** per round.
- Il vincitore è chi ha il tempo più basso. L'animazione di corsa è **cosmetica**: tutti i gatti sono alla stessa distanza dal centro, il risultato è già deciso dal tempo.
- **Pareggio**: se due o più giocatori hanno tempi entro `tieThreshold` (proposta: 30 ms) dal migliore, si spartiscono la porzione.
- Se nessuno preme entro `revealWindow`, la mano richiude il coperchio e nessuno prende punti.

### 6.2 Falsa partenza

Premere SCATTO durante `CIRCLING` (anche a seguito di una finta del coperchio o di un avversario):

- il gatto corre al centro e **sbatte contro il coperchio chiuso** (stelline, suono "bonk");
- resta **stordito per 1.5 s** (`stunDuration`): in quel periodo il tasto SCATTO non risponde, poi torna in pista e può ancora scattare normalmente.
- Se il coperchio si apre mentre è stordito, il gatto parte in ritardo: il suo tempo viene preso solo dalla prima pressione valida dopo lo stordimento.

### 6.3 Finta del coperchio (azione dell'arbitro)

- Durante `CIRCLING` la mano può: tremare sul pomello, sollevare il coperchio di qualche centimetro e riabbassarlo, o "far finta" di scendere e risalire.
- La musica **non** si ferma durante una finta: è l'indizio per i giocatori attenti. (Variante difficile: anche la musica fa un piccolo "singhiozzo".)
- 0–2 finte per round, probabilità crescente nei round finali.

### 6.4 Finta di scatto (tasto secondario)

- Il gatto fa un **piccolo balzo in avanti** verso il centro e torna in pista. Le prime ~150 ms dell'animazione sono identiche a uno scatto vero, così da ingannare gli umani che guardano lo schermo.
- Nessuna penalità per chi la fa; cooldown proposto: 1 s.
- Utilizzabile solo in `CIRCLING`.
- Influenza la CPU (probabilità di abboccare) e gli umani (puro inganno visivo/sonoro).

### 6.5 Contenuto della ciotola

| Contenuto               | Punti    | Probabilità (proposta) |
| ----------------------- | -------- | ---------------------- |
| Crocchette              | 1        | 35%                    |
| Tonno                   | 2        | 25%                    |
| Salmone                 | 3        | 15%                    |
| Gamberetto d'oro (raro) | 5        | 5%                     |
| **Cacchetta**           | penalità | 20%                    |

Le porzioni spartite in caso di pareggio usano frazioni (es. 3 punti a 2 gatti = 1.5 ciascuno) → _domanda aperta_ se preferiamo punti interi.

### 6.6 La cacchetta

- Se sotto il coperchio c'è la cacchetta, la musica si ferma comunque (è la trappola).
- **Chiunque prema SCATTO** durante la finestra `DASH` afferra/finisce sulla cacchetta → **salta il round successivo** (resta seduto a bordo pista a guardare, con nuvoletta puzzolente).
- La mossa giusta è **non premere**. Nessuno guadagna punti in quel round.
- Se la penalità cade dopo il round 5 → _domanda aperta_ (proposta: −1 punto).

### 6.7 Giocatori in panchina

Chi salta il turno non gira sulla pista e non può premere nulla; il suo slot nella pista resta vuoto (gli altri non si spostano).

## 7. Controlli (tastiera)

Proposta iniziale, rimappabile da menu:

| Giocatore | SCATTO | FINTA |
| --------- | ------ | ----- |
| P1        | `Q`    | `A`   |
| P2        | `T`    | `G`   |
| P3        | `O`    | `L`   |
| P4        | `↑`    | `↓`   |

Menu: frecce per muoversi e cambiare valore, `INVIO` conferma, `ESC` indietro / pausa, `M` audio sì/no. I tasti dei gatti si cambiano in **Comandi** (un tasto già usato viene scambiato; `INVIO`, `ESC`, `M`, `F3`, `TAB` sono riservati).

Nota tecnica: molte tastiere hanno **ghosting** (alcune combinazioni di tasti premuti insieme non vengono rilevate). In **Comandi → Prova i tasti** i tasti premuti si illuminano: se uno non si accende premendolo insieme agli altri, la tastiera non regge quella combinazione. I tasti predefiniti sono distanti tra loro apposta.

## 8. CPU

Ogni slot non occupato da un umano è una CPU. La CPU usa le stesse regole e lo stesso cronometro degli umani: reagisce solo dal frame in cui il coperchio aperto è a schermo, con un tempo di reazione casuale (distribuzione normale, minimo 140 ms). Parametri per difficoltà (in `tuning.cpu`):

| Parametro                           | Facile | Normale | Difficile |
| ----------------------------------- | ------ | ------- | --------- |
| Tempo di reazione medio             | 370 ms | 310 ms  | 275 ms    |
| Variabilità (dev. std.)             | 80 ms  | 60 ms   | 45 ms     |
| Abbocca alla finta del coperchio    | 30%    | 14%     | 7%        |
| Abbocca alla finta di un avversario | 25%    | 12%     | 6%        |
| Riconosce la cacchetta (non scatta) | 65%    | 85%     | 93%       |
| Usa la finta di scatto (per round)  | 10%    | 30%     | 50%       |

Valori tarati con `npm run balance` (400 partite simulate per riga) contro un "umano simulato" che reagisce in media in 290 ms (reazione + ritardo di tastiera e schermo) e ogni tanto cade nelle finte: l'umano vince il **78%** contro 3 CPU facili, il **37%** contro 3 normali, il **20%** contro 3 difficili (25% = alla pari). Da confermare con playtest veri.

## 9. Direzione artistica

- **Stile**: 2.5D pixel art cartoon. Gli **elementi principali sono low poly 3D** (gatti, pista, ciotola, coperchio, mano) con colori piatti/texture a filtro _nearest_; i **decori sono sprite 2D** billboard (piante, fiori, oggetti del salotto).
- **Prima fase: grafica generativa** — modelli e texture costruiti via codice (primitive Three.js, texture disegnate su canvas). Verranno poi corretti o sostituiti con asset fatti a mano.
- **Telecamera**: fissa, dall'alto inclinata (~55°), come negli screenshot di riferimento, che inquadra tutta la pista.
- **Resa pixel**: la scena viene renderizzata a bassa risoluzione (es. 480×270) e poi ingrandita a schermo intero senza sfocatura → effetto pixel uniforme anche sugli oggetti 3D.
- **Palette**: limitata (32–48 colori), toni caldi e morbidi.
- **Animazioni dei gatti** (low poly, animazione procedurale per parti — corpo, testa, zampe, coda): camminata, scatto, finta, presa della pappa, bonk/stordito, schifato (cacchetta), festa, triste.
- **HUD**: font pixel (Pixelify Sans); punteggi ai 4 angoli in pannelli con badge a testa di gatto nel colore del giocatore; tempo di reazione in una nuvoletta sopra il gatto; banner centrale ("ROUND N", esito del round); classifica finale con coriandoli.
- **Distinguere i gatti**: collare nel colore del giocatore; Priamo più nero, Tempesta con riflessi bruni; Poh con macchia bianca sulla spalla, Margot sul posteriore e lista bianca sulla fronte.
- **Riferimenti**: gli screenshot allegati sono solo riferimento di _ritmo e inquadratura_; grafica, ambientazione e personaggi sono originali.

## 10. Audio

- Tutto **sintetizzato** con Web Audio (nessun file audio), in stile chiptune.
- Musichetta allegra in loop durante `CIRCLING`, più veloce a ogni round e nello spareggio; si interrompe **istantaneamente** al reveal vero. Durante le finte del coperchio **continua**: è l'indizio per i giocatori attenti (in "difficile" fa un piccolo singhiozzo, per confondere).
- SFX: jingle di inizio round (speciale per l'ultimo e lo spareggio), coperchio che si alza / si richiude / "bussa" nella finta, scatto (lo stesso suono per scatto vero e finto, per non tradire la finta), bonk, "gnam", cacchetta ("blegh" + mosca), sospiro di sollievo se nessuno ci casca, fanfara finale.
- Miagolii: ogni gatto ha la sua altezza; contento (vince la pappa), seccato (bonk), triste (cacchetta).
- I browser attivano l'audio solo dopo un'interazione: finché non si preme un tasto l'HUD lo segnala. `M` attiva/disattiva l'audio.

## 11. Parametri di bilanciamento

Tutti i valori sono in un file `src/config/tuning.ts` per poterli regolare durante i playtest:

`roundCount=5`, `stunDuration=1.5s`, `circlingMin=2.5s`, `circlingMax=7s`, `revealWindow=1.5s`, `tieThreshold=30ms`, `fakeDashCooldown=1s`, `lastRoundPoopPenalty=-1`; finte del coperchio (`maxPerRound=2`, probabilità 35% +10% a round, durata 0.45 s, distanza minima 0.7 s, mai nei primi 0.6 s né negli ultimi 0.8 s del giro); pesi dei contenuti (cacchetta 20%); parametri CPU.
