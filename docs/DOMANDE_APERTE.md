# Domande aperte

Decisioni ancora da prendere. Quando una domanda è chiusa, spostarla in "Decise" e aggiornare il [GDD](GDD.md).

Nessuna domanda aperta al momento.

## Decise (2026-11-11)

| Tema                 | Decisione                                                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Falsa partenza       | Bonk sul coperchio, stordito 1.5 s con tasto SCATTO inattivo; poi può scattare di nuovo                                      |
| Cacchetta            | Penalizzato chiunque prema scatto; salta il round successivo                                                                 |
| Cacchetta al round 5 | −1 punto                                                                                                                     |
| Punti dei cibi       | Valori diversi (1/2/3/5)                                                                                                     |
| Porzioni spartite    | Punti frazionari                                                                                                             |
| Parità finale        | Round di spareggio a morte improvvisa                                                                                        |
| Ambientazione        | Salotto con tappeto rotondo come pista                                                                                       |
| Coperchio e mano     | Mano umana, cloche di legno su una ciotola                                                                                   |
| Finta del coperchio  | La musica continua (in "Difficile" fa un piccolo singhiozzo)                                                                 |
| Numero di round      | 5, configurabile                                                                                                             |
| Input                | Tastiera; dal 2026-11-12 anche pulsanti touch su mobile, 1–2 giocatori (vedi sotto)                                          |
| Lingua UI            | Italiano                                                                                                                     |
| Grafica              | Low poly 3D per gli elementi principali, sprite 2D per i decori; si parte con grafica generativa via codice, poi si corregge |

## Decise (2026-11-12) — versione mobile

| Tema          | Decisione                                                                                     |
| ------------- | --------------------------------------------------------------------------------------------- |
| Giocatori     | 1–2 umani su un dispositivo; 3–4 giocatori e controller esterni rimandati                     |
| Dispositivi   | Telefono e tablet, layout adattivo, sempre in orizzontale                                     |
| Distribuzione | Web + PWA installabile (nessuna app negli store)                                              |
| Controlli     | 1 giocatore: SCATTO pollice destro, FINTA pollice sinistro. 2 giocatori: una colonna per lato |
| Vista         | Camera invariata (~55°), come su PC                                                           |
| Dispositivo   | Schermo intero, blocco della rotazione e niente standby dove il browser lo permette           |

## Decise (2026-11-12)

| Tema                         | Decisione                                                                        |
| ---------------------------- | -------------------------------------------------------------------------------- |
| Razze dei gatti              | Priamo e Mariù neri a pelo lungo; Tempesta e Poh europei bianco e nero           |
| Nome del quarto gatto        | Mariù (sostituisce Margot)                                                       |
| Riconoscere il proprio gatto | Freccina pixel nel colore del giocatore sopra ogni gatto umano                   |
| CPU e tocco (mobile)         | Si misura la latenza del tocco sui dispositivi; le CPU si ritarano solo se serve |
| Standby senza Wake Lock      | Nessun ripiego: si usa solo il Wake Lock dove il browser lo offre                |
