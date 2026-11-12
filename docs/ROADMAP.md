# Pappa Reaction — Roadmap tecnica

> Riferimento di design: [GDD.md](GDD.md) · Dubbi da chiudere: [DOMANDE_APERTE.md](DOMANDE_APERTE.md)

## 1. Stack

| Ambito           | Scelta                                             | Motivo                                                              |
| ---------------- | -------------------------------------------------- | ------------------------------------------------------------------- |
| Linguaggio       | TypeScript                                         | tipi per state machine e config                                     |
| Build/dev server | Vite                                               | avvio immediato, hot reload                                         |
| Rendering        | Three.js                                           | scena 3D + sprite billboard                                         |
| Audio            | Web Audio API (wrapper minimo)                     | stop della musica al millisecondo                                   |
| Test             | Vitest                                             | logica di gioco (regole, punteggi, pareggi) testabile senza grafica |
| Asset pixel art  | Aseprite (o equivalente) → sprite sheet PNG + JSON | standard per animazioni pixel                                       |

## 2. Architettura

Separazione netta tra **logica** (deterministica, testabile) e **presentazione** (Three.js, audio).

```
src/
  main.ts                 bootstrap, game loop
  config/
    tuning.ts             tutti i parametri di bilanciamento
    controls.ts           mappa tasti per giocatore
  core/                   logica pura, niente Three.js
    MatchMachine.ts       partita: round (INTRO→CIRCLING→DASH→RESOLVE→END), punteggi,
                          panchina, cacchetta, spareggio, classifica (FINAL)
    matchConfig.ts        converte tuning (s) in config della macchina (ms)
    Referee.ts            sceglie timing reveal, finte del coperchio, contenuto
    Rng.ts                random con seed (replay e test riproducibili)
  input/
    Keyboard.ts           keydown con timestamp ad alta precisione, ignora auto-repeat
  ai/
    CpuPlayer.ts          reazioni, abboccamenti alle finte, uso finte
  game/
    MatchDriver.ts        unisce input umani e CPU in ordine di tempo; usato dal gioco e dalle simulazioni
    MatchSession.ts       una partita (macchina, CPU, HUD, audio) con orologio in pausa; anche la demo
    GameClock.ts          tempo di gioco che si ferma in pausa
    App.ts                schermate: titolo, setup, comandi, prova tasti, opzioni, regole, pausa
  ui/
    MenuModel.ts          logica dei menu da tastiera (voci, scelte, cursori, cattura tasto)
    MenuView.ts           pannello DOM, anche col mouse
    KeyTest.ts            prova tasti per il ghosting
  render/
    PixelRenderer.ts      render target a bassa risoluzione + upscale nearest
    Arena.ts              pista, ciotola, coperchio, ambiente
    CatModel.ts           gatto low poly generato via codice, animazione procedurale
    Decor.ts              decori come sprite 2D billboard
    Hand.ts               mano arbitro e animazioni coperchio
    Hud.ts                punteggi, round, tempi di reazione
    Fx.ts                 stelline bonk, polvere, nuvoletta puzza
  audio/
    AudioEngine.ts        contesto Web Audio, sblocco al primo tasto, muto (M), effetti e miagolii
    Music.ts              musichetta chiptune in loop, stop istantaneo, "singhiozzo"
    Synth.ts              toni e rumore filtrato (tutto sintetizzato, nessun file)
    notes.ts              spartito e tempo per round (logica pura)
    GameAudio.ts          eventi della partita → suoni
  scenes/
    MatchScene.ts         scena 3D condivisa da partite e demo
    Showroom.ts           vetrina dei gatti (?vetrina)
assets/
  sprites/ textures/ audio/ fonts/
tests/
  MatchMachine.test.ts, Referee.test.ts, ...
```

### Note tecniche chiave

- **Misura del tempo di reazione**: `t0` = timestamp del primo frame in cui il coperchio è visibilmente aperto (callback di `requestAnimationFrame`); `t_press` = `KeyboardEvent.timeStamp`. Entrambi sono sullo stesso orologio di `performance.now()`. Ignorare `event.repeat`.
- **Game loop**: logica a timestep fisso (es. 120 Hz) disaccoppiata dal rendering; gli input vengono accodati con il loro timestamp e processati dalla logica.
- **Risultato indipendente dall'animazione**: la MatchMachine decide il vincitore appena la finestra `DASH` si chiude (o appena tutti hanno premuto); le animazioni mostrano solo l'esito.
- **Pixel look**: il canvas WebGL ha risoluzione interna di ~270 righe (larghezza in base allo schermo) e viene ingrandito via CSS con `image-rendering: pixelated` e **scala intera** (`src/render/pixelLayout.ts`), così ogni pixel di gioco ha la stessa dimensione. Se serviranno effetti post-processing (contorni, palette) si passerà a un `WebGLRenderTarget`; texture con `magFilter = NearestFilter`, niente mipmap; camera prospettica a FOV basso (o ortografica) per un 2.5D pulito.
- **Low poly + sprite**: gatti, pista, ciotola, coperchio e mano sono mesh low poly (`flatShading`, palette limitata); i decori sono sprite 2D billboard che ruotano solo sull'asse Y verso la camera.
- **Grafica generativa prima**: geometrie e texture create via codice (primitive Three.js, `CanvasTexture`), così non serve nessun asset esterno per iniziare. Ogni generatore espone parametri (colori, proporzioni) per poterlo correggere a mano in seguito.

