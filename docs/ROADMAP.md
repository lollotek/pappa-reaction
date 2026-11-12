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
- [x] Game loop a timestep fisso (120 Hz) + overlay debug (dal 2026-11-12 solo con `?debug`, poi F3)
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
- **Dato di bilanciamento** (prima taratura): con le medie iniziali 450/330/240 ms la CPU difficile vinceva il 96% delle partite tra CPU. Ritarato in M7, vedi sotto.

### M4 — Grafica

- [x] Salotto generativo: parquet, parete con finestra/tende/quadretti, tappeto rotondo intrecciato (la pista è la fascia chiara) — `render/generative/canvasTexture.ts`
- [x] Gatti low poly generativi (`render/CatModel.ts`): 2 neri a pelo lungo (ciuffi, coda a piumino, occhi ambra), 2 tuxedo (faccia bianca con calotta nera, macchia bianca diversa per Poh/Tempesta), collare col colore del giocatore, ombra a disco
- [x] 10 pose procedurali: idle (respiro, battito ciglia), run, dash, eat, bonk, stunned, yuck, celebrate, sad, sit
- [x] Ciotola in ceramica, cloche di legno a doghe, mano con dita che stringono il pomello; aperto, il coperchio esce dall'inquadratura (altrimenti copre il gatto dietro la ciotola)
- [x] Contenuti low poly: crocchette, tonno, salmone, gamberetto d'oro (ruota), cacchetta con mosche
- [x] Decori sprite 2D (`render/generative/sprites.ts`): libreria, lampada, pianta grande, tiragraffi, vasi di fiori, cuscini, gomitoli
- [x] Effetti (`render/Fx.ts`): polvere su scatti/finte/false partenze, coriandoli finali; stelline e nuvoletta puzzolente
- [x] HUD: font pixel (Pixelify Sans, incluso nel bundle), pannelli con badge a testa di gatto
- [x] Vetrina `?vetrina`: i 4 gatti da vicino, ←/→ cambia posa, SPAZIO rotazione, A ciclo automatico
- [ ] Revisione manuale: correzione proporzioni/colori ed eventuale sostituzione con asset fatti a mano
- [x] (2026-11-12) Razze definitive: Priamo e Mariù (ex Margot) neri a pelo lungo, Tempesta e Poh tuxedo; la variante di ogni gatto è in `config/controls.ts`
- [x] (2026-11-12) Freccina pixel nel colore del giocatore sopra i gatti umani (`playerArrow` in `sprites.ts`); le nuvolette dell'HUD salgono sopra la freccina
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

- [x] Pausa automatica se la finestra perde il focus o la scheda viene nascosta (altrimenti al ritorno i round sarebbero "scappati")
- [x] "Juice": lampo al reveal (nello stesso frame, aiuta anche senza audio), scossa della camera al bonk e quando il coperchio ricade, zoom sul vincitore durante l'esito, punteggi/banner/nuvolette che "saltano". Opzione **Lampi e scosse** per spegnerli; animazioni CSS disattivate con `prefers-reduced-motion`. Niente fermo immagine al reveal: rallenterebbe la vista proprio mentre si misura la reazione
- [x] Bilanciamento: `npm run balance` simula partite con un "umano simulato" (290 ms) contro 3 CPU per difficoltà. Prima: umano 96% / 54% / 5% (facile/normale/difficile). Dopo la taratura: **78% / 37% / 20%**; tra CPU (facile, normale, difficile, normale) 4% / 19% / 58% / 19% invece di 1% / 4% / 93% / 3%
- [x] Performance (Chrome 156): un frame completo logica + rendering ~0,7 ms (95° percentile 1,5 ms) su 16,7 ms disponibili; 185 draw call, ~4.000 triangoli: nessuna ottimizzazione necessaria
- [x] Rilascio: icona (testa di gatto in pixel), meta description, `npm run package` crea `release/pappa-reaction-<versione>.zip` (≈236 kB) pronto per itch.io o hosting statico; build verificata servita da `vite preview` (nessun errore, strumenti di debug assenti)
- [ ] Compatibilità: testato solo su Chrome; da provare Firefox, Edge, Safari
- [ ] Playtest con persone vere per confermare la taratura delle CPU
- [ ] Pubblicazione (da fare con il proprio account: vedi README)

### Versione mobile, 1–2 giocatori (M8–M10)

