// Run: node test.js
const assert = require('assert');
const G = require('./game');

// play rules (trump = H)
assert.deepStrictEqual(G.legal(['P7', 'PX', 'HJ'], ['P8'], 'H'), ['PX']);            // must beat the led suit
assert.deepStrictEqual(G.legal(['P7', 'HJ'], ['PA'], 'H'), ['P7']);                  // can't beat: still follow suit
assert.deepStrictEqual(G.legal(['P7', 'PA', 'K9'], ['P8', 'H7'], 'H'), ['P7', 'PA']); // trumped: follow, no need to beat
assert.deepStrictEqual(G.legal(['H8', 'HJ', 'K9'], ['P8', 'H9'], 'H'), ['HJ']);       // void: must over-trump
assert.deepStrictEqual(G.legal(['H8', 'K9'], ['P8', 'HJ'], 'H'), ['H8']);             // can't over-trump: still trump
assert.deepStrictEqual(G.legal(['K8', 'T9'], ['P8'], 'H'), ['K8', 'T9']);             // void, no trump: anything
assert.strictEqual(G.trickWinner(['PA', 'H7', 'PX', 'H9'], 'H'), 3);
assert.strictEqual(G.trickWinner(['PX', 'KA', 'PA', 'P7'], 'H'), 2);

// zvanja
const pts = h => G.zvanja(h).map(z => z.pts).sort((a, b) => a - b);
assert.deepStrictEqual(pts(['H7', 'H8', 'H9', 'KA']), [20]);
assert.deepStrictEqual(pts(['HX', 'HJ', 'HQ', 'HK', 'PJ', 'KJ', 'TJ']), [50, 200]);
assert.deepStrictEqual(pts(['P9', 'PX', 'PJ', 'PQ', 'PK', 'PA']), [100]);
assert.deepStrictEqual(pts(['T7', 'T8', 'T9', 'TX', 'TJ', 'TQ', 'TK', 'TA']), [Infinity]); // belot

// full random hands: always 162 + 90 štiglja math holds, game ends
for (let n = 0; n < 300; n++) {
  const g = G.newGame(G.MODES[n % 2]);
  let hands = 0;
  while (g.winner == null && hands++ < 100) {
    G.deal(g);
    while (g.phase === 'bid') {
      const v = G.view(g, g.turn), pass = Math.random() < 0.7 && !(g.turn === g.dealer && g.round === 2) && !(g.turn === g.dealer && !g.up);
      G.act(g, g.turn, { type: 'bid', suit: pass ? null : v.bids[Math.floor(Math.random() * v.bids.length)] });
    }
    assert.ok(g.hands.every(h => h.length === 8));
    if (g.phase === 'over') break; // belot
    while (g.phase === 'play') {
      if (g.turn == null) { G.collect(g); continue; }
      const v = G.view(g, g.turn);
      G.act(g, g.turn, { type: 'play', card: v.legal[Math.floor(Math.random() * v.legal.length)] });
    }
    const r = g.result, all = r.cards[0] + r.cards[1];
    assert.strictEqual(all, G.HAND); // raw card points incl. last trick
    assert.strictEqual(r.score[0] + r.score[1], (r.stiglja == null ? G.HAND : 252) + r.zv[0] + r.zv[1]);
  }
  assert.ok(g.winner === 0 || g.winner === 1);
}
assert.throws(() => { const g = G.newGame(); G.deal(g); G.act(g, (g.turn + 1) % 4, { type: 'bid', suit: 'H' }); }, /Nisi na redu/);
assert.throws(() => { const g = G.newGame(); G.deal(g); G.act(g, g.turn, { type: 'bid', suit: ['H'] }); }, /Kriva boja/);

// otvorena: dealer sees 7 + face-up card; round 1 only its suit, round 2 the other three, then dealer must call
{ const g = G.newGame('otvorena'); G.deal(g);
  const d = g.dealer, up = g.up, us = up[0];
  assert.strictEqual(G.view(g, d).hand.length, 7); assert.strictEqual(G.view(g, (d + 1) % 4).hand.length, 8);
  assert.deepStrictEqual(G.view(g, g.turn).bids, [us]);
  for (let i = 0; i < 4; i++) G.act(g, g.turn, { type: 'bid', suit: null }); // everyone passes round 1, dealer too
  assert.strictEqual(g.round, 2);
  assert.throws(() => G.act(g, g.turn, { type: 'bid', suit: us }), /Kriva boja/);
  for (let i = 0; i < 3; i++) G.act(g, g.turn, { type: 'bid', suit: null });
  assert.throws(() => G.act(g, d, { type: 'bid', suit: null }), /mora zvati/);
  const other = 'HKPT'.replace(us, '')[0];
  G.act(g, d, { type: 'bid', suit: other });
  assert.ok(g.hands[d].includes(up) && g.trump === other && g.caller === d % 2); }
console.log('ok');
