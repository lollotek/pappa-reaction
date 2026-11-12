# Pappa Reaction (Priamo Stadium)

Minigioco di riflessi per 1–4 giocatori su tastiera, in Three.js: quattro gatti — Priamo, Tempesta, Poh e Mariù — girano attorno a una ciotola coperta e devono scattare appena la mano alza il coperchio. Ma attenzione a finte e cacchette.

## Documentazione

- [Game Design Document](docs/GDD.md) — regole, meccaniche, controlli, CPU, stile
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

### Parametri URL per lo sviluppo

- `?cpu=2,3,4&diff=normale&seed=123` salta il menu e avvia subito una partita (`cpu=none` tutti umani; `seed` rigioca una partita identica)
- `?vetrina` mostra i 4 gatti da vicino per rivedere modelli e pose (←/→ posa, SPAZIO rotazione, A automatico)
- `F3` overlay di debug; in sviluppo `window.__pappa` dà accesso a partita e audio dalla console

## Comandi

```bash
npm install      # dipendenze
npm run dev      # server di sviluppo su http://localhost:5173
npm test         # test della logica (Vitest)
npm run build    # typecheck + build statica in dist/
npm run lint     # ESLint
npm run format   # Prettier
npm run balance  # simulazione di bilanciamento CPU (percentuali di vittoria)
npm run package  # build + release/pappa-reaction-<versione>.zip
```

## Pubblicazione

`npm run package` crea uno zip con il gioco già compilato (pagina, codice, font, icona; tutti i percorsi sono relativi).

- **itch.io**: nuovo progetto → _Kind of project_: HTML → carica lo zip e spunta _This file will be played in the browser_. Dimensione consigliata della finestra: 1280×720, con il pulsante schermo intero attivo.
- **Hosting statico** (GitHub Pages, Netlify, un qualsiasi server web): estrai lo zip e pubblica i file così come sono.

Il gioco va servito via `http(s)`: aprendo `index.html` direttamente dal disco il browser blocca i moduli JavaScript. Per provare la build in locale: `npm run build` e poi `npx vite preview`.

In gioco: `F3` mostra/nasconde l'overlay di debug.
