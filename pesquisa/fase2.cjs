// FASE 2: Elo, conjunto (Dixon-Coles + Elo), binomial negativa e índice de zebra aprendido (regressão logística)
const fs = require('fs'), vm = require('vm');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname + '/../js/previsao.js', 'utf8') + ';this.P=Previsao;', ctx);
const PV = ctx.P;
const R = JSON.parse(fs.readFileSync(__dirname + '/registros.json', 'utf8'));
const dados = JSON.parse(fs.readFileSync(__dirname + '/dados.json', 'utf8'));
const cls = (a, b) => a > b ? 'V' : a === b ? 'E' : 'D';
const somar = m => { const r = { V: 0, E: 0, D: 0 }; for (const [a, b, p] of m) r[cls(a, b)] += p; return r; };
const pct = x => (x * 100).toFixed(1) + '%', sig = x => 1 / (1 + Math.exp(-x)), clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const RHO = -0.06;
for (const r of R) r.pdc = somar(PV.matriz(r.lc, r.lf, RHO));
const byId = new Map(R.map(r => [r.id, r]));
const avaliar = (fn) => { let ll = 0, br = 0; for (const r of R) { const p = fn(r); const y = cls(r.gc, r.gf); ll -= Math.log(Math.max(p[y], 1e-9)); br += (p.V - (y === 'V')) ** 2 + (p.E - (y === 'E')) ** 2 + (p.D - (y === 'D')) ** 2; } return [ll / R.length, br / R.length]; };

// ---- Elo sequencial (mesma lógica do previsao.js), guardando a diferença antes de cada jogo
function rodarElo(K, casa, regr, margemOn = true) {
  const d = new Map();
  for (const liga in dados) {
    const elo = {}; let ult = null; const E = id => (elo[id] ??= 1500);
    for (const j of dados[liga]) {
      if (j.st !== 'fim') continue;
      const dt = Date.parse(j.d);
      if (ult && dt - ult > 45 * 864e5) for (const id in elo) elo[id] = 1500 + (elo[id] - 1500) * (1 - regr);
      ult = dt;
      const dd = E(j.c) + casa - E(j.f); if (byId.has(j.id)) d.set(j.id, dd);
      const esp = 1 / (1 + Math.pow(10, -dd / 400)); const res = j.gc > j.gf ? 1 : j.gc === j.gf ? 0.5 : 0;
      const delta = K * (margemOn ? Math.log(Math.abs(j.gc - j.gf) + 1) + 1 : 1) * (res - esp); elo[j.c] += delta; elo[j.f] -= delta;
    }
  }
  return d;
}
const probElo = (dd, a, b) => { const e = 1 / (1 + Math.pow(10, -dd / 400)); const pE = clamp(a - b * Math.abs(e - 0.5), 0.08, 0.4); const pV = clamp(e - pE / 2, 0.02, 0.96), pD = clamp(1 - e - pE / 2, 0.02, 0.96); const s = pV + pE + pD; return { V: pV / s, E: pE / s, D: pD / s }; };

console.log('=== 5) Elo sozinho: busca de parâmetros ===');
let melhorElo = null;
for (const K of [10, 15, 20, 30]) for (const casa of [40, 60, 80]) for (const regr of [0.2, 0.33, 0.5]) {
  const d = rodarElo(K, casa, regr);
  let best = null; for (const a of [0.26, 0.28, 0.3, 0.32]) for (const b of [0.2, 0.4, 0.6]) { const [ll] = avaliar(r => probElo(d.get(r.id), a, b)); if (!best || ll < best.ll) best = { ll, a, b }; }
  if (!melhorElo || best.ll < melhorElo.ll) melhorElo = { ...best, K, casa, regr, d };
}
const [llDC, brDC] = avaliar(r => r.pdc);
const [llE, brE] = avaliar(r => probElo(melhorElo.d.get(r.id), melhorElo.a, melhorElo.b));
console.log(`melhor Elo: K=${melhorElo.K}, mando=${melhorElo.casa}, regressão entre temporadas=${melhorElo.regr}, empate a=${melhorElo.a} b=${melhorElo.b}`);
console.log(`Dixon-Coles: log-loss ${llDC.toFixed(4)} · Brier ${brDC.toFixed(4)}`);
console.log(`Elo:         log-loss ${llE.toFixed(4)} · Brier ${brE.toFixed(4)}`);