Design completo: [GDD §12](GDD.md#12-versione-mobile-12-giocatori). Telefono o tablet in orizzontale con pulsanti touch: in 1 giocatore il dispositivo si tiene in mano (SCATTO pollice destro, FINTA pollice sinistro); in 2 giocatori sta appoggiato o su uno stand e ognuno ha una colonna di pulsanti su un lato. La camera non cambia. La logica di gioco (`core/`, `ai/`, `game/MatchDriver.ts`) non cambia: il tocco riempie la stessa coda `TimedInput` della tastiera.

Nuovi moduli previsti:

```
src/
  input/
    InputSource.ts        interfaccia comune drain()/clear(), MergedInput, TouchInput (pointerdown → TimedInput)
    touchLayout.ts        logica pura: rettangoli dei pulsanti per 1 o 2 giocatori, viewport, aree sicure, classe di dispositivo; hit test
  ui/
    TouchButtons.ts       pulsanti nel DOM (colore e nome del gatto), stati attivo/stordito/panchina
    PauseButton.ts        pausa con tocco lungo
    ButtonTest.ts         "Prova i pulsanti" (equivalente di Prova tasti)
  platform/
    BackButton.ts         tasto/gesto Indietro → pausa o menu precedente
    Device.ts             schermo intero, blocco orientamento, wake lock (M10)
    serviceWorker.ts      codice del service worker generato a ogni build (M10)
    touchMode.ts          logica pura: quando attivare la modalità touch (auto / sì / no)
public/
  manifest.webmanifest, icons/ (192, 512, maskable, apple-touch-icon) generate da scripts/icons.mjs
```

#### M8 — Input touch ✅ (2026-11-12, provato in emulazione: da provare su dispositivi veri)

- [x] `InputSource` comune (`MergedInput`); `App` legge da tastiera e tocco insieme (un tablet con tastiera usa entrambi)
- [x] `TouchInput`: `pointerdown` su un pulsante → `{player, action, t: e.timeStamp}`; tocco tenuto = una sola pressione
- [x] `touchLayout` per 1 giocatore (pollici ai due lati, a metà altezza) e 2 giocatori (una colonna per lato, FINTA sopra e SCATTO sotto). SCATTO 64–128 px CSS (26% dell'altezza), FINTA al 72%, almeno 16 px tra i pulsanti, almeno 18 px dal bordo più le aree sicure; unit test su 4 schermi tipici
- [x] `TouchButtons`: colore e nome del gatto, SCATTO rotondo e FINTA quadrata; feedback alla pressione **identico per scatto e finta**; pulsanti spenti da stordito e in panchina
- [x] Pannelli dei punteggi, banner, menu e titolo compatti sugli schermi bassi (`max-height: 500px`), mai sotto i pulsanti
- [x] Blocco dei gesti del browser: `touch-action: none` (i menu scorrono in verticale), `overscroll-behavior: none`, niente menu/lente al tocco lungo, niente evidenziazione al tocco
- [x] Modalità touch automatica al primo tocco o con `pointer: coarse`; **Pulsanti touch: auto / sì / no** in Opzioni; in modalità touch al massimo 2 umani in Nuova partita (chi c'era da prima torna CPU)
- [x] Audio sbloccato anche al rilascio del dito (`pointerup`): col tocco il browser concede l'audio solo lì
- [x] `npm run dev:lan`: server di sviluppo raggiungibile dal telefono nella rete locale (HTTP; l'HTTPS serve per wake lock e service worker e arriva con M10)
- [ ] Prova su un telefono Android: partita intera in 1 e in 2 giocatori, tempi coerenti con quelli da tastiera
- **Fatto quando**: su un telefono Android si gioca una partita intera in 1 e in 2 giocatori, e i tempi misurati sono coerenti con quelli da tastiera.

#### M9 — Comandi e menu senza tastiera ✅ (2026-11-12, provato in emulazione)

- [x] Pausa: pulsante in alto al centro con **tocco lungo** (0,6 s, barra che si riempie); un tocco breve non fa nulla. Round e audio scendono sotto il pulsante
- [x] Fine partita: pulsanti **Rivincita** e **Menu** (anche col mouse; INVIO/ESC restano)
- [x] Audio sì/no toccando l'indicatore dell'HUD (al posto di `M`); il primo tocco sblocca soltanto
- [x] Tasto/gesto **Indietro** (`platform/BackButton.ts`, `history.pushState` + `popstate`): in partita pausa, in pausa riprende, nei menu torna indietro, a fine partita torna al titolo; sul titolo esce dal gioco
- [x] In modalità touch, Comandi spiega i pulsanti e offre **Prova i pulsanti** (conta le dita appoggiate insieme) al posto della rimappatura
- [x] Regole: paragrafo per telefono e tablet; i suggerimenti con i tasti spariscono in modalità touch
- [x] Voci di menu alte almeno 44 px in modalità touch
- **Fatto quando**: dal titolo alla rivincita si gioca senza mai usare la tastiera. ✅ in emulazione

#### M10 — Dispositivo e PWA ✅ (2026-11-12, provato in emulazione e in locale: da provare su dispositivi veri)

- [x] Schermo intero (`platform/Device.ts`) a "Gioca", "Inizia!" e "Riprendi" (servono un gesto dell'utente), solo in modalità touch; voce **Schermo intero** in Opzioni. Se il sistema lo chiude (gesto Indietro, notifica) la partita va in pausa e "Riprendi" lo richiede
- [x] Blocco orientamento sull'orizzontale **corrente** (`landscape-primary` o `-secondary`) appena si entra a schermo intero
- [x] Ripiego: in verticale, con i pulsanti touch, avviso "Ruota il dispositivo" (telefono pixel che gira) e pausa automatica, anche se la partita parte già in verticale
- [x] Wake lock in modalità touch, richiesto di nuovo a ogni ritorno in primo piano (serve https o localhost)
- [x] iOS: `navigator.audioSession.type = 'playback'` alla creazione dell'audio (Safari 17+)
- [x] Viewport `viewport-fit=cover`; pannelli dei punteggi, pulsante pausa e pulsanti touch dentro le aree sicure (`env(safe-area-inset-*)`). Il gioco occupa già tutto lo schermo con `position: fixed; inset: 0`, quindi `100dvh` non serve
- [x] PWA: `manifest.webmanifest` (`display: fullscreen`, `orientation: landscape`, colori, icone 192/512/maskable), meta iOS e Android, icone PNG generate dalla favicon con `npm run icons` (`scripts/icons.mjs`, senza dipendenze)
- [x] Service worker scritto a mano, generato a ogni build da un plugin in `vite.config.ts` (`src/platform/serviceWorker.ts`): pagina, codice, stili e font woff2 in cache subito, icone alla prima richiesta; pagina prima dalla rete, file con hash dalla cache; cache vecchie cancellate. Registrato solo nella build pubblicata e su https/localhost. Provato: con il server spento il gioco riparte dalla cache
- [x] Invito a installare ("Condividi → Aggiungi alla schermata Home") sul titolo, solo dove lo schermo intero da browser non esiste (iPhone) e il gioco non è già installato
- [ ] Pubblicazione mobile su hosting proprio con https (GitHub Pages / Netlify): dentro l'iframe di itch.io non si installa la PWA e il wake lock può essere bloccato
- [ ] Prova su dispositivi veri: installazione su Android e iPhone, schermo intero, rotazione bloccata, niente standby, offline
- **Fatto quando**: installato su Android e iPhone parte a schermo intero, non ruota, non va in standby e funziona offline.

#### Trasversale a M8–M10

- [ ] Prove su dispositivi veri: telefono e tablet Android, iPhone, iPad (Chrome e Safari)
- [ ] Misura della latenza del tocco rispetto alla tastiera; se gli umani sono più lenti, `npm run balance` con l'umano simulato "touch" e ritaratura delle CPU per la modalità touch
- [ ] Prestazioni su un telefono di fascia bassa (fps, temperatura, batteria in 10 minuti)

Idee per dopo, non pianificate: 3–4 giocatori con il dispositivo piatto sul tavolo e telefoni usati come controller (vedi [GDD §12.7](GDD.md#127-idee-per-dopo-non-pianificate)).

## 4. Ordine consigliato e rischi

1. **M0 → M1 subito**: valida il divertimento del nucleo prima di investire in grafica.
2. **M4 in parallelo a M2/M3** se c'è chi disegna: la logica non dipende dagli asset.
3. Rischi principali:
   - _Ghosting tastiera_ con 4 giocatori → test tasti + layout rimappabile.
   - _Precisione del timing_ (latenza schermo/input) → stesso orologio per t0 e input, soglia di pareggio regolabile.
   - _Produzione dei gatti_ (4 gatti × 8 animazioni) → un unico generatore parametrico: 2 "razze" × variazioni di colore/collare; animazioni procedurali condivise.
4. **Versione mobile**: M8 → M9 rendono il gioco giocabile su un telefono Android con la grafica attuale; M10 (dispositivo/PWA) può procedere in parallelo.
   Rischi:
   - _iPhone_: niente Fullscreen API né blocco orientamento nel browser → PWA installata, avviso di rotazione.
   - _Gesti di sistema sui bordi_ (Indietro di Android, barra Home di iOS, tendina notifiche) vicini ai pulsanti → pulsanti staccati dal bordo, prove su dispositivo.
   - _Spazio su telefono_: in 2 giocatori 4 pulsanti e 4 pannelli dei punteggi su uno schermo piccolo → HUD compatto, prove su un telefono piccolo.
   - _Latenza del tocco_ diversa tra dispositivi → uguale per i due umani sullo stesso dispositivo; conta solo nel confronto con le CPU.
