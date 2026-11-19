# Graffio Killer — Game Design Document

> Terzo minigioco di _Priamo Stadium_ (hub: [GDD §13](GDD.md#13-priamo-stadium-hub-dei-minigiochi)), con gli stessi quattro gatti e il salotto di Pappa Reaction. Ispirato a _Clear Cut Challenge_ di Pokémon Stadium 2.
> Versione documento: 0.1 — 2026-11-18

---

## 1. Concept in una frase

Quattro gatti su altrettanti tiragraffi tagliano al volo un tubo di cartone che cade davanti a loro: vince chi dà la zampata nell'istante in cui la **tacca rossa** del tubo passa sulla **linea di taglio**.

## 2. La scena

- **Camera frontale** quasi orizzontale: quattro colonne affiancate (da sinistra Priamo, Tempesta, Poh, Mariù), ognuna con un **tiragrafi** nel colore del gatto (base di legno, corda di sisal).
- I **punti stanno sui tiragraffi** (pannello sulla faccia anteriore di ogni colonna); i punti di ogni taglio compaiono sopra la linea di taglio.
- La **linea di taglio** è fissa, uguale per tutti: una linea gialla tenue con due **tacchette** triangolari ai lati di ogni colonna.
- Il **tubo** è di cartone ondulato; la **tacca** è una fascia rossa con i bordi bianchi, spessa quanto la zona "perfetta".

## 3. Il round

| Fase     | Durata     | Cosa succede                                                                                  |
| -------- | ---------- | --------------------------------------------------------------------------------------------- |
| `intro`  | 1,3 s      | "Pronti…" (solo prima del primo round)                                                        |
| `show`   | 1,9 s      | I tubi sono sui tiragraffi, la tacca (diversa a ogni round, uguale per tutti) pulsa           |
| `lift`   | 0,75 s     | I tubi salgono fuori quadro                                                                   |
| `wait`   | 0,6–1,25 s | I gatti sono in posa ("Attenti…"): pausa casuale, non si anticipa a orecchio                  |
| `drop`   | variabile  | I tubi cadono a velocità costante, ognuno con un ritardo diverso (0,11 s di passo + 0–0,04 s) |
| `result` | 2 s        | Punti, reazioni dei gatti; i tubi spariscono con uno sbuffo e i gatti si rivedono             |

L'ordine di caduta è casuale a ogni round. La fase `drop` finisce 0,55 s dopo l'ultima zampata o l'ultimo tubo arrivato a terra.

## 4. Zampata e giudizio

- **Una sola zampata a round** (tasto principale / A / pulsante ZAMPATA).
- Il taglio avviene alla quota fissa. Lo **scarto** è la distanza (in unità) tra il punto tagliato e la tacca: positivo = taglio sopra la tacca (in ritardo), negativo = sotto (in anticipo). Il giudizio usa l'**istante esatto** della pressione (timestamp dell'evento), non il frame.
- Il tubo si spezza dov'è stato colpito: il pezzo sopra vola via, quello sotto cade a terra.

| Scarto (unità) | Punti | Scritta     |
| -------------- | ----- | ----------- |
| ≤ 0,14         | 10    | Perfetto!   |
| ≤ 0,35         | 7     | Ottimo      |
| ≤ 0,60         | 5     | Buono       |
| ≤ 0,85         | 3     | Così così   |
| ≤ 1,00         | 1     | Quasi       |
| oltre          | 0     | Fuori tacca |

- **Zampata a vuoto** (0 punti): prima che il tubo cada o arrivi alla quota ("Troppo presto"), o a tubo già a terra ("Troppo tardi"). **Nessuna zampata**: "Mancato", 0 punti.
- **Nessuna scorciatoia**: la tacca sta a 0,9–1,6 dal fondo del tubo e la linea a 2,7 dal piano, così una zampata appena il tubo arriva o all'ultimo istante è sempre lontana dalla tacca (0 punti). Un test lo verifica.
- **Reazioni**: 7+ punti → il gatto festeggia con il lampo del taglio; 0 → barcolla (`stunned`); 1 → faccia schifata; mancato → triste.

## 5. Velocità

Velocità di caduta `v = 4,6 × 1,18^round` u/s (massimo 12). Le soglie dei punti sono fisse in distanza, quindi in millisecondi si stringono: la zona "perfetta" (±0,14) vale circa ±30 ms al round 1, ±22 ms al 3°, ±16 ms al 5°.

## 6. Vittoria

- **Round**: 3, 5 (predefinito) o 7, nel menu Nuova partita.
- Vince chi ha **più punti**. **Spareggio**: vince chi ha la somma degli scarti (in ms equivalenti) minore; chi non taglia conta 1000 ms. Se anche questa è pari, **vittoria condivisa**.
- A fine partita: classifica, il vincitore festeggia, gli altri sono tristi, coriandoli, Rivincita o Menu.

## 7. Comandi

| Azione  | Tastiera                                     | Controller  | Touch                            |
| ------- | -------------------------------------------- | ----------- | -------------------------------- |
| Zampata | tasto principale del gatto (`Q` `T` `O` `↑`) | A (o RB/RT) | pulsante ZAMPATA                 |
| Pausa   | ESC                                          | START       | tocco lungo sul pulsante in alto |

Touch: 1 giocatore = pulsante a destra; 2 giocatori = uno per lato. Con i comandi touch la camera allarga l'inquadratura per lasciare spazio ai pulsanti.

## 8. CPU

Appena il tubo comincia a cadere "vede" l'istante di incrocio e pianifica la zampata con un errore gaussiano, che cresce del 3% a ogni round.

| Parametro                       | Facile | Normale | Difficile |
| ------------------------------- | ------ | ------- | --------- |
| Deviazione standard dell'errore | 90 ms  | 45 ms   | 22 ms     |
| Probabilità di non tagliare     | 8%     | 3%      | 1%        |

## 9. Audio

Niente musica durante i round (il silenzio fa sentire il tempismo). Effetti riciclati: `roundStart`, `lidOpen` al sollevamento, `go` alla caduta, `swing`/`smash`/`jingle`/`hit`/`bonk` secondo l'esito, miagolii per umore, `fanfare` a fine partita.

## 10. Implementazione

```
graffio/index.html                  pagina /graffio/
src/games/graffio/
  tuning.ts                         tutti i parametri
  core/GraffioMatch.ts              logica pura: fasi, caduta, giudizio, punti (calcolata dal tempo)
  ai/GraffioCpu.ts                  gatto CPU
  render/GraffioScene.ts            scena frontale, tubi, taglio, sbuffi
  render/textures.ts                cartone e sisal
  GraffioHud.ts                     punti sulle colonne, nuvolette, classifica
  GraffioSession.ts                 partita: match + CPU + HUD + audio
  graffioGame.ts / startGraffio.ts  GameDef e avvio
tests/graffio.test.ts
```

Parametri URL di sviluppo come gli altri giochi: `/graffio/?cpu=2,3,4&diff=difficile&seed=1`.

## 11. Da fare / idee

- Provare su dispositivi veri e con controller veri; tarare soglie e velocità giocando.
- Altri ambienti (balcone, giardino) e tubi di forme diverse.
- Bonus speciale per il "Perfetto" (nel gioco originale 20 punti).
