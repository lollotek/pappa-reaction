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
    GameState.ts          punteggi, round, giocatori in panchina
    RoundMachine.ts       state machine del round (INTRO→CIRCLING→REVEAL→DASH→RESOLVE→END)
    Referee.ts            sceglie timing reveal, finte del coperchio, contenuto
    Resolver.ts           calcolo vincitore, pareggi, penalità
    Rng.ts                random con seed (replay e test riproducibili)
  input/
    Keyboard.ts           keydown con timestamp ad alta precisione, ignora auto-repeat
    PlayerInput.ts        astrazione comune umano/CPU (eventi DASH / FAKE)
  ai/
    CpuPlayer.ts          reazioni, abboccamenti alle finte, uso finte
  render/
    PixelRenderer.ts      render target a bassa risoluzione + upscale nearest
    Arena.ts              pista, ciotola, coperchio, ambiente
    CatModel.ts           gatto low poly generato via codice, animazione procedurale
    Decor.ts              decori come sprite 2D billboard
    Hand.ts               mano arbitro e animazioni coperchio
    Hud.ts                punteggi, round, tempi di reazione
    Fx.ts                 stelline bonk, polvere, nuvoletta puzza
  audio/
    AudioManager.ts       musica loop, stop istantaneo, sfx
  scenes/
    TitleScene.ts, SetupScene.ts, MatchScene.ts, ResultsScene.ts
assets/
  sprites/ textures/ audio/ fonts/
tests/
  Resolver.test.ts, RoundMachine.test.ts, ...
```

### Note tecniche chiave

- **Misura del tempo di reazione**: `t0` = timestamp del primo frame in cui il coperchio è visibilmente aperto (callback di `requestAnimationFrame`); `t_press` = `KeyboardEvent.timeStamp`. Entrambi sono sullo stesso orologio di `performance.now()`. Ignorare `event.repeat`.
- **Game loop**: logica a timestep fisso (es. 120 Hz) disaccoppiata dal rendering; gli input vengono accodati con il loro timestamp e processati dalla logica.
- **Risultato indipendente dall'animazione**: il Resolver decide il vincitore appena la finestra `DASH` si chiude (o appena tutti hanno premuto); le animazioni mostrano solo l'esito.
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
- **Fatto quando**: 2–4 persone possono giocare round infiniti e vedere chi è più veloce. *Primo playtest: il nucleo è divertente?*

### M2 — Regole complete

- [ ] 5 round, classifica finale
- [ ] Finte del coperchio (Referee)
- [ ] Finta di scatto (tasto secondario, cooldown)
- [ ] Cacchetta + salto del turno successivo
- [ ] Test unitari per le nuove regole (RNG con seed già pronto)
- **Fatto quando**: tutte le regole del GDD funzionano in greybox e sono coperte da test.

### M3 — CPU

- [ ] `CpuPlayer` con i parametri per difficoltà del GDD
- [ ] Reazione alle finte del coperchio e degli avversari
- [ ] CPU che usa la finta di scatto
- [ ] Partita 1 umano vs 3 CPU bilanciata
- **Fatto quando**: in singolo si vince/perde in modo credibile a ogni difficoltà.

### M4 — Grafica

- [ ] Palette; ambientazione salotto con tappeto rotondo
- [ ] Gatti low poly generativi (2 neri pelo lungo, 2 tuxedo) con animazioni procedurali (camminata, scatto, finta, presa, bonk, schifato, festa, triste)
- [ ] Arena low poly generativa + decori sprite 2D
- [ ] Revisione manuale: correzione proporzioni/colori ed eventuale sostituzione con asset fatti a mano
- [ ] Mano arbitro + coperchio animati (apertura, finte)
- [ ] Icone cibo e cacchetta, HUD definitivo (badge, punteggi, nuvolette tempo)
- [ ] Effetti: stelline, polvere, mosche, coriandoli
- **Fatto quando**: il greybox è interamente sostituito dagli asset finali.

### M5 — Audio

- [ ] Musichetta loop + stop istantaneo al reveal
- [ ] Set SFX completo, miagolii per gatto
- [ ] Volume musica/effetti nelle opzioni

### M6 — Menu e flusso

- [ ] Schermata titolo
- [ ] Setup: per ogni gatto scelta Umano/CPU, difficoltà CPU
- [ ] Test tasti (verifica ghosting) e rimappatura
- [ ] Pausa, risultati, rivincita
- [ ] Tutorial rapido / schermata regole

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
