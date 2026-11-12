# Pappa Reaction (Priamo Stadium)

Minigioco di riflessi per 1–4 giocatori su tastiera, in Three.js: quattro gatti — Priamo, Tempesta, Poh e Margot — girano attorno a una ciotola coperta e devono scattare appena la mano alza il coperchio. Ma attenzione a finte e cacchette.

## Documentazione

- [Game Design Document](docs/GDD.md) — regole, meccaniche, controlli, CPU, stile
- [Roadmap tecnica](docs/ROADMAP.md) — stack, architettura, milestone
- [Domande aperte](docs/DOMANDE_APERTE.md) — decisioni ancora da prendere
- [Riferimenti grafici](docs/reference/) — foto dei gatti

## Stato

M4 completata: grafica generativa (salotto, gatti low poly, effetti). Prossimo passo: **M5 — Audio**.

| Gatto    | Scatto | Finta |
| -------- | ------ | ----- |
| Priamo   | `Q`    | `A`   |
| Tempesta | `T`    | `G`   |
| Poh      | `O`    | `L`   |
| Margot   | `↑`    | `↓`   |

`INVIO` a fine partita per la rivincita.

Parametri URL (provvisori, finché non c'è il menu):

- `?cpu=2,3,4` quali gatti sono CPU (default `2,3,4`: tu sei Priamo); `?cpu=none` tutti umani
- `?diff=facile|normale|difficile` difficoltà CPU (default `normale`)
- `?seed=123` rigioca una partita identica (CPU comprese)
- `?vetrina` mostra i 4 gatti da vicino per rivedere modelli e pose (←/→ posa, SPAZIO rotazione, A automatico)

Esempio: `http://localhost:5173/?cpu=3,4&diff=difficile` → Priamo e Tempesta umani contro 2 CPU difficili.

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
