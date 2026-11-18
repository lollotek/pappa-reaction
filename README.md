# Priamo Stadium

Raccolta di minigiochi con quattro gatti, in Three.js. All'avvio si apre l'**hub**: le schede dei giochi in 3D su fondo nero (frecce o tocco per scegliere, INVIO o tocco per giocare).

| Gioco                | Percorso    | Stato     |
| -------------------- | ----------- | --------- |
| **Pappa Reaction**   | `/pappa/`   | giocabile |
| **Scaccia la palla** | `/scaccia/` | giocabile |

Ogni gioco ha la sua pagina in un sottopercorso, con i propri parametri URL. Le impostazioni (volumi, tasti, pulsanti touch, schermo intero) sono le stesse per tutti i giochi. Dal titolo di un gioco **Torna all'hub** (o `ESC`, o l'Indietro di Android) riporta all'hub.

## Pappa Reaction

Minigioco di riflessi per 1–4 giocatori su tastiera, in Three.js: quattro gatti — Priamo, Tempesta, Poh e Mariù — girano attorno a una ciotola coperta e devono scattare appena la mano alza il coperchio. Ma attenzione a finte e cacchette.

## Scaccia la palla

Ogni gatto difende la sua cuccia dietro a un cuscino a salsicciotto, ai lati di un tappeto quadrato: le palline-giocattolo arrivano dal centro e vanno rimandate nelle cucce degli altri. +1 a chi l'ha toccata per ultima, −1 a chi la subisce; vince il primo a 3, 5 o 7 punti (o chi è in testa allo scadere, con il limite di tempo). Lo **smash** rilancia forte, e correndo di lato dà effetto alla palla. Regole complete nel [GDD di Scaccia la palla](docs/GDD_SCACCIA.md).

Tasti predefiniti: Priamo `Z` `X` + smash `Q` · Tempesta `V` `B` + `T` · Poh `,` `.` + `O` · Mariù `←` `→` + `↑`. Su telefono e tablet: striscia da trascinare e pulsante SMASH. Stessi parametri URL di sviluppo di Pappa (`/scaccia/?cpu=2,3,4&diff=difficile&seed=1`).

## Controller

In tutti e due i giochi e nell'hub funzionano i controller (Gamepad API): il primo controller comanda il primo gatto umano, il secondo il secondo, e così via. Levetta o croce per muoversi e per i menu, **A** (o RB/RT) scatto/smash e conferma, **B** (o X/LB/LT) finta e indietro, **START** pausa.

## Documentazione

- [Game Design Document](docs/GDD.md) — Pappa Reaction: regole, meccaniche, controlli, CPU, stile
- [GDD di Scaccia la palla](docs/GDD_SCACCIA.md) — campo, palline, punti, smash ed effetto, CPU
- [Roadmap tecnica](docs/ROADMAP.md) — stack, architettura, milestone
- [Domande aperte](docs/DOMANDE_APERTE.md) — decisioni ancora da prendere
- [Riferimenti grafici](docs/reference/) — foto dei gatti

## Stato

**Versione 1.0.0** — tutte le milestone completate (M0–M7). Restano: playtest con persone vere, prove su Firefox/Edge/Safari, revisione manuale della grafica generativa.

