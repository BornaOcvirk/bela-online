// Bela game engine (Croatian rules), pure state machine. Seats 0..3, teams: seat % 2 (0&2 vs 1&3).
// Play order is "next seat" = seat + 1 (shown counter-clockwise in the UI, as bela is played).
// Cards are 2-char strings: suit (H herc, K karo, P pik, T tref) + rank (7 8 9 X J Q K A), e.g. 'HX' = 10♥.
(function (exports) { // runs on the server (require) and in the browser (window.Bela) for offline play
const SUITS = 'HKPT', RANKS = '789XJQKA';
const TRUMP_ORDER = '78QKXA9J', PLAIN_ORDER = '789JQKXA';            // weakest -> strongest
const TRUMP_PTS = { J: 20, 9: 14, A: 11, X: 10, K: 4, Q: 3 }, PLAIN_PTS = { A: 11, X: 10, K: 4, Q: 3, J: 2 };
const FOUR_PTS = { J: 200, 9: 150, A: 100, X: 100, K: 100, Q: 100 };
const HAND = 162, STIGLJA = 90, TARGET = 1001;
// Pace (ms): a player's time to act before a card is played for them, a bot's thinking time,
// how long a full trick stays on the table, and the extra pause while zvanja are shown.
const TURN_MS = 30000, BOT_MS = 1300, TRICK_MS = 2500, ZVANJA_MS = 4500;

const suit = c => c[0], rank = c => c[1], team = s => s % 2;
const points = (c, trump) => ((suit(c) === trump ? TRUMP_PTS : PLAIN_PTS)[rank(c)] || 0);
const strength = (c, trump) => (suit(c) === trump ? TRUMP_ORDER : PLAIN_ORDER).indexOf(rank(c));
// True if card a beats card b (b already on the table) — a must be trump or the same suit as b.
const beats = (a, b, trump) => suit(a) === suit(b) ? strength(a, trump) > strength(b, trump) : suit(a) === trump;
// Index into trick of the winning card.
function trickWinner(cards, trump) {
  let w = 0;
  for (let i = 1; i < cards.length; i++) if (beats(cards[i], cards[w], trump)) w = i;
  return w;
}
// Croatian rules: follow suit and beat the winning card if you can; void -> must trump (and over-trump if you can); else anything.
function legal(hand, trick, trump) {
  if (!trick.length) return hand;
  const led = suit(trick[0]), win = trick[trickWinner(trick, trump)];
  const pick = cs => { const up = cs.filter(c => beats(c, win, trump)); return up.length ? up : cs; };
  const same = hand.filter(c => suit(c) === led);
  if (same.length) return suit(win) === led ? pick(same) : same; // already trumped: just follow suit
  const trumps = hand.filter(c => suit(c) === trump);
  if (trumps.length) return pick(trumps);
  return hand;
}

// Zvanja in an 8-card hand: sequences (3 = 20, 4 = 50, 5-7 = 100, 8 = belot) and four of a kind.
// Each item: { pts, len, top, cards }; belot has pts Infinity. A card may count in a sequence and a four.
function zvanja(hand) {
  const out = [];
  for (const s of SUITS) {
    let run = [];
    for (const r of RANKS + '-') {
      if (hand.includes(s + r)) { run.push(s + r); continue; }
      const n = run.length;
      if (n >= 3) out.push({ pts: n === 8 ? Infinity : n >= 5 ? 100 : n === 4 ? 50 : 20, len: n, top: RANKS.indexOf(rank(run[n - 1])), cards: run });
      run = [];
    }
  }
  for (const r in FOUR_PTS) {
    const cs = SUITS.split('').map(s => s + r);
    if (cs.every(c => hand.includes(c))) out.push({ pts: FOUR_PTS[r], len: 4, top: 10 + RANKS.indexOf(r), cards: cs });
  }
  return out;
}
const better = (a, b) => a.pts - b.pts || a.len - b.len || a.top - b.top;

// From bela-blok/docs/bela.js: the calling team needs MORE than half of all points or it falls and the others take all.
function scoreHand({ caller, cards, zvanja, stiglja = null }) {
  const c = stiglja == null ? cards : stiglja === 0 ? [HAND + STIGLJA, 0] : [0, HAND + STIGLJA];
  const t = [c[0] + zvanja[0], c[1] + zvanja[1]];
  const all = t[0] + t[1];
  const fell = t[caller] * 2 <= all;
  if (!fell) return { score: t, fell };
  const score = [0, 0];
  score[1 - caller] = all;
  return { score, fell };
}

function shuffled() {
  const d = []; for (const s of SUITS) for (const r of RANKS) d.push(s + r);
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  return d;
}

// mode 'zatvorena': see 6 cards, call, then pick up the last 2; dealer must call.
// mode 'otvorena': dealer's 8th card lies face up. Round 1: only its suit can be called; round 2: one of the other 3, dealer must call.
const MODES = ['zatvorena', 'otvorena'];
function newGame(mode = 'zatvorena') {
  return { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), mode, phase: 'lobby', dealer: 3, scores: [0, 0], history: [], winner: null };
}

function deal(g, deck = shuffled()) {
  g.dealer = (g.dealer + 1) % 4;
  // Both modes: 6 cards while calling, the last 2 (talon) only once trump is called. Otvorena: the dealer's 7th lies face up.
  g.hands = [0, 1, 2, 3].map(s => deck.slice(s * 8, s * 8 + 6));
  g.talon = [0, 1, 2, 3].map(s => deck.slice(s * 8 + 6, s * 8 + 8));
  g.up = g.mode === 'otvorena' ? g.talon[g.dealer][0] : null;
  Object.assign(g, { phase: 'bid', round: 1, turn: (g.dealer + 1) % 4, trump: null, caller: null, trick: [], leader: null,
    won: [[], []], tricks: [0, 0], bela: [0, 0], zv: null, last: null, result: null });
}

// action: { type: 'bid', suit: 'H'|...|null (dalje) } or { type: 'play', card }. Throws on anything illegal.
function act(g, seat, a) {
  if (g.turn !== seat) throw new Error('Nisi na redu');
  if (g.phase === 'bid' && a.type === 'bid') {
    if (a.suit == null) {
      if (seat === g.dealer) { if (g.up && g.round === 1) g.round = 2; else throw new Error('Djelitelj mora zvati'); }
      g.turn = (seat + 1) % 4; return;
    }
    if (!bidOptions(g).includes(a.suit)) throw new Error('Kriva boja');
    g.trump = a.suit; g.caller = team(seat);
    g.hands = g.hands.map((h, s) => sortHand([...h, ...g.talon[s]], g.trump));
    declare(g);
    g.phase = g.winner != null ? 'over' : 'play';
    g.turn = g.leader = (g.dealer + 1) % 4;
    return;
  }
  if (g.phase === 'play' && a.type === 'play') {
    const h = g.hands[seat];
    if (g.trick.length === 4) throw new Error('Pričekaj');
    if (!legal(h, g.trick, g.trump).includes(a.card)) throw new Error('Ne smiješ baciti tu kartu');
    // Bela: K+Q of trump, scored when the first of the two is played (auto-declared).
    if (suit(a.card) === g.trump && 'KQ'.includes(rank(a.card)) && h.includes(g.trump + (rank(a.card) === 'K' ? 'Q' : 'K'))) {
      g.bela[team(seat)] = 20; g.belaBy = seat;
    }
    h.splice(h.indexOf(a.card), 1);
    g.trick.push(a.card);
    g.turn = g.trick.length === 4 ? null : (seat + 1) % 4;
    return;
  }
  throw new Error('Krivi potez');
}

function bidOptions(g) {
  if (!g.up) return SUITS.split('');
  return SUITS.split('').filter(s => (s === suit(g.up)) === (g.round === 1));
}

// Called by the server a moment after the 4th card, so everyone sees the full trick.
function collect(g) {
  if (g.phase !== 'play' || g.trick.length !== 4) return;
  const w = (g.leader + trickWinner(g.trick, g.trump)) % 4, t = team(w);
  g.won[t].push(...g.trick); g.tricks[t]++;
  g.last = { cards: g.trick, leader: g.leader, winner: w };
  g.trick = []; g.turn = g.leader = w;
  if (g.hands[w].length) return;
  // Hand over.
  const cards = [0, 1].map(i => g.won[i].reduce((p, c) => p + points(c, g.trump), 0) + (team(w) === i ? 10 : 0));
  const stiglja = g.tricks[0] === 8 ? 0 : g.tricks[1] === 8 ? 1 : null;
  const zv = [0, 1].map(i => g.tricks[i] ? (g.zv.team === i ? g.zv.sum : 0) + g.bela[i] : 0); // no tricks -> zvanja don't count
  const r = scoreHand({ caller: g.caller, cards, zvanja: zv, stiglja });
  g.result = { cards, zv, stiglja, ...r };
  g.history.push(r.score);
  g.scores = [g.scores[0] + r.score[0], g.scores[1] + r.score[1]];
  const [a, b] = g.scores;
  if (Math.max(a, b) >= TARGET && a !== b) g.winner = a > b ? 0 : 1;
  g.phase = g.winner != null ? 'over' : 'done';
  g.turn = null;
}

// Only the team holding the best single zvanje scores (all of theirs). Tie -> earlier in play order. Belot wins the match.
function declare(g) {
  const first = (g.dealer + 1) % 4;
  const per = g.hands.map(zvanja);
  let best = null;
  for (let i = 0; i < 4; i++) {
    const s = (first + i) % 4;
    for (const z of per[s]) if (!best || better(z, best.z) > 0) best = { s, z };
  }
  if (best && best.z.pts === Infinity) { g.winner = team(best.s); g.belot = best.s; g.turn = null; return; }
  const t = best ? team(best.s) : null;
  g.zv = { team: t, sum: 0, list: per.map((zs, s) => team(s) === t ? zs : []) };
  g.zv.sum = g.zv.list.flat().reduce((p, z) => p + z.pts, 0);
}

function sortHand(h, trump) {
  const order = s => s === trump ? -1 : SUITS.indexOf(s);
  return h.sort((a, b) => order(suit(a)) - order(suit(b)) || strength(b, trump) - strength(a, trump));
}

// What one seat is allowed to see.
function view(g, seat) {
  const v = { ...g, talon: undefined, won: undefined, hands: undefined, belaBy: undefined };
  if (g.hands) {
    v.hand = g.phase === 'bid' ? sortHand([...g.hands[seat]], null) : g.hands[seat];
    v.counts = g.hands.map(h => h.length);
    v.legal = g.turn === seat && g.phase === 'play' ? legal(g.hands[seat], g.trick, g.trump) : [];
    v.bids = g.phase === 'bid' ? bidOptions(g) : [];
    v.pts = g.won.map(cs => cs.reduce((p, c) => p + points(c, g.trump), 0)); // card points taken so far (tricks are public)
  }
  return v;
}

// Bots: simple rules of thumb, using only what that seat may see (its own hand and the table).
function bidScore(hand, s) {
  return hand.reduce((v, c) => v + (suit(c) === s ? 10 + (TRUMP_PTS[rank(c)] || 0) : rank(c) === 'A' ? 10 : 0), 0);
}
// How much a card is worth keeping: points first, then strength; any trump above any plain card.
const weakest = (cs, T) => cs.reduce((a, b) => {
  const val = c => points(c, T) * 10 + strength(c, T) + (suit(c) === T ? 100 : 0);
  return val(b) < val(a) ? b : a;
});
// A player who runs out of time: says dalje (or, as a dealer who must call, calls like a bot) and plays the weakest legal card.
function timeoutMove(g, seat) {
  if (g.phase === 'bid') { const b = botMove(g, seat); return b.suit && (seat !== g.dealer || (g.up && g.round === 1)) ? { type: 'bid', suit: null } : b; }
  return { type: 'play', card: weakest(legal(g.hands[seat], g.trick, g.trump), g.trump) };
}
function botMove(g, seat) {
  const h = g.hands[seat];
  if (g.phase === 'bid') {
    const best = bidOptions(g).map(s => [bidScore(h, s), s]).sort((a, b) => b[0] - a[0])[0];
    const must = seat === g.dealer && (!g.up || g.round === 2);
    return { type: 'bid', suit: must || best[0] >= 60 ? best[1] : null };
  }
  const T = g.trump, leg = legal(h, g.trick, T), cheap = cs => weakest(cs, T);
  const dear = cs => cs.reduce((a, b) => points(b, T) > points(a, T) ? b : a);
  const play = card => ({ type: 'play', card });
  if (!g.trick.length) {
    const ace = leg.find(c => suit(c) !== T && rank(c) === 'A');
    if (ace) return play(ace);
    if (team(seat) === g.caller && leg.includes(T + 'J')) return play(T + 'J'); // pull trumps
    const plain = leg.filter(c => suit(c) !== T);
    return play(cheap(plain.length ? plain : leg));
  }
  const w = trickWinner(g.trick, T), last = g.trick.length === 3;
  if (team((g.leader + w) % 4) === team(seat)) return play(last ? dear(leg) : cheap(leg)); // partner winning: add points
  const win = leg.filter(c => beats(c, g.trick[w], T));
  if (win.length) return play(last ? cheap(win) : win.reduce((a, b) => strength(b, T) > strength(a, T) ? b : a));
  return play(cheap(leg));
}

// The next timed step for whoever runs the game (server, or the phone offline): collect a full trick,
// let a bot move, or play for a player whose time ran out. Sets g.deadline for players so everyone sees a countdown.
function nextTimer(g, isBot) {
  g.deadline = null;
  if (g.phase === 'play' && g.trick.length === 4) return { ms: TRICK_MS, run: () => collect(g) };
  if ((g.phase !== 'bid' && g.phase !== 'play') || g.turn == null) return null;
  const firstLead = g.phase === 'play' && !g.last && !g.trick.length && g.zv?.team != null;
  const ms = (isBot(g.turn) ? BOT_MS : TURN_MS) + (firstLead ? ZVANJA_MS : 0);
  if (!isBot(g.turn)) g.deadline = Date.now() + ms;
  return { ms, run: () => act(g, g.turn, (isBot(g.turn) ? botMove : timeoutMove)(g, g.turn)) };
}

Object.assign(exports, { timeoutMove, nextTimer, TURN_MS, ZVANJA_MS, MODES, legal, trickWinner, zvanja, scoreHand, newGame, deal, act, collect, view, points, team, botMove, HAND });
})(typeof module !== 'undefined' ? module.exports : (window.Bela = {}));
