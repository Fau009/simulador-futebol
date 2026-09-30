const fs = require('fs');
(async () => {
  const out = {};
  for (const liga of ['bra.1', 'eng.1', 'esp.1', 'ita.1', 'ger.1', 'por.1', 'bra.2', 'eng.2']) {
    const jogos = []; const vistos = new Set();
    for (const a of [2021, 2022, 2023, 2024, 2025, 2026, 2027]) {
      let ev = [];
      for (let t = 0; t < 3; t++) { try { const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${liga}/scoreboard?dates=${a}&limit=1000`); ev = (await r.json()).events || []; break; } catch { await new Promise(r => setTimeout(r, 2000)); } }
      for (const e of ev) {
        if (vistos.has(e.id)) continue; vistos.add(e.id);
        const c = e.competitions[0]; const h = c.competitors.find(x => x.homeAway === 'home'), f = c.competitors.find(x => x.homeAway === 'away');
        const st = e.status.type; const fim = st.state === 'post' && st.completed;
        jogos.push({ id: e.id, d: e.date, t: e.season?.year, c: h.team.id, f: f.team.id, st: fim ? 'fim' : /POSTPONED/.test(st.name) ? 'adiado' : 'agendado', gc: fim ? +h.score : null, gf: fim ? +f.score : null });
      }
    }
    jogos.sort((a, b) => a.d.localeCompare(b.d));
    out[liga] = jogos;
    const porT = {}; jogos.forEach(j => porT[j.t] = (porT[j.t] || 0) + (j.st === 'fim'));
    console.log(liga, JSON.stringify(porT));
  }
  fs.writeFileSync('dados.json', JSON.stringify(out));
})();
