// Cálculos: tabela com simulação, forma, artilharia, destaques, mata-mata e chances (Monte Carlo).
const Calculo = (() => {
  const pontosDe = (a, b) => a > b ? 3 : a === b ? 1 : 0;

  // placar efetivo de um jogo: o simulado (se houver) ou o oficial
  function placar(j, sim) {
    const s = sim[j.id];
    if (s) return { gc: s[0], gf: s[1], pen: s[2] || null, simulado: true };
    if (j.st === 'fim') return { gc: j.gc, gf: j.gf, pen: j.pc != null ? (j.pc > j.pf ? 'c' : 'f') : null, simulado: false };
    return null;
  }

  function somar(l, gp, gc, sinal = 1) {
    l.j += sinal; l.gp += gp * sinal; l.gc += gc * sinal;
    const r = gp > gc ? 'v' : gp === gc ? 'e' : 'd';
    l[r] += sinal; l.pts += pontosDe(gp, gc) * sinal;
  }

  const CRIT = {
    pontos: l => l.pts, vitorias: l => l.v, saldo: l => l.gp - l.gc, gp: l => l.gp
  };
  function ordenar(linhas, criterios) {
    return linhas.sort((a, b) => {
      for (const c of criterios) { const d = CRIT[c](b) - CRIT[c](a); if (d) return d; }
      return a.nomeOrd?.localeCompare?.(b.nomeOrd || '') || 0;
    });
  }

  // Tabela oficial + diferença dos jogos simulados (resultado novo − resultado oficial, quando havia)
  function tabela(grupo, jogos, sim, criterios, times) {
    const linhas = grupo.linhas.map(l => ({ ...l, oficialPos: l.pos, nomeOrd: times[l.id]?.nome || '' }));
    const por = new Map(linhas.map(l => [l.id, l]));
    for (const j of jogos) {
      const s = sim[j.id]; if (!s) continue;
      const a = por.get(j.c), b = por.get(j.f); if (!a || !b) continue;
      if (j.st === 'fim') { somar(a, j.gc, j.gf, -1); somar(b, j.gf, j.gc, -1); }
      somar(a, s[0], s[1]); somar(b, s[1], s[0]);
    }
    const temSim = Object.keys(sim).length > 0;
    // sem simulação mantém a ordem oficial (que já aplica todos os critérios da liga)
    if (temSim) ordenar(linhas, criterios); else linhas.sort((a, b) => a.pos - b.pos);
    linhas.forEach((l, i) => { l.pos = i + 1; l.mudou = temSim ? l.oficialPos - l.pos : 0; });
    return linhas;
  }

  // últimos 5 resultados de cada time (considerando a simulação)
  function forma(jogos, sim) {
    const f = {};
    for (const j of jogos) {
      const p = placar(j, sim); if (!p) continue;
      (f[j.c] ||= []).push(p.gc > p.gf ? 'V' : p.gc === p.gf ? 'E' : 'D');
      (f[j.f] ||= []).push(p.gf > p.gc ? 'V' : p.gc === p.gf ? 'E' : 'D');
    }
    for (const k in f) f[k] = f[k].slice(-5);
    return f;
  }

  // artilharia calculada a partir dos gols registrados nos jogos (usada nas copas)
  function artilharia(jogos) {
    const g = new Map();
    for (const j of jogos) for (const [time, nome, , tipo] of j.gols) {
      if (tipo === 'c') continue;
      const k = time + '|' + nome; const x = g.get(k) || { nome, time, valor: 0, pen: 0 };
      x.valor++; if (tipo === 'p') x.pen++; g.set(k, x);
    }
    return [...g.values()].sort((a, b) => b.valor - a.valor || a.nome.localeCompare(b.nome)).slice(0, 25);
  }

  function destaques(jogos, times) {
    const fim = jogos.filter(j => j.st === 'fim');
    if (!fim.length) return null;
    const t = {}; const T = id => (t[id] ||= { id, j: 0, gp: 0, gc: 0, v: 0, e: 0, d: 0, casa: [0, 0], fora: [0, 0], semPerder: 0, maxSemPerder: 0, semVencer: 0, am: 0, vm: 0 });
    let gols = 0, maior = null, vitCasa = 0, emp = 0, vitFora = 0;
    for (const j of fim) {
      const a = T(j.c), b = T(j.f); gols += j.gc + j.gf;
      for (const [x, gp, gc, lado] of [[a, j.gc, j.gf, 'casa'], [b, j.gf, j.gc, 'fora']]) {
        x.j++; x.gp += gp; x.gc += gc; x[lado][0] += pontosDe(gp, gc); x[lado][1] += 3;
        if (gp > gc) { x.v++; x.semPerder++; x.semVencer = 0; } else if (gp === gc) { x.e++; x.semPerder++; x.semVencer++; } else { x.d++; x.semPerder = 0; x.semVencer++; }
        x.maxSemPerder = Math.max(x.maxSemPerder, x.semPerder);
      }
      if (j.gc > j.gf) vitCasa++; else if (j.gc === j.gf) emp++; else vitFora++;
      const dif = Math.abs(j.gc - j.gf);
      if (!maior || dif > maior.dif || (dif === maior.dif && j.gc + j.gf > maior.soma)) maior = { j, dif, soma: j.gc + j.gf };
      for (const [time, , cor] of j.cartoes) { const x = T(time); if (cor === 'a') x.am++; else x.vm++; }
    }
    const lista = Object.values(t).filter(x => times[x.id]);
    const top = (f, desc = true) => [...lista].sort((a, b) => desc ? f(b) - f(a) : f(a) - f(b))[0];
    const aprov = x => x[1] ? x[0] / x[1] : 0;
    return {
      jogos: fim.length, gols, media: gols / fim.length, vitCasa, emp, vitFora,
      ataque: top(x => x.gp), defesa: top(x => x.gc, false), vitorias: top(x => x.v),
      invicto: top(x => x.semPerder), maiorInvencibilidade: top(x => x.maxSemPerder),
      mandante: top(x => aprov(x.casa)), visitante: top(x => aprov(x.fora)),
      jejum: top(x => x.semVencer), cartoes: top(x => x.am + x.vm * 3), vermelhos: top(x => x.vm),
      maiorGoleada: maior?.j || null
    };
  }

  // Mata-mata: agrupa os jogos por fase e junta ida e volta do mesmo confronto
  function chaves(jogos, sim) {
    const fases = new Map();
    for (const j of jogos) {
      const nomeFase = j.faseId || j.fase || 'Jogos';
      if (!fases.has(nomeFase)) fases.set(nomeFase, { nome: nomeFase, primeiro: j.d, confrontos: new Map() });
      const f = fases.get(nomeFase);
      const k = [j.c, j.f].sort().join('|');
      if (!f.confrontos.has(k)) f.confrontos.set(k, { times: [j.c, j.f], jogos: [] });
      f.confrontos.get(k).jogos.push(j);
    }
    return [...fases.values()].sort((a, b) => a.primeiro.localeCompare(b.primeiro)).map(f => ({
      nome: f.nome,
      confrontos: [...f.confrontos.values()].map(c => {
        const [x, y] = c.times; let ax = 0, ay = 0, completo = true, pen = null, algumSim = false;
        c.jogos.sort((a, b) => a.d.localeCompare(b.d));
        for (const j of c.jogos) {
          const p = placar(j, sim);
          if (!p) { completo = false; continue; }
          if (p.simulado) algumSim = true;
          if (j.c === x) { ax += p.gc; ay += p.gf; } else { ax += p.gf; ay += p.gc; }
          if (p.pen) pen = p.pen === 'c' ? j.c : j.f;
        }
        let vencedor = null;
        if (completo) vencedor = ax > ay ? x : ay > ax ? y : pen;
        return { ...c, agregado: [ax, ay], completo, vencedor, algumSim, empatado: completo && ax === ay };
      })
    }));
  }

  // ---------- chances (Monte Carlo com gols de Poisson) ----------
  function poisson(l) { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= Math.random(); } while (p > L); return k - 1; }

  // força de ataque/defesa por time a partir dos jogos oficiais, puxada para a média no começo da temporada
  function forcas(jogos) {
    const fim = jogos.filter(j => j.st === 'fim');
    const s = {}; let gols = 0;
    for (const j of fim) {
      (s[j.c] ||= { gp: 0, gc: 0, n: 0 }); (s[j.f] ||= { gp: 0, gc: 0, n: 0 });
      s[j.c].gp += j.gc; s[j.c].gc += j.gf; s[j.c].n++; s[j.f].gp += j.gf; s[j.f].gc += j.gc; s[j.f].n++;
      gols += j.gc + j.gf;
    }
    const media = fim.length ? gols / fim.length / 2 : 1.3; const K = 4;
    const f = {};
    for (const id in s) f[id] = { at: (s[id].gp + K * media) / (s[id].n + K) / media, df: (s[id].gc + K * media) / (s[id].n + K) / media };
    return { f, media };
  }
  function sortearPlacar(j, fz) {
    const a = fz.f[j.c] || { at: 1, df: 1 }, b = fz.f[j.f] || { at: 1, df: 1 };
    const lc = Math.min(4, Math.max(0.2, fz.media * a.at * b.df * 1.12)), lf = Math.min(4, Math.max(0.2, fz.media * b.at * a.df * 0.9));
    return [poisson(lc), poisson(lf)];
  }

  function chances(grupo, jogos, sim, criterios, zonas, n = 3000) {
    const fz = forcas(jogos);
    const ids = grupo.linhas.map(l => l.id);
    const pendentes = jogos.filter(j => j.st !== 'fim' && j.st !== 'cancelado' && !sim[j.id] && ids.includes(j.c) && ids.includes(j.f));
    const cont = {}; for (const id of ids) cont[id] = { pos: new Array(ids.length).fill(0) };
    const base = tabela(grupo, jogos, sim, criterios, {});
    for (let r = 0; r < n; r++) {
      const ls = base.map(l => ({ ...l })); const por = new Map(ls.map(l => [l.id, l]));
      for (const j of pendentes) { const [a, b] = sortearPlacar(j, fz); somar(por.get(j.c), a, b); somar(por.get(j.f), b, a); }
      ordenar(ls, criterios);
      ls.forEach((l, i) => cont[l.id].pos[i]++);
    }
    const res = {};
    for (const id of ids) {
      const p = cont[id].pos.map(x => x / n);
      res[id] = { titulo: p[0], zonas: Object.fromEntries(zonas.map(z => [z.id + z.de, p.slice(z.de - 1, z.ate).reduce((a, b) => a + b, 0)])) };
    }
    return { res, pendentes: pendentes.length, n };
  }

  return { placar, tabela, forma, artilharia, destaques, chaves, forcas, sortearPlacar, chances };
})();
