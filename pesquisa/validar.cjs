// valida o previsao.js real como no navegador: temporada atual + N temporadas anteriores
const fs = require('fs'), vm = require('vm');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname + '/../js/previsao.js', 'utf8') + ';this.P=Previsao;', ctx);
const P = ctx.P; const dados = JSON.parse(fs.readFileSync(__dirname + '/dados.json', 'utf8'));
const cls = (a, b) => a > b ? 'V' : a === b ? 'E' : 'D', pct = x => (x * 100).toFixed(1) + '%';
function rodar(nHist, pesoElo) {
  P.CFG.elo.peso = pesoElo;
  let n = 0, ll = 0; const ac = { conservador: 0, moderado: 0, arriscado: 0 };
  for (const liga in dados) {
    const todos = dados[liga]; const temp = 2025;
    const hist = todos.filter(j => j.t < temp && j.t >= temp - nHist && j.st === 'fim');
    const temporada = todos.filter(j => j.t === temp);
    const porDia = new Map(); for (const j of temporada.filter(j => j.st === 'fim')) { const d = j.d.slice(0, 10); (porDia.get(d) || porDia.set(d, []).get(d)).push(j); }
    for (const [dia, js] of porDia) {
      const inicio = Date.parse(dia + 'T00:00:00Z');
      const antes = temporada.map(j => Date.parse(j.d) < inicio ? j : { ...j, st: j.st === 'fim' ? 'agendado' : j.st, gc: null, gf: null });
      if (antes.filter(j => j.st === 'fim').length < 20) continue;
      const m = P.modelo(antes, hist, inicio);
      for (const j of js) {
        const q = { ...j, st: 'agendado', gc: null, gf: null }; const y = cls(j.gc, j.gf);
        const pr = m.probs(q); n++; ll -= Math.log(({ V: pr.pV, E: pr.pE, D: pr.pD })[y]);
        for (const pf in ac) { const r = P.prever(q, m, pf); if (r.resultado === y) ac[pf]++; }
      }
    }
  }
  console.log(`hist ${nHist} temp · peso Elo ${pesoElo}: ${n} jogos · log-loss ${(ll / n).toFixed(4)} · acerto conservador ${pct(ac.conservador / n)} moderado ${pct(ac.moderado / n)} arriscado ${pct(ac.arriscado / n)}`);
}
rodar(2, 0); rodar(2, 0.8); rodar(3, 0.8); rodar(4, 0.8);
