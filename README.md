# Pappa Reaction (Priamo Stadium)

Minigioco di riflessi per 1–4 giocatori su tastiera, in Three.js: quattro gatti — Priamo, Tempesta, Poh e Margot — girano attorno a una ciotola coperta e devono scattare appena la mano alza il coperchio. Ma attenzione a finte e cacchette.

## Documentazione

- [Game Design Document](docs/GDD.md) — regole, meccaniche, controlli, CPU, stile
- [Roadmap tecnica](docs/ROADMAP.md) — stack, architettura, milestone
- [Domande aperte](docs/DOMANDE_APERTE.md) — decisioni ancora da prendere
- [Riferimenti grafici](docs/reference/) — foto dei gatti

## Stato

M6 completata: menu, pausa, impostazioni salvate. Prossimo passo: **M7 — Rifinitura e rilascio**.

## Come si gioca

Dal titolo scegli **Gioca**, decidi chi è umano e chi CPU, poi **Inizia!**. Tasti predefiniti (si cambiano in **Comandi**):

| Gatto    | Scatto | Finta |
| -------- | ------ | ----- |
| Priamo   | `Q`    | `A`   |
| Tempesta | `T`    | `G`   |
| Poh      | `O`    | `L`   |
| Margot   | `↑`    | `↓`   |

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
```

In gioco: `F3` mostra/nasconde l'overlay di debug.