**In progettazione:** versione mobile per 1–2 giocatori (telefono o tablet in orizzontale, pulsanti touch SCATTO e FINTA) — vedi [GDD §12](docs/GDD.md#12-versione-mobile-12-giocatori) e le milestone M8–M10 della [roadmap](docs/ROADMAP.md).

## Come si gioca

Dal titolo scegli **Gioca**, decidi chi è umano e chi CPU, poi **Inizia!**. Tasti predefiniti (si cambiano in **Comandi**):

| Gatto    | Scatto | Finta |
| -------- | ------ | ----- |
| Priamo   | `Q`    | `A`   |
| Tempesta | `T`    | `G`   |
| Poh      | `O`    | `L`   |
| Mariù    | `↑`    | `↓`   |

`ESC` pausa · `INVIO` rivincita a fine partita · `M` audio sì/no (il browser lo sblocca alla prima pressione di un tasto).

**Su telefono e tablet** (in orizzontale, 1–2 giocatori) compaiono i pulsanti touch al primo tocco: da soli SCATTO a destra e FINTA a sinistra, in due una colonna per lato. Pausa con un tocco lungo sul pulsante in alto; il tasto Indietro di Android mette in pausa. In **Opzioni → Pulsanti touch** si possono forzare sì/no.

### Parametri URL per lo sviluppo

I parametri di Pappa Reaction vanno sulla sua pagina (`/pappa/?cpu=…`); i vecchi link sulla pagina principale (`/?cpu=…`) vengono spostati lì da soli.

- `?cpu=2,3,4&diff=normale&seed=123` salta il menu e avvia subito una partita (`cpu=none` tutti umani; `seed` rigioca una partita identica)
- `?vetrina` mostra i 4 gatti da vicino per rivedere modelli e pose (←/→ posa, SPAZIO rotazione, A automatico)
- `?debug` mostra l'overlay di debug (fps, risoluzione, seed, fase del round); con `?debug` attivo `F3` lo nasconde e lo rimostra. In sviluppo `window.__pappa` dà accesso a partita e audio dalla console

## Comandi

```bash
npm install      # dipendenze
npm run dev      # server di sviluppo su http://localhost:5173
npm run dev:lan  # come sopra, raggiungibile dal telefono nella stessa rete
npm test         # test della logica (Vitest)
npm run build    # typecheck + build statica in dist/
npm run lint     # ESLint
npm run format   # Prettier
npm run balance  # simulazione di bilanciamento CPU di Pappa (percentuali di vittoria)
npm run package  # build + release/priamo-stadium-<versione>.zip
```

## Pubblicazione

`npm run package` crea uno zip con il gioco già compilato (hub, pagina di ogni gioco, codice, font, icona; tutti i percorsi sono relativi).

- **itch.io**: nuovo progetto → _Kind of project_: HTML → carica lo zip e spunta _This file will be played in the browser_. Dimensione consigliata della finestra: 1280×720, con il pulsante schermo intero attivo.
- **Hosting statico** (GitHub Pages, Netlify, un qualsiasi server web): estrai lo zip e pubblica i file così come sono.

Il gioco va servito via `http(s)`: aprendo `index.html` direttamente dal disco il browser blocca i moduli JavaScript. Per provare la build in locale: `npm run build` e poi `npx vite preview`.

### Telefono e tablet (PWA)

Il gioco è una **PWA**: pubblicato su un sito **https** si può installare sulla schermata Home (Chrome: menu → _Installa app_; Safari su iPhone: _Condividi → Aggiungi alla schermata Home_). Installato parte a schermo intero e in orizzontale, e dopo la prima apertura funziona anche **offline**. Sul telefono il gioco blocca anche la rotazione (Android) e lo standby.

- Per il telefono conviene un hosting proprio: dentro la pagina di itch.io il gioco non si installa e lo standby può non essere bloccato.
- **GitHub Pages**: a ogni push su `main` il workflow `.github/workflows/pages.yml` esegue test e build e pubblica `dist/` (in _Settings → Pages_ la sorgente deve essere _GitHub Actions_). Il gioco è su `https://lollotek.github.io/pappa-reaction/`.
- Service worker e blocco dello standby funzionano solo su `https` o `localhost`. Con `npm run dev:lan` (http in rete locale) si provano comandi touch, schermo intero e rotazione; per provare anche il resto su Android si può aprire `chrome://flags/#unsafely-treat-insecure-origin-as-secure` sul telefono e aggiungere l'indirizzo del PC (es. `http://192.168.1.3:4173` con `npx vite preview --host`).
- Le icone (`public/icons/`) si rigenerano dalla favicon con `npm run icons`.

Overlay di debug: aggiungere `?debug` all'indirizzo (`F3` lo nasconde e lo rimostra).