## 3. Milestone

### M0 — Setup progetto

- [x] Vite + TypeScript + Three.js + Vitest
- [x] Struttura cartelle, lint (ESLint) / format (Prettier)
- [x] Pipeline pixel: risoluzione interna bassa + upscale a scala intera, resize finestra
- [x] Game loop a timestep fisso (120 Hz) + overlay debug (F3)
- [x] Scena di prova generativa: tappeto-pista, ciotola e coperchio low poly, 4 segnaposto gatti che girano, vasi di fiori 2D billboard
- **Fatto quando**: la scena di prova gira a schermo con look pixellato. ✅ (2026-11-11)

### M1 — Prototipo "greybox" giocabile ✅ (2026-11-11)

- [x] Pista circolare, 4 segnaposto colorati che girano, ciotola + coperchio + mano come primitive low poly
- [x] `RoundMachine` (logica pura) con fasi INTRO → CIRCLING → DASH → RESOLVE → END, round infiniti
- [x] Input tastiera 4 giocatori (SCATTO) con `KeyboardEvent.timeStamp`; reazione misurata dal primo frame che mostra il coperchio aperto
- [x] Vincitore, pareggio entro 30 ms con porzione spartita, punteggi; contenuti con punti 1/2/3/5 (senza cacchetta)
- [x] Falsa partenza anticipata da M2: bonk + stordimento 1.5 s (premere prima che il coperchio sia a schermo conta come falsa partenza)
- [x] HUD: punteggi agli angoli, banner round/risultato, nuvolette con il tempo sopra i gatti; overlay debug (F3) con fase e seed
- [x] Test unitari su RoundMachine e Rng
- **Fatto quando**: 2–4 persone possono giocare round infiniti e vedere chi è più veloce. _Primo playtest: il nucleo è divertente?_

### M2 — Regole complete

- [x] 5 round, classifica finale, rivincita con INVIO
- [x] Spareggio a morte improvvisa tra i leader, senza cacchetta
- [x] Finte del coperchio pianificate dal `Referee` (più frequenti nei round finali); chi abbocca fa falsa partenza
- [x] Finta di scatto (tasto secondario): identica allo scatto per 150 ms, solo durante il giro, cooldown 1 s
- [x] Cacchetta: chi scatta salta il round successivo (in panchina con nuvoletta); al round 5 −1 punto
- [x] Seed da URL (`?seed=123`) per rigiocare una partita identica
- [x] 34 test unitari (MatchMachine, Referee, Rng, layout, loop)
- **Fatto quando**: tutte le regole del GDD funzionano in greybox e sono coperte da test. ✅ (2026-11-11)
- Nota: l'indizio sonoro della finta del coperchio (la musica continua) arriva con l'audio in M5.

### M3 — CPU

- [x] `CpuPlayer` con i profili del GDD (`tuning.cpu`): reazione con distribuzione normale (minimo 140 ms), parte dal frame in cui il coperchio è a schermo come per gli umani
- [x] Abbocca alle finte del coperchio e alle finte di scatto degli avversari (umani o CPU); riconosce la cacchetta secondo il profilo
- [x] Usa la finta di scatto; se è stordita al reveal riprova appena può
- [x] `MatchDriver`: unico punto che unisce tasti e CPU in ordine di tempo (i tasti di uno slot CPU sono ignorati)
- [x] Setup provvisorio da URL in attesa del menu M6: `?cpu=2,3,4&diff=normale` (default: P1 umano contro 3 CPU normali)
- [x] Test: comportamento CPU, distribuzione dei tempi, simulazione di partite intere a 60 Hz, difficoltà più alta vince più spesso
- **Fatto quando**: in singolo si vince/perde in modo credibile a ogni difficoltà. ✅ logica (2026-11-11) — _da confermare con playtest umano_
- **Dato di bilanciamento** (300 partite simulate, facile/normale/difficile/normale): la difficile vince il 96%, le normali il 4% insieme, la facile mai; false partenze per partita 1.9 / 0.9 / 0.35; spareggi nel 3% delle partite. Con le medie attuali (450/330/240 ms) vince quasi sempre la più veloce: da tarare nel playtest (es. medie più vicine o più inganni ad alta difficoltà).

### M4 — Grafica

