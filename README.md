# Pappa Reaction (Priamo Stadium)

Minigioco di riflessi per 1–4 giocatori su tastiera, in Three.js: quattro gatti — Priamo, Tempesta, Poh e Margot — girano attorno a una ciotola coperta e devono scattare appena la mano alza il coperchio. Ma attenzione a finte e cacchette.

## Documentazione

- [Game Design Document](docs/GDD.md) — regole, meccaniche, controlli, CPU, stile
- [Roadmap tecnica](docs/ROADMAP.md) — stack, architettura, milestone
- [Domande aperte](docs/DOMANDE_APERTE.md) — decisioni ancora da prendere
- [Riferimenti grafici](docs/reference/) — foto dei gatti

## Stato

M2 completata: regole complete in greybox (5 round, finte, cacchetta, spareggio). Prossimo passo: **M3 — CPU**.

| Gatto    | Scatto | Finta |
| -------- | ------ | ----- |
| Priamo   | `Q`    | `A`   |
| Tempesta | `T`    | `G`   |
| Poh      | `O`    | `L`   |
| Margot   | `↑`    | `↓`   |

`INVIO` a fine partita per la rivincita. `?seed=123` nell'URL rigioca una partita identica.

## Comandi

```bash
npm install      # dipendenze
npm run dev      # server di sviluppo su http://localhost:5173
npm test         # test della logica (Vitest)
npm run build    # typecheck + build statica in dist/
npm run lint     # ESLint
npm run format   # Prettier
```

In gioco: `F3` mostra/nasconde l'overlay di debug.
