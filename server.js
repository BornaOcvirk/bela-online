// Run: node server.js  ->  open http://<this PC's IP>:3000 on 4 devices, same room code.
// Zero dependencies: plain http, Server-Sent Events for pushes, POST /api for actions.
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto'), os = require('os');
const G = require('./public/game');
const PORT = process.env.PORT || 3000, PUBLIC = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2' };

// shortcut: rooms live in memory and are never cleaned up; a restart ends all games. Add expiry/persistence before public hosting.
const rooms = {}; // code -> { seats: [{ name, token } | null] x4, game, streams: Set<{ res, seat }> }

function push(room) {
  for (const st of room.streams) {
    const seats = room.seats.map((s, i) => s && { name: s.name, online: [...room.streams].some(x => x.seat === i) });
    const data = { seats, you: st.seat, game: G.view(room.game, st.seat) };
    st.res.write('data: ' + JSON.stringify(data) + '\n\n');
  }
}

function handle(body) {
  const code = String(body.room || '').toUpperCase();
  if (!/^[A-Z0-9]{1,8}$/.test(code)) throw new Error('Kod sobe: do 8 slova/brojeva');
  if (body.type === 'join' && !rooms[code]) { // the first player in picks the mode
    if (!G.MODES.includes(body.mode)) throw new Error('Odaberi način igre');
    rooms[code] = { seats: [null, null, null, null], game: G.newGame(body.mode), streams: new Set() };
  }
  const room = rooms[code];
  if (!room) throw new Error('Nema te sobe');
  if (body.type === 'join') {
    const name = String(body.name || '').trim().slice(0, 20);
    if (!name) throw new Error('Upiši ime');
    const back = room.seats.findIndex(s => s && s.token === body.token);
    if (back >= 0) { room.seats[back].name = name; return { token: body.token, room: code }; }
    const free = room.seats.indexOf(null);
    if (free < 0) throw new Error('Soba je puna');
    const token = crypto.randomUUID();
    room.seats[free] = { name, token };
    return { token, room: code };
  }
  const seat = room.seats.findIndex(s => s && s.token === body.token);
  if (seat < 0) throw new Error('Nisi u ovoj sobi');
  const g = room.game;
  if (body.type === 'sit') { // move to an empty seat, only in the lobby
    const to = body.seat;
    if (g.phase !== 'lobby' || !Number.isInteger(to) || room.seats[to] !== null) throw new Error('Mjesto nije slobodno');
    room.seats[to] = room.seats[seat]; room.seats[seat] = null;
    for (const st of room.streams) if (st.seat === seat) st.seat = to;
  } else if (body.type === 'leave') {
    if (g.phase !== 'lobby') throw new Error('Igra je u tijeku');
    room.seats[seat] = null;
  } else if (body.type === 'start' || body.type === 'next') {
    if (room.seats.includes(null)) throw new Error('Trebaju 4 igrača');
    if (g.phase === 'over') room.game = Object.assign(G.newGame(g.mode), { dealer: g.dealer });
    else if (body.type === 'start' ? g.phase !== 'lobby' : g.phase !== 'done') throw new Error('Krivi trenutak');
    G.deal(room.game);
  } else {
    G.act(g, seat, body);
    if (g.trick && g.trick.length === 4) setTimeout(() => { G.collect(g); push(room); }, 1500);
  }
  return {};
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'POST' && url.pathname === '/api') {
    let raw = '';
    req.on('data', d => { raw += d; if (raw.length > 4096) req.destroy(); });
    req.on('end', () => {
      let out, status = 200;
      try { const body = JSON.parse(raw); out = handle(body); push(rooms[String(body.room).toUpperCase()]); }
      catch (e) { status = 400; out = { error: e.message }; }
      res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(out));
    });
    return;
  }
  if (url.pathname === '/events') {
    const room = rooms[url.searchParams.get('room')];
    const seat = room ? room.seats.findIndex(s => s && s.token === url.searchParams.get('token')) : -1;
    if (seat < 0) return res.writeHead(404).end();
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    const st = { res, seat };
    room.streams.add(st); push(room);
    const ping = setInterval(() => res.write(': ping\n\n'), 20000); // keeps proxies/phones from dropping the stream
    req.on('close', () => { clearInterval(ping); room.streams.delete(st); push(room); });
    return;
  }
  const file = path.join(PUBLIC, path.normalize(url.pathname === '/' ? 'index.html' : url.pathname));
  const type = TYPES[path.extname(file)];
  if (!file.startsWith(PUBLIC + path.sep) || !type) return res.writeHead(404).end();
  fs.readFile(file, (e, data) => e ? res.writeHead(404).end() : res.writeHead(200, { 'Content-Type': type }).end(data));
});

server.listen(PORT, () => {
  const ips = Object.values(os.networkInterfaces()).flat().filter(i => i.family === 'IPv4' && !i.internal).map(i => i.address);
  console.log('Bela server:', ['localhost', ...ips].map(ip => `http://${ip}:${PORT}`).join('  '));
});
