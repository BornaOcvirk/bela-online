# ♣ Bela online

Bela za 4 igrača na 4 uređaja (iPhone, Android, računalo) — prototip.
Načini igre: **zatvorena** (6 + 2 karte) i **otvorena** (djeliteljeva 8. karta otvorena na stolu, dva kruga zvanja).

## Pokretanje
```
npm start      # http://localhost:3000 i adresa u lokalnoj mreži
npm test       # provjera pravila
```
Svi igrači otvore istu adresu, upišu isti kod sobe i sjednu (partneri nasuprot).
Na mobitelu: Safari/Chrome → *Dodaj na početni zaslon*.

## Datoteke
- `game.js` – pravila (dijeljenje, zvanje, obaveze bacanja, zvanja, bela, štiglja, pad)
- `server.js` – Node server bez ovisnosti (HTTP + Server-Sent Events), sobe u memoriji
- `public/index.html` – cijela aplikacija u pregledniku
- Povijest igara i prijatelji spremaju se na uređaju (localStorage).