console.log('\n=== 6) Conjunto: (1−w)·Dixon-Coles + w·Elo ===');
let melhorW = null;
for (const w of [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7]) {
  const [ll, br] = avaliar(r => { const e = probElo(melhorElo.d.get(r.id), melhorElo.a, melhorElo.b); return { V: (1 - w) * r.pdc.V + w * e.V, E: (1 - w) * r.pdc.E + w * e.E, D: (1 - w) * r.pdc.D + w * e.D }; });
  console.log(`w=${w.toFixed(1)}: log-loss ${ll.toFixed(4)} · Brier ${br.toFixed(4)}`);
  if (!melhorW || ll < melhorW.ll) melhorW = { w, ll, br };
}
const W = melhorW.w;
for (const r of R) { const e = probElo(melhorElo.d.get(r.id), melhorElo.a, melhorElo.b); r.p = { V: (1 - W) * r.pdc.V + W * e.V, E: (1 - W) * r.pdc.E + W * e.E, D: (1 - W) * r.pdc.D + W * e.D }; r.pAz = r.favCasa ? r.p.D : r.p.V; r.zebra = r.favCasa ? r.gf > r.gc : r.gc > r.gf; }

console.log('\n=== 7) Binomial negativa × Poisson (placar exato e resultado) ===');
const lg = [0]; for (let i = 1; i < 60; i++) lg[i] = lg[i - 1] + Math.log(i);
const nb = (k, l, rr) => Math.exp(lg[k + rr - 1 > 59 ? 59 : k + rr - 1] - lg[k] - lg[rr - 1] + rr * Math.log(rr / (rr + l)) + k * Math.log(l / (rr + l)));
const pois = (k, l) => Math.exp(-l + k * Math.log(l) - lg[k]);
for (const rr of [0, 5, 10, 20, 40]) {
  let llp = 0, llr = 0;
  for (const r of R) {
    const f = rr ? (k, l) => nb(k, l, rr) : pois; let s = 0, pr = { V: 0, E: 0, D: 0 };
    for (let a = 0; a <= 10; a++) for (let b = 0; b <= 10; b++) { const p = f(a, r.lc) * f(b, r.lf); s += p; pr[cls(a, b)] += p; }
    const pe = (r.gc <= 10 && r.gf <= 10 ? f(r.gc, r.lc) * f(r.gf, r.lf) : 1e-6) / s; llp -= Math.log(pe); llr -= Math.log(pr[cls(r.gc, r.gf)] / s);
  }
  console.log(`${rr ? 'binomial negativa r=' + rr : 'Poisson           '}: log-loss do placar exato ${(llp / R.length).toFixed(4)} · do resultado ${(llr / R.length).toFixed(4)}`);
}

