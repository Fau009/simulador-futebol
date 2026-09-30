const fs0 = require('fs');
const src = fs0.readFileSync(__dirname + '/fase2.cjs', 'utf8');
// reaproveita as funções do fase2 até a seção 5
eval(src.slice(0, src.indexOf("console.log('=== 5)")).replace(/^const /gm, "var "));
let melhor = null;
for (const K of [5, 7, 10, 12]) for (const casa of [50, 60, 70]) for (const regr of [0.1, 0.2, 0.3]) for (const mg of [true, false]) {
  const d = rodarElo(K, casa, regr, mg);
  for (const a of [0.3, 0.32, 0.34]) for (const b of [0.3, 0.4, 0.5, 0.6]) {
    for (const w of [0.6, 0.7, 0.8, 0.9, 1.0]) {
      const [ll, br] = avaliar(r => { const e = probElo(d.get(r.id), a, b); return { V: (1 - w) * r.pdc.V + w * e.V, E: (1 - w) * r.pdc.E + w * e.E, D: (1 - w) * r.pdc.D + w * e.D }; });
      if (!melhor || ll < melhor.ll) melhor = { ll, br, K, casa, regr, mg, a, b, w };
    }
  }
}
console.log('melhor:', JSON.stringify(melhor));
// e em cada liga, com esses parâmetros: DC sozinho × conjunto
const d = rodarElo(melhor.K, melhor.casa, melhor.regr, melhor.mg);
const porLiga = {};
for (const r of R) {
  const e = probElo(d.get(r.id), melhor.a, melhor.b); const w = melhor.w; const p = { V: (1 - w) * r.pdc.V + w * e.V, E: (1 - w) * r.pdc.E + w * e.E, D: (1 - w) * r.pdc.D + w * e.D };
  const y = cls(r.gc, r.gf); const L = (porLiga[r.liga] ||= { n: 0, dc: 0, cj: 0 }); L.n++; L.dc -= Math.log(r.pdc[y]); L.cj -= Math.log(p[y]);
}
for (const [l, v] of Object.entries(porLiga)) console.log(l.padEnd(6), `Dixon-Coles ${(v.dc / v.n).toFixed(4)} · conjunto ${(v.cj / v.n).toFixed(4)}`);
