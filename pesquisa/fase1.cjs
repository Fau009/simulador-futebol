// FASE 1: Dixon-Coles, sinais de zebra, índice "à mão" e os 3 perfis
const fs = require('fs'), vm = require('vm');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname + '/../js/previsao.js', 'utf8') + ';this.P=Previsao;', ctx);
const PV = ctx.P;
const R = JSON.parse(fs.readFileSync(__dirname + '/registros.json', 'utf8'));
const cls = (a, b) => a > b ? 'V' : a === b ? 'E' : 'D';
const somar = m => { const r = { V: 0, E: 0, D: 0 }; for (const [a, b, p] of m) r[cls(a, b)] += p; return r; };
const pct = x => (x * 100).toFixed(1) + '%';
const sig = x => 1 / (1 + Math.exp(-x));

console.log(`\n=== 1) Poisson × Dixon-Coles (${R.length} jogos) ===`);
for (const rho of [0, -0.03, -0.06, -0.09, -0.12, -0.15]) {
  let ll = 0, br = 0, e0 = 0, e1 = 0, emp = 0;
  for (const r of R) {
    const m = PV.matriz(r.lc, r.lf, rho); const p = somar(m); const y = cls(r.gc, r.gf);
    ll -= Math.log(p[y]); br += (p.V - (y === 'V')) ** 2 + (p.E - (y === 'E')) ** 2 + (p.D - (y === 'D')) ** 2;
    emp += p.E; if (y === 'E') e1++;
  }
  console.log(`rho ${rho.toFixed(2).padStart(5)}: log-loss ${(ll / R.length).toFixed(4)} · Brier ${(br / R.length).toFixed(4)} · empates previstos ${pct(emp / R.length)} (reais ${pct(e1 / R.length)})`);
}

// base da fase 1: Dixon-Coles com rho escolhido, sem Elo
const RHO = -0.06;
for (const r of R) { const p = somar(PV.matriz(r.lc, r.lf, RHO)); r.p = p; r.pAz = Math.min(p.V, p.D); r.azCasa = !r.favCasa; r.zebra = r.favCasa ? r.gf > r.gc : r.gc > r.gf; }

console.log(`\n=== 2) Sinais de zebra: taxa real de zebra ÷ taxa esperada pelo modelo, por terço do sinal ===`);
console.log('(acima de 1 = zebras acontecem mais do que o modelo espera quando o sinal está alto)');
const nomes = ['', 'chance do azarão', 'gols esperados (volatilidade)', 'imprevisibilidade', 'forma recente az−fav', 'descanso az−fav', 'confronto direto az−fav'];
for (let i = 2; i < 7; i++) {
  const ord = [...R].sort((a, b) => a.x[i] - b.x[i]); const n = ord.length; const t = [ord.slice(0, n / 3 | 0), ord.slice(n / 3 | 0, 2 * n / 3 | 0), ord.slice(2 * n / 3 | 0)];
  const rz = g => { const real = g.filter(r => r.zebra).length / g.length, esp = g.reduce((s, r) => s + r.pAz, 0) / g.length; return `${(real / esp).toFixed(2)} (real ${pct(real)} × esp ${pct(esp)})`; };
  console.log(`${nomes[i].padEnd(30)} baixo ${rz(t[0])} | médio ${rz(t[1])} | alto ${rz(t[2])}`);
}

// índice à mão: cada sinal padronizado com peso 0,15 no logit, no sentido esperado
const med = [], dp = [];
for (let i = 2; i < 7; i++) { const v = R.map(r => r.x[i]); const m = v.reduce((a, b) => a + b) / v.length; med[i] = m; dp[i] = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length) || 1; }
for (const r of R) { let z = Math.log(r.pAz / (1 - r.pAz)); for (let i = 2; i < 7; i++) z += 0.15 * (r.x[i] - med[i]) / dp[i]; r.zMao = sig(z); }
console.log(`\n=== 3) Índice de zebra "à mão" (cada sinal pesa igual) — por quinto do índice ===`);
const ordZ = [...R].sort((a, b) => a.zMao - b.zMao);
for (let q = 0; q < 5; q++) {
  const g = ordZ.slice(q * ordZ.length / 5 | 0, (q + 1) * ordZ.length / 5 | 0);
  const real = g.filter(r => r.zebra).length / g.length, idx = g.reduce((s, r) => s + r.zMao, 0) / g.length, base = g.reduce((s, r) => s + r.pAz, 0) / g.length;
  console.log(`quinto ${q + 1}: índice médio ${pct(idx)} · só modelo ${pct(base)} · zebra real ${pct(real)}`);
}
const ll = (f) => R.reduce((s, r) => s - Math.log(r.zebra ? f(r) : 1 - f(r)), 0) / R.length;
console.log(`log-loss da zebra: só modelo ${ll(r => r.pAz).toFixed(4)} · índice à mão ${ll(r => r.zMao).toFixed(4)} (menor é melhor)`);

// perfis com Dixon-Coles e o índice à mão (fase 1)
console.log(`\n=== 4) Perfis (Dixon-Coles, índice à mão) ===`);
const maisProv = (m, c) => m.filter(([a, b]) => cls(a, b) === c).reduce((x, y) => y[2] > x[2] ? y : x);
function perfis(zfn, limiar, rotulo) {
  for (const perfil of ['conservador', 'moderado', 'arriscado']) {
    let ac = 0, ex = 0; const prev = { V: 0, E: 0, D: 0 }; let zb = 0, zbOk = 0, pontosDiff = 0;
    for (const r of R) {
      const p = r.p2 || r.p; const maior = p.V >= p.E && p.V >= p.D ? 'V' : p.D >= p.E ? 'D' : 'E'; let c = maior;
      if (perfil !== 'conservador') { if (Math.abs(p.V - p.D) < 0.12) c = 'E'; if (perfil === 'arriscado' && zfn(r) >= limiar) { c = r.favCasa ? 'D' : 'V'; zb++; } }
      const k = perfil === 'arriscado' ? 1.25 : 1; const m = PV.matriz(r.lc * k, r.lf * k, RHO); const s = maisProv(m, c);
      const y = cls(r.gc, r.gf); prev[c]++; if (c === y) ac++; if (s[0] === r.gc && s[1] === r.gf) ex++;
      if (perfil === 'arriscado' && zfn(r) >= limiar && c === y) zbOk++;
    }
    const n = R.length;
    console.log(`${rotulo} ${perfil.padEnd(12)} acerto ${pct(ac / n)} · exato ${pct(ex / n)} · previu V/E/D ${pct(prev.V / n)}/${pct(prev.E / n)}/${pct(prev.D / n)}${perfil === 'arriscado' ? ` · apostou em ${zb} zebras, acertou ${zbOk} (${pct(zbOk / Math.max(zb, 1))})` : ''}`);
  }
}
const real = { V: 0, E: 0, D: 0 }; R.forEach(r => real[cls(r.gc, r.gf)]++);
console.log(`real: V/E/D ${pct(real.V / R.length)}/${pct(real.E / R.length)}/${pct(real.D / R.length)} · zebras reais ${pct(R.filter(r => r.zebra).length / R.length)}`);
for (const lim of [0.30, 0.34, 0.38]) perfis(r => r.zMao, lim, `[limiar ${lim}]`);
fs.writeFileSync(__dirname + '/norm.json', JSON.stringify({ med, dp }));
