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

## Igra preko interneta
**Trajno (preporučeno) – Render.com, besplatno:**
1. Prijavi se na [render.com](https://render.com) s GitHub računom.
2. *New → Blueprint* → odaberi repozitorij `bela-online` → *Apply* (postavke su u `render.yaml`).
3. Dobiješ adresu `https://bela-online-xxxx.onrender.com` – pošalji je prijateljima (ili gumb „Pozovi prijatelje” u sobi).
Besplatni plan „zaspe” nakon ~15 min bez posjeta; prvo otvaranje nakon toga traje oko minutu, a nedovršene igre se tada gube.

**Odmah, s ovog računala (dok je upaljeno):**
```
winget install Cloudflare.cloudflared
npm start                                          # u jednom prozoru
cloudflared tunnel --url http://localhost:3000     # u drugom – ispiše https://….trycloudflare.com
```
Adresa se mijenja svaki put kad ponovno pokreneš tunel.

## Datoteke
- `game.js` – pravila (dijeljenje, zvanje, obaveze bacanja, zvanja, bela, štiglja, pad)
- `server.js` – Node server bez ovisnosti (HTTP + Server-Sent Events), sobe u memoriji
- `public/index.html` – cijela aplikacija u pregledniku
- Povijest igara i prijatelji spremaju se na uređaju (localStorage).
