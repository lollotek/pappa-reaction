# Scaccia la palla — Game Design Document

> Secondo minigioco di _Priamo Stadium_ (hub: [GDD §13](GDD.md#13-priamo-stadium-hub-dei-minigiochi)), con gli stessi quattro gatti di Pappa Reaction.
> Versione documento: 0.2 — 2026-11-18 (cuscini sulla linea degli angoli, dopo il primo playtest)

---

## 1. Concept in una frase

Quattro gatti difendono ciascuno la propria cuccia ai lati di un tappeto quadrato: con un cuscino a salsicciotto si rimandano le palline-giocattolo, e chi le fa entrare nelle cucce degli altri fa punto.

## 2. Il campo

- **Tappeto quadrato** nel salotto di Pappa Reaction, diviso in **quattro spicchi diagonali** nei colori dei gatti; al centro un cerchio da cui partono le palline.
- **Angoli smussati** da cuscini diagonali: la palla ci rimbalza (con una piccola deviazione casuale, così nessuna palla resta a rimbalzare per sempre tra due angoli opposti).
- Ogni gatto difende un **lato**: la sua porta è l'apertura del lato tra i due cuscini d'angolo; dietro c'è la sua **cuccia** (cesta nel suo colore).
- Il gatto sta dietro un **cuscino a salsicciotto** a righe nel suo colore e lo sposta lungo il lato, tra i due angoli. Il cuscino scorre sul bordo del tappeto, **in linea con la fine dei cuscini d'angolo**: una palla che rimbalza su un angolo vicino alla porta arriva sempre davanti al cuscino e si può salvare. Il gol conta quando la palla ha passato anche il cuscino (linea a 3,95 dal centro, più il raggio della palla).
- **Lati dei giocatori**: il primo umano (nell'ordine Priamo, Tempesta, Poh, Mariù) in basso, il secondo in alto, poi a sinistra e a destra; le CPU nei lati rimasti. Il pannello dei punti di ogni gatto sta nell'angolo dello schermo vicino al suo lato.
- **Camera** fissa molto inclinata (75°), così i quattro lati si vedono quasi allo stesso modo.

## 3. Le palline

- Sono **giocattoli da gatto**: gomitolo di lana, pallina di plastica bucherellata con il sonaglio (suona quando la colpisci), pompon.
- **Nascita**: al centro, ogni 8 s, finché in campo ce ne sono meno di 3. Se il campo resta vuoto ne nasce subito una. La palla nuova salta fuori, **trema per 0,8 s** con una freccia a terra che indica dove partirà, poi parte verso un lato a caso (mai lo stesso lato due volte di fila).
- **Palla neutra**: appena nata e mai toccata (nessun alone).
- **Alone** sotto la palla nel colore dell'ultimo gatto che l'ha toccata: si vede sempre chi segnerebbe.
- **Accelerazione progressiva**: ogni rinvio aumenta la velocità del 6%; la palla accelera anche col tempo (1,2% al secondo), fino a un massimo.
- Le palline **non si scontrano** tra loro.

## 4. Punti e vittoria

| Caso                                                    | Effetto                                                     |
| ------------------------------------------------------- | ----------------------------------------------------------- |
| Palla nella cuccia di un altro gatto                    | **+1** all'ultimo che l'ha toccata, **−1** a chi la subisce |
| Palla neutra (mai toccata) in una cuccia                | **−1** a chi la subisce, nessuno guadagna                   |
| Autogol (l'ultimo a toccarla è il padrone della cuccia) | **−1**, nessuno guadagna                                    |

- I punti **non scendono sotto 0**.
- **Vince il primo che arriva ai punti scelti**: 3, 5 (predefinito) o 7, nel menu Nuova partita.
- **Limite di tempo** (Opzioni, spento di base): dopo 3 minuti vince chi è in testa; se in testa sono pari, **spareggio**: si continua finché uno resta in testa da solo. Negli ultimi 30 s il tempo diventa rosso e la musica accelera.
- Il gioco **non si ferma mai** ai gol: le altre palline continuano. Reazioni riciclate da Pappa: chi subisce fa la faccia schifata con la **nuvoletta puzzolente**, chi segna **festeggia**; sopra i gatti compaiono "+1" e "−1".
- A fine partita: classifica, il vincitore festeggia al centro del tappeto, coriandoli, Rivincita o Menu.

## 5. Comandi e colpi

| Azione   | Tastiera                              | Controller               | Touch                             |
| -------- | ------------------------------------- | ------------------------ | --------------------------------- |
| Muoversi | tasti sinistra/destra del gatto       | levetta sinistra o croce | trascinare il dito sulla striscia |
| Smash    | tasto principale (lo scatto di Pappa) | A (o RB/RT)              | pulsante SMASH                    |
| Pausa    | ESC                                   | START                    | tocco lungo sul pulsante in alto  |

- **Tasti predefiniti** (si cambiano in Comandi; la prova tasti mostra solo quelli del gioco):

  | Gatto    | Sinistra | Destra | Smash |
  | -------- | -------- | ------ | ----- |
  | Priamo   | `Z`      | `X`    | `Q`   |
  | Tempesta | `V`      | `B`    | `T`   |
  | Poh      | `,`      | `.`    | `O`   |
  | Mariù    | `←`      | `→`    | `↑`   |

  I tasti su/giù esistono nelle impostazioni ma per ora non hanno tasti predefiniti (per giochi futuri); se assegnati, ai lati muovono il cuscino.

- **Ai lati** il cuscino va su e giù sullo schermo: "sinistra" lo fa salire, "destra" scendere (le frecce nel pannello dei punti lo ricordano). Con il controller si usa la levetta in verticale.
- **Colpo normale**: la palla rimbalza sul cuscino; l'angolo dipende da dove tocca (al centro torna dritta, sulle punte fino a 52°) e un po' dal movimento del cuscino. Il cuscino è un salsicciotto anche per i rimbalzi: respinge la palla anche se la prende di punta o se arriva quasi parallela al lato (tipico dopo un cuscino d'angolo), purché la palla non sia già dietro di lui.
- **Smash**: la zampata è attiva per 0,17 s dopo la pressione, poi 0,5 s di ricarica. La palla riparte 1,6 volte più veloce (almeno a velocità 8, al massimo 14) e lascia una **scia** nel colore del gatto finché qualcuno non la tocca.
- **Effetto (spin)**: smash con il cuscino in corsa laterale → la traiettoria **curva** dalla parte in cui correvi (partendo un po' dalla parte opposta), e la curva si esaurisce in circa un secondo. Rimbalzando su un angolo la curva si specchia.
- **Touch** (1–2 giocatori, umani in basso e in alto): la posizione del dito sulla striscia è la posizione del cuscino. Da soli: striscia sotto il pollice sinistro, SMASH sotto il destro. In due: striscia e SMASH su ogni lato.
- **Controller**: il k-esimo controller collegato comanda il k-esimo gatto umano. Valgono anche in Pappa Reaction (A scatto, B finta) e nei menu (croce/levetta, A conferma, B indietro, START).

## 6. CPU

La CPU vede le palline come un umano (posizione, direzione, velocità), ne **prevede l'arrivo** al suo cuscino simulandone il volo (angoli compresi) e rivede la mossa solo ogni tanto: è il suo tempo di reazione. Ha la stessa velocità massima del cuscino, ridotta in base alla difficoltà. Senza minacce torna verso il centro.

| Parametro                                | Facile | Normale | Difficile |
| ---------------------------------------- | ------ | ------- | --------- |
| Rivede la mossa ogni                     | 380 ms | 230 ms  | 120 ms    |
| Errore di previsione (per s di anticipo) | 0,6    | 0,24    | 0,08      |
| Velocità del cuscino                     | 62%    | 88%     | 100%      |
| Smash sulle palle in arrivo              | 15%    | 35%     | 60%       |
| Effetto negli smash                      | 10%    | 30%     | 50%       |
| Prevede la curva dell'effetto            | no     | sì      | sì        |
| Mira con la punta del cuscino            | 20%    | 45%     | 70%       |

Nei test (partite simulate tra CPU) la difficile subisce circa la metà dei gol della facile; una partita a 5 punti tra CPU dura circa 2,5–3 minuti.

## 7. Parametri

Tutti in `src/games/scaccia/tuning.ts`: campo (mezzo lato 3,6, smusso 1,1, linea del gol 3,95), cuscino (sulla linea a 3,6, lunghezza 1,5, velocità 6,5), palla (raggio 0,24, lancio 3,6, +6% a rinvio, +1,2%/s, massimo 10), smash (finestra, ricarica, moltiplicatore, minimo e massimo, effetto), nascite (ogni 8 s, massimo 3, avviso 0,8 s), partita (intro 2 s, limite 3 min), CPU.

## 8. Audio

Effetti sintetizzati come in Pappa: "pop" della palla nuova, zampata, tonfo sul cuscino, smash, rimbalzo sugli angoli, sonaglio, palla nella cuccia; miagolii (seccato o triste chi subisce, contento chi segna). Musica di Pappa durante il gioco, più veloce negli ultimi 30 s e nello spareggio; fanfara finale.

## 9. Idee per dopo

- Mappe balcone e giardino (per ora solo il salotto).
- Palline speciali (es. topolino a molla che cambia direzione, palla d'erba gatta che rallenta il gatto colpito).
- Telefoni come controller per giocare in 3–4 su un solo schermo.