- [x] Salotto generativo: parquet, parete con finestra/tende/quadretti, tappeto rotondo intrecciato (la pista è la fascia chiara) — `render/generative/canvasTexture.ts`
- [x] Gatti low poly generativi (`render/CatModel.ts`): 2 neri a pelo lungo (ciuffi, coda a piumino, occhi ambra), 2 tuxedo (faccia bianca con calotta nera, macchia bianca diversa per Poh/Margot), collare col colore del giocatore, ombra a disco
- [x] 10 pose procedurali: idle (respiro, battito ciglia), run, dash, eat, bonk, stunned, yuck, celebrate, sad, sit
- [x] Ciotola in ceramica, cloche di legno a doghe, mano con dita che stringono il pomello; aperto, il coperchio esce dall'inquadratura (altrimenti copre il gatto dietro la ciotola)
- [x] Contenuti low poly: crocchette, tonno, salmone, gamberetto d'oro (ruota), cacchetta con mosche
- [x] Decori sprite 2D (`render/generative/sprites.ts`): libreria, lampada, pianta grande, tiragraffi, vasi di fiori, cuscini, gomitoli
- [x] Effetti (`render/Fx.ts`): polvere su scatti/finte/false partenze, coriandoli finali; stelline e nuvoletta puzzolente
- [x] HUD: font pixel (Pixelify Sans, incluso nel bundle), pannelli con badge a testa di gatto
- [x] Vetrina `?vetrina`: i 4 gatti da vicino, ←/→ cambia posa, SPAZIO rotazione, A ciclo automatico
- [ ] Revisione manuale: correzione proporzioni/colori ed eventuale sostituzione con asset fatti a mano
- **Fatto quando**: il greybox è interamente sostituito dagli asset finali. ✅ generativo (2026-11-11) — resta la revisione manuale

### M5 — Audio

- [x] Musichetta chiptune originale in loop (8 battute, quadra + triangolo + charleston), accelera a ogni round e nello spareggio
- [x] Stop istantaneo al reveal vero, mai durante le finte del coperchio (in difficoltà "difficile" la musica fa un singhiozzo alla finta) — misurato nel browser: segnale della musica a zero 25 ms dopo il reveal
- [x] Effetti sintetizzati: jingle di round, coperchio (apertura, chiusura, finta che "bussa"), scatto (uguale per scatto vero e finto), bonk, "gnam", "blegh" con mosca, sospiro di sollievo, fanfara
- [x] Miagolio sintetico per gatto (altezza diversa) in tre umori: contento, seccato, triste
- [x] Sblocco audio al primo tasto (regola dei browser), `M` attiva/disattiva, scelta salvata nel browser; indicatore nell'HUD
- [x] Test: spartito, tempi, mappatura eventi → suoni (56 test in totale)
- [x] Volume separato musica/effetti → nel menu Opzioni (M6)

### M6 — Menu e flusso

- [x] Titolo con una partita dimostrativa tra 4 CPU sullo sfondo (muta, senza HUD, ricomincia da sola)
- [x] Nuova partita: Umano/CPU per ogni gatto, difficoltà CPU, round 3/5/7; mostra i tasti dei giocatori umani
- [x] Comandi: rimappatura per gatto e azione (tasto già usato → scambio; INVIO, ESC, M, F3, TAB riservati), ripristino predefiniti
- [x] Prova tasti: i tasti premuti si accendono, conta il massimo premuto insieme (ghosting)
- [x] Opzioni: volume musica ed effetti (0–10), audio sì/no, arbitro normale/furbo (singhiozzo della musica alle finte)
- [x] Regole in una schermata
- [x] Pausa con ESC: il tempo di gioco si ferma (`GameClock`), l'audio si sospende, i tasti dei gatti sono ignorati; Riprendi / Ricomincia / Torna al menu
- [x] Fine partita: INVIO rivincita, ESC menu
- [x] Impostazioni salvate nel browser (`config/settings.ts`), con valori non validi riportati ai predefiniti
- [x] Menu usabili da tastiera e mouse; font pixel senza legature ("finta" si leggeva "Anta"), tasti in font monospaziato
- [x] Parametri URL di sviluppo (`?cpu=…&diff=…&seed=…`) ora saltano il menu
- [x] Test: impostazioni e rimappatura, orologio di gioco, logica dei menu (68 test in totale)

### M7 — Rifinitura e rilascio

- [ ] "Juice": slow-motion sul vincitore, camera shake sul bonk, freeze frame al reveal
- [ ] Bilanciamento con playtest (tempi, probabilità, CPU)
- [ ] Performance e compatibilità browser (Chrome, Firefox, Edge)
- [ ] Build statica e pubblicazione (es. itch.io o hosting statico)

## 4. Ordine consigliato e rischi

1. **M0 → M1 subito**: valida il divertimento del nucleo prima di investire in grafica.
2. **M4 in parallelo a M2/M3** se c'è chi disegna: la logica non dipende dagli asset.
3. Rischi principali:
   - _Ghosting tastiera_ con 4 giocatori → test tasti + layout rimappabile.
   - _Precisione del timing_ (latenza schermo/input) → stesso orologio per t0 e input, soglia di pareggio regolabile.
   - _Produzione dei gatti_ (4 gatti × 8 animazioni) → un unico generatore parametrico: 2 "razze" × variazioni di colore/collare; animazioni procedurali condivise.
