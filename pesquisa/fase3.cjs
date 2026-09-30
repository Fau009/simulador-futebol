const fs0 = require('fs');
const src = fs0.readFileSync(__dirname + '/fase2.cjs', 'utf8');
eval(src.slice(0, src.indexOf("console.log('=== 5)")).replace(/^const /gm, "var "));
const F = { K: 10, casa: 60, regr: 0.1, a: 0.32, b: 0.4, w: 0.8 };
const d = rodarElo(F.K, F.casa, F.regr, true);
for (const r of R) { const e = probElo(d.get(r.id), F.a, F.b); r.el = e; r.p = { V: (1 - F.w) * r.pdc.V + F.w * e.V, E: (1 - F.w) * r.pdc.E + F.w * e.E, D: (1 - F.w) * r.pdc.D + F.w * e.D }; r.favCasa = r.p.V >= r.p.D; r.pAz = Math.min(r.p.V, r.p.D); r.zebra = r.favCasa ? r.gf > r.gc : r.gc > r.gf; }
const feats = r => [1, Math.log(r.pAz / (1 - r.pAz)), r.x[2], r.x[3], r.x[4], r.x[5] / 4, r.x[6]];
function treinar(D, l2 = 0.01, it = 4000, lr = 0.1) { let b = [0, 1, 0, 0, 0, 0, 0]; for (let k = 0; k < it; k++) { const g = new Array(7).fill(0); for (const r of D) { const x = feats(r); const p = sig(x.reduce((s, v, i) => s + v * b[i], 0)); const e = p - r.zebra; for (let i = 0; i < 7; i++) g[i] += e * x[i]; } for (let i = 0; i < 7; i++) b[i] -= lr * (g[i] / D.length + (i > 1 ? l2 * b[i] : 0)); } return b; }
const treino = R.filter(r => r.t < 2025), teste = R.filter(r => r.t === 2025);
const b = treinar(treino); console.log('coeficientes:', b.map(v => v.toFixed(3)).join(', '));
const pz = r => sig(feats(r).reduce((s, v, i) => s + v * b[i], 0));
const llz = (D, f) => D.reduce((s, r) => s - Math.log(r.zebra ? f(r) : 1 - f(r)), 0) / D.length;
console.log(`zebra teste 2025: só modelo ${llz(teste, r => r.pAz).toFixed(4)} · aprendido ${llz(teste, pz).toFixed(4)}`);
// métricas finais por perfil em 2025
const maisProv = (m, c) => m.filter(([a, bb]) => cls(a, bb) === c).reduce((x, y) => y[2] > x[2] ? y : x);
const real = { V: 0, E: 0, D: 0 }; teste.forEach(r => real[cls(r.gc, r.gf)]++); const n = teste.length;
console.log(`real: ${pct(real.V / n)}/${pct(real.E / n)}/${pct(real.D / n)}`);
const res = {};
for (const [perfil, lim, eq] of [['conservador', 9, 0], ['moderado', 9, 0.12], ['moderado', 9, 0.10], ['moderado', 9, 0.08], ['arriscado', 0.33, 0.12], ['arriscado', 0.35, 0.12], ['arriscado', 0.33, 0.08]]) {
  let ac = 0, ex = 0, zb = 0, zbOk = 0, zbEsp = 0, gols = 0; const prev = { V: 0, E: 0, D: 0 };
  for (const r of teste) {
    const p = r.p; const maior = p.V >= p.E && p.V >= p.D ? 'V' : p.D >= p.E ? 'D' : 'E'; let c = maior;
    if (perfil !== 'conservador' && Math.abs(p.V - p.D) < eq) c = 'E';
    const z = pz(r); if (perfil === 'arriscado' && z >= lim) { c = r.favCasa ? 'D' : 'V'; zb++; zbEsp += r.pAz; }
    const k = perfil === 'arriscado' ? 1.25 : 1;
    // matriz do conjunto: reescala a de Dixon-Coles por classe
    const m0 = PV.matriz(r.lc * k, r.lf * k, RHO); const s0 = somar(m0); const m = m0.map(([a, bb, q]) => [a, bb, q * p[cls(a, bb)] / s0[cls(a, bb)]]);
    const s = maisProv(m, c); const y = cls(r.gc, r.gf);
    prev[c]++; gols += s[0] + s[1]; if (c === y) ac++; if (s[0] === r.gc && s[1] === r.gf) ex++; if (perfil === 'arriscado' && z >= lim && c === y) zbOk++;
  }
  const k = `${perfil}|${lim}|${eq}`;
  res[k] = { acerto: ac / n, exato: ex / n, V: prev.V / n, E: prev.E / n, D: prev.D / n, zebras: zb / n, acertoZebra: zbOk / Math.max(zb, 1), gols: gols / n };
  console.log(`${perfil.padEnd(12)} lim ${lim} eq ${eq}: acerto ${pct(ac / n)} · exato ${pct(ex / n)} · V/E/D ${pct(prev.V / n)}/${pct(prev.E / n)}/${pct(prev.D / n)} · gols/jogo ${(gols / n).toFixed(2)}${zb ? ` · zebras ${zb} (${pct(zb / n)}) acertou ${pct(zbOk / zb)} esperado ${pct(zbEsp / zb)}` : ''}`);
}
const golsReais = teste.reduce((s, r) => s + r.gc + r.gf, 0) / n; console.log('gols/jogo reais', golsReais.toFixed(2));
fs0.writeFileSync(__dirname + '/final.json', JSON.stringify({ F, b, res, real: { V: real.V / n, E: real.E / n, D: real.D / n }, n, golsReais }, null, 1));
