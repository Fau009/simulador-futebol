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

  // Modelo de gols esperados (parâmetros escolhidos por teste retroativo em 1.674 jogos de 2025: BR, ING, ESP, ITA, ALE):
  // - usa a temporada atual e as 2 anteriores; jogos recentes pesam mais (meia-vida de 120 dias);
  // - separa desempenho em casa e fora (gols marcados e sofridos em cada situação) e compara com a média da liga;
  // - com poucos jogos, puxa para a média (equivale a K jogos "médios" somados a cada time);
  // - confronto direto: nos últimos 6 jogos entre os dois, compara gols reais com os esperados e ajusta
  //   de forma moderada (o mesmo mando pesa o dobro). Peso forte piorou as previsões no teste.
  const MEIA_VIDA = 120, K = 5, H2H_JOGOS = 6, H2H_K = 6, H2H_OUTRO_MANDO = 0.5;
  function modelo(jogos, hist = []) {
    const atuais = jogos.filter(j => j.st === 'fim');
    const base = [...hist, ...atuais].sort((a, b) => a.d.localeCompare(b.d));
    const agora = Math.max(Date.now(), atuais.length ? Date.parse(atuais.at(-1).d) : 0);
    let gC = 0, gF = 0, pT = 0;
    const s = {}; const T = id => (s[id] ||= { casa: { gp: 0, gc: 0, n: 0 }, fora: { gp: 0, gc: 0, n: 0 } });
    const confrontos = new Map(); const chave = (a, b) => a < b ? a + '|' + b : b + '|' + a;
    for (const j of base) {
      const k = chave(j.c, j.f); if (!confrontos.has(k)) confrontos.set(k, []); confrontos.get(k).push(j);
      const w = Math.pow(0.5, (agora - Date.parse(j.d)) / 864e5 / MEIA_VIDA); if (w < 0.005) continue;
      gC += j.gc * w; gF += j.gf * w; pT += w;
      const c = T(j.c).casa, f = T(j.f).fora;
      c.gp += j.gc * w; c.gc += j.gf * w; c.n += w;
      f.gp += j.gf * w; f.gc += j.gc * w; f.n += w;
    }
    const mCasa = pT ? gC / pT : 1.45, mFora = pT ? gF / pT : 1.15; // gols por jogo de mandantes e visitantes na liga
    const t = {};
    for (const id in s) {
      const { casa, fora } = s[id];
      t[id] = {
        atCasa: (casa.gp + K * mCasa) / (casa.n + K) / mCasa, dfCasa: (casa.gc + K * mFora) / (casa.n + K) / mFora,
        atFora: (fora.gp + K * mFora) / (fora.n + K) / mFora, dfFora: (fora.gc + K * mCasa) / (fora.n + K) / mCasa,
        casa, fora // somas ponderadas (para a explicação)
      };
    }
    const neutro = { atCasa: 1, dfCasa: 1, atFora: 1, dfFora: 1 };
    // gols esperados sem o confronto direto: média da liga naquela condição × ataque de quem joga × defesa do adversário
    const baseLambdas = (c, f) => { const a = t[c] || neutro, b = t[f] || neutro; return [mCasa * a.atCasa * b.dfFora, mFora * b.atFora * a.dfCasa]; };
    const confronto = (c, f) => (confrontos.get(chave(c, f)) || []).slice(-H2H_JOGOS);
    function fatorH2H(c, f) {
      let realC = 0, espC = 0, realF = 0, espF = 0, n = 0;
      for (const j of confronto(c, f)) {
        const mesmo = j.c === c, w = mesmo ? 1 : H2H_OUTRO_MANDO;
        const [lc, lf] = mesmo ? baseLambdas(c, f) : baseLambdas(f, c);
        if (mesmo) { realC += j.gc * w; espC += lc * w; realF += j.gf * w; espF += lf * w; }
        else { realC += j.gf * w; espC += lf * w; realF += j.gc * w; espF += lc * w; }
        n += w;
      }
      if (!n) return [1, 1];
      return [(realC + H2H_K * espC / n) / (espC + H2H_K * espC / n), (realF + H2H_K * espF / n) / (espF + H2H_K * espF / n)];
    }
    return {
      mCasa, mFora, jogos: atuais.length, historico: hist.length, confronto,
      lambdas(j) {
        const [lc, lf] = baseLambdas(j.c, j.f), [fc, ff] = fatorH2H(j.c, j.f);
        return [Math.min(5, Math.max(0.15, lc * fc)), Math.min(5, Math.max(0.15, lf * ff))];
      },
      semConfronto(j) { return baseLambdas(j.c, j.f); },
      // números usados em cada etapa, para mostrar o cálculo
      explicar(j) {
        const a = t[j.c] || neutro, b = t[j.f] || neutro;
        const [lc0, lf0] = baseLambdas(j.c, j.f), [fc, ff] = fatorH2H(j.c, j.f);
        return { mCasa, mFora, K, meiaVida: MEIA_VIDA, casa: a, fora: b, lc0, lf0, fc, ff, confronto: confronto(j.c, j.f) };
      }
    };
  }
  function sortearPlacar(j, m) { const [lc, lf] = m.lambdas(j); return [poisson(lc), poisson(lf)]; }

  // Previsão sem sorte: chances de vitória/empate/derrota pela distribuição de Poisson.
  // Jogo equilibrado (vitória e derrota com menos de 12 pontos de diferença) vira empate; senão, o resultado
  // mais provável. Dentro do resultado, o placar mais provável. Sem a regra do empate quase nunca se prevê
  // empate (e a tabela fica irreal); com ela a distribuição fica próxima da real.
  const fat = [1, 1, 2, 6, 24, 120, 720, 5040, 40320];
  const pPois = (k, l) => Math.exp(-l) * Math.pow(l, k) / fat[k];
  const EQUILIBRIO = 0.12;
  function prever(j, m) {
    const [lc, lf] = m.lambdas(j); const N = 8;
    let pV = 0, pE = 0, pD = 0; const melhor = { V: [0, null], E: [0, null], D: [0, null] };
    for (let a = 0; a <= N; a++) for (let b = 0; b <= N; b++) {
      const p = pPois(a, lc) * pPois(b, lf); const r = a > b ? 'V' : a === b ? 'E' : 'D';
      if (r === 'V') pV += p; else if (r === 'E') pE += p; else pD += p;
      if (p > melhor[r][0]) melhor[r] = [p, [a, b]];
    }
    const tot = pV + pE + pD; pV /= tot; pE /= tot; pD /= tot;
    const r = Math.abs(pV - pD) < EQUILIBRIO ? 'E' : pV >= pE && pV >= pD ? 'V' : pD >= pE ? 'D' : 'E';
    // placares mais prováveis (para a explicação)
    const top = [];
    for (let a = 0; a <= 5; a++) for (let b = 0; b <= 5; b++) top.push([a, b, pPois(a, lc) * pPois(b, lf) / tot]);
    top.sort((x, y) => y[2] - x[2]);
    return { placar: melhor[r][1], pV, pE, pD, lc, lf, resultado: r, equilibrado: Math.abs(pV - pD) < EQUILIBRIO, equilibrio: EQUILIBRIO, top: top.slice(0, 6) };
  }

  function chances(grupo, jogos, sim, criterios, zonas, n = 3000, m = null) {
    const fz = m || modelo(jogos);
    const ids = grupo.linhas.map(l => l.id);
    const pendentes = jogos.filter(j => j.st !== 'fim' && j.st !== 'cancelado' && !sim[j.id] && ids.includes(j.c) && ids.includes(j.f));
    const cont = {}; for (const id of ids) cont[id] = { pos: new Array(ids.length).fill(0) };
    const base = tabela(grupo, jogos, sim, criterios, {});
    const lambdas = pendentes.map(j => fz.lambdas(j)); // calculados uma vez; só o sorteio muda a cada rodada
    for (let r = 0; r < n; r++) {
      const ls = base.map(l => ({ ...l })); const por = new Map(ls.map(l => [l.id, l]));
      for (let i = 0; i < pendentes.length; i++) { const j = pendentes[i], [lc, lf] = lambdas[i]; const a = poisson(lc), b = poisson(lf); somar(por.get(j.c), a, b); somar(por.get(j.f), b, a); }
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

  return { placar, tabela, forma, artilharia, destaques, chaves, modelo, sortearPlacar, prever, chances };
})();