console.log('\n=== 8) Índice de zebra aprendido (regressão logística) — treino 2023–2024, teste 2025 ===');
const feats = r => [1, Math.log(r.pAz / (1 - r.pAz)), r.x[2], r.x[3], r.x[4], r.x[5] / 4, r.x[6]];
function treinar(D, l2 = 0.01, it = 3000, lr = 0.1) {
  let b = [0, 1, 0, 0, 0, 0, 0];
  for (let k = 0; k < it; k++) {
    const g = new Array(7).fill(0);
    for (const r of D) { const x = feats(r); const p = sig(x.reduce((s, v, i) => s + v * b[i], 0)); const e = p - r.zebra; for (let i = 0; i < 7; i++) g[i] += e * x[i]; }
    for (let i = 0; i < 7; i++) b[i] -= lr * (g[i] / D.length + (i > 1 ? l2 * b[i] : 0));
  }
  return b;
}
const treino = R.filter(r => r.t < 2025), teste = R.filter(r => r.t === 2025);
const b = treinar(treino);
const nomes = ['intercepto', 'logit(chance do azarão)', 'gols esperados', 'imprevisibilidade', 'forma az−fav', 'descanso az−fav (÷4 dias)', 'confronto direto az−fav'];
b.forEach((v, i) => console.log(`  ${nomes[i].padEnd(28)} ${v.toFixed(3)}`));
const llz = (D, f) => D.reduce((s, r) => s - Math.log(r.zebra ? f(r) : 1 - f(r)), 0) / D.length;
const pz = r => sig(feats(r).reduce((s, v, i) => s + v * b[i], 0));
console.log(`teste 2025 (${teste.length} jogos): log-loss só modelo ${llz(teste, r => r.pAz).toFixed(4)} · aprendido ${llz(teste, pz).toFixed(4)}`);
const ord = [...teste].sort((a, c) => pz(a) - pz(c));
for (let q = 0; q < 5; q++) { const g = ord.slice(q * ord.length / 5 | 0, (q + 1) * ord.length / 5 | 0); console.log(`  quinto ${q + 1}: índice ${pct(g.reduce((s, r) => s + pz(r), 0) / g.length)} · só modelo ${pct(g.reduce((s, r) => s + r.pAz, 0) / g.length)} · real ${pct(g.filter(r => r.zebra).length / g.length)}`); }

console.log('\n=== 9) Perfis finais (conjunto + zebra aprendido) — teste 2025 ===');
const maisProv = (m, c) => m.filter(([a, bb]) => cls(a, bb) === c).reduce((x, y) => y[2] > x[2] ? y : x);
const real = { V: 0, E: 0, D: 0 }; teste.forEach(r => real[cls(r.gc, r.gf)]++);
console.log(`real 2025: V/E/D ${pct(real.V / teste.length)}/${pct(real.E / teste.length)}/${pct(real.D / teste.length)} · zebras ${pct(teste.filter(r => r.zebra).length / teste.length)}`);
for (const lim of [0.30, 0.33, 0.36])
  for (const perfil of ['conservador', 'moderado', 'arriscado']) {
    if (lim !== 0.30 && perfil !== 'arriscado') continue;
    let ac = 0, ex = 0, zb = 0, zbOk = 0, zbEsp = 0; const prev = { V: 0, E: 0, D: 0 };
    for (const r of teste) {
      const p = r.p; const maior = p.V >= p.E && p.V >= p.D ? 'V' : p.D >= p.E ? 'D' : 'E'; let c = maior;
      if (perfil !== 'conservador' && Math.abs(p.V - p.D) < 0.12) c = 'E';
      const z = pz(r); if (perfil === 'arriscado' && z >= lim) { c = r.favCasa ? 'D' : 'V'; zb++; zbEsp += r.pAz; }
      const k = perfil === 'arriscado' ? 1.25 : 1; const s = maisProv(PV.matriz(r.lc * k, r.lf * k, RHO), c); const y = cls(r.gc, r.gf);
      prev[c]++; if (c === y) ac++; if (s[0] === r.gc && s[1] === r.gf) ex++; if (perfil === 'arriscado' && z >= lim && c === y) zbOk++;
    }
    const n = teste.length;
    console.log(`${perfil.padEnd(12)}${perfil === 'arriscado' ? ` (limiar ${lim})` : '            '} acerto ${pct(ac / n)} · exato ${pct(ex / n)} · previu V/E/D ${pct(prev.V / n)}/${pct(prev.E / n)}/${pct(prev.D / n)}${perfil === 'arriscado' ? ` · apostou em ${zb} zebras, acertou ${pct(zbOk / Math.max(zb, 1))} (o modelo esperava ${pct(zbEsp / Math.max(zb, 1))})` : ''}`);
  }
fs.writeFileSync(__dirname + '/parametros.json', JSON.stringify({ elo: { K: melhorElo.K, casa: melhorElo.casa, regressao: melhorElo.regr, empA: melhorElo.a, empB: melhorElo.b, peso: W }, zebra: b }, null, 1));
