// Gera, para cada jogo de 2023–2025, o que o motor calcula usando só os jogos anteriores.
const fs = require('fs'), vm = require('vm');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname + '/../js/previsao.js', 'utf8') + ';this.P=Previsao;', ctx);
const P = ctx.P;
const dados = JSON.parse(fs.readFileSync(__dirname + '/dados.json', 'utf8'));
const out = [];
const t0 = Date.now();
for (const liga in dados) {
  const todos = dados[liga];
  for (const temp of [2023, 2024, 2025]) {
    const doAno = todos.filter(j => j.t === temp && j.st === 'fim');
    const hist = todos.filter(j => (j.t === temp - 1 || j.t === temp - 2) && j.st === 'fim');
    const temporada = todos.filter(j => j.t === temp); // inclui adiados/agendados para o descanso
    const porDia = new Map(); for (const j of doAno) { const d = j.d.slice(0, 10); if (!porDia.has(d)) porDia.set(d, []); porDia.get(d).push(j); }
    for (const [dia, js] of porDia) {
      const inicio = Date.parse(dia + 'T00:00:00Z');
      const antes = temporada.map(j => Date.parse(j.d) < inicio ? j : { ...j, st: j.st === 'fim' ? 'agendado' : j.st, gc: null, gf: null });
      const nAntes = antes.filter(j => j.st === 'fim').length;
      if (nAntes < 20) continue;
      const m = P.modelo(antes, hist, inicio);
      for (const j of js) {
        const q = { ...j, st: 'agendado' }; const pr = m.probs(q); const sn = m.sinais(q, pr);
        out.push({ id: j.id, c: j.c, f: j.f, liga, t: temp, d: j.d, gc: j.gc, gf: j.gf, lc: pr.lc, lf: pr.lf, dc: pr.dc, elo: pr.elo, x: sn.x, favCasa: sn.fav === j.c, nAntes });
      }
    }
  }
  console.log(liga, 'ok', out.length, ((Date.now() - t0) / 1000).toFixed(0) + 's');
}
fs.writeFileSync(__dirname + '/registros.json', JSON.stringify(out));
console.log('total', out.length);
