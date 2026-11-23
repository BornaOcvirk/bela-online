// Run: node test.js
const assert = require('assert');
const G = require('./public/game');

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
    assert.strictEqual(G.view(g, 0).pts[0] + G.view(g, 0).pts[1], 152); // live points = every card, last-trick 10 not included
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
  assert.ok([0, 1, 2, 3].every(x => G.view(g, x).hand.length === 6)); // last 2 only after the call
  assert.deepStrictEqual(G.view(g, g.turn).bids, [us]);
  for (let i = 0; i < 4; i++) G.act(g, g.turn, { type: 'bid', suit: null }); // everyone passes round 1, dealer too
  assert.strictEqual(g.round, 2);
  assert.throws(() => G.act(g, g.turn, { type: 'bid', suit: us }), /Kriva boja/);
  for (let i = 0; i < 3; i++) G.act(g, g.turn, { type: 'bid', suit: null });
  assert.throws(() => G.act(g, d, { type: 'bid', suit: null }), /mora zvati/);
  const other = 'HKPT'.replace(us, '')[0];
  G.act(g, d, { type: 'bid', suit: other });
  assert.ok(g.hands[d].includes(up) && g.trump === other && g.caller === d % 2); }

// bots: always legal, and team 0 bots beat team 1 random players most of the time
{ let botWins = 0;
  for (let n = 0; n < 200; n++) {
    const g = G.newGame(G.MODES[n % 2]);
    for (let k = 0; g.winner == null && k < 100; k++) {
      G.deal(g);
      while (g.phase === 'bid' || g.phase === 'play') {
        if (g.turn == null) { G.collect(g); continue; }
        if (g.turn % 2 === 0 || g.phase === 'bid') { G.act(g, g.turn, G.botMove(g, g.turn)); continue; }
        const leg = G.view(g, g.turn).legal;
        G.act(g, g.turn, { type: 'play', card: leg[Math.floor(Math.random() * leg.length)] });
      }
    }
    if (g.winner === 0) botWins++;
  }
  assert.ok(botWins > 130, 'bots won only ' + botWins + '/200');
  console.log('bots beat random players in', botWins, '/ 200 games'); }

// timers alone (everyone timing out) carry a hand to the end; players get a deadline, bots don't
{ const g = G.newGame('otvorena'); G.deal(g);
  let t = G.nextTimer(g, () => false);
  assert.ok(t.ms >= G.TURN_MS && g.deadline > Date.now());
  assert.strictEqual(G.nextTimer(g, () => true).ms < G.TURN_MS && g.deadline, null);
  for (let k = 0; k < 100 && (t = G.nextTimer(g, () => false)); k++) t.run();
  assert.ok(g.phase === 'done' || g.phase === 'over'); }

// time-out: weakest legal card; passes the call unless the dealer must call
{ const g = { phase: 'play', trump: 'H', trick: ['P8'], hands: [['PA', 'P7', 'PX']], turn: 0 };
  assert.deepStrictEqual(G.timeoutMove(g, 0), { type: 'play', card: 'PX' });  // must beat the 8: 10 or A -> the 10
  const b = G.newGame('zatvorena'); G.deal(b);
  assert.deepStrictEqual(G.timeoutMove(b, b.turn), { type: 'bid', suit: null });
  b.turn = b.dealer; assert.ok('HKPT'.includes(G.timeoutMove(b, b.dealer).suit)); }
console.log('ok');
