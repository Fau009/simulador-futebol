// Busca os dados na API pública da ESPN (direto do navegador) e guarda em cache local.
const Dados = (() => {
  const SITE = 'https://site.web.api.espn.com/apis/site/v2/sports/soccer'; // o host site.api.espn.com recusa pedidos de navegador
  const TABELA = 'https://site.web.api.espn.com/apis/v2/sports/soccer';
  const STATS = 'https://site.web.api.espn.com/apis/site/v2/sports/soccer';
  const VERSAO = 'sf:v1:';
  const VALIDADE = 30 * 60 * 1000; // 30 min: depois disso busca de novo sozinho

  const armazenar = {
    ler(k) { try { return JSON.parse(localStorage.getItem(VERSAO + k)); } catch { return null; } },
    gravar(k, v) {
      try { localStorage.setItem(VERSAO + k, JSON.stringify(v)); }
      catch { // cache cheio: libera os dados de outros campeonatos e tenta de novo
        try {
          Object.keys(localStorage).filter(x => x.startsWith(VERSAO + 'dados:')).forEach(x => localStorage.removeItem(x));
          localStorage.setItem(VERSAO + k, JSON.stringify(v));
        } catch { }
      }
    }
  };

  async function json(url) {
    const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }

  const estado = t => {
    if (/POSTPONED/.test(t.name)) return 'adiado';
    if (/CANCEL|ABANDON/.test(t.name)) return 'cancelado';
    if (t.state === 'post' && t.completed) return 'fim';
    if (t.state === 'in') return 'vivo';
    return 'agendado';
  };

  function normalizarJogo(e, times) {
    const c = e.competitions[0];
    const casa = c.competitors.find(x => x.homeAway === 'home'), fora = c.competitors.find(x => x.homeAway === 'away');
    for (const x of [casa, fora]) {
      const t = x.team;
      const indef = /^TBD|to be determined/i.test(t.displayName || ''); // vaga ainda sem time (ex.: final antes das semis)
      if (!times[t.id]) times[t.id] = indef ? { id: t.id, nome: 'A definir', curto: 'A definir', abrev: '?', indef: true } : { id: t.id, nome: t.displayName, curto: t.shortDisplayName || t.displayName, abrev: t.abbreviation, logo: t.logo, cor: t.color };
    }
    const st = estado(e.status.type);
    const num = v => v === undefined || v === null || v === '' ? null : Number(v);
    const detalhes = c.details || [];
    return {
      id: e.id, d: e.date, st, indef: [casa, fora].some(x => /^TBD|to be determined/i.test(x.team.displayName || '')), relogio: st === 'vivo' ? e.status.displayClock : null,
      c: casa.team.id, f: fora.team.id,
      gc: st === 'fim' || st === 'vivo' ? num(casa.score) : null,
      gf: st === 'fim' || st === 'vivo' ? num(fora.score) : null,
      pc: num(casa.shootoutScore), pf: num(fora.shootoutScore),
      fase: c.series?.title || null, faseId: e.season?.slug || null, perna: c.leg?.value || null,
      nota: c.notes?.[0]?.headline || '',
      local: c.venue?.fullName || '',
      gols: detalhes.filter(g => g.scoringPlay && !g.shootout).map(g => [g.team?.id, g.athletesInvolved?.[0]?.displayName || '?', g.clock?.displayValue || '', g.ownGoal ? 'c' : g.penaltyKick ? 'p' : '']),
      cartoes: detalhes.filter(g => g.yellowCard || g.redCard).map(g => [g.team?.id, g.athletesInvolved?.[0]?.displayName || '?', g.redCard ? 'v' : 'a'])
    };
  }

  function normalizarTabela(j, times) {
    return (j.children || []).map(g => ({
      nome: (g.name || '').replace(/^Group /, 'Grupo '),
      linhas: (g.standings?.entries || []).map(en => {
        const t = en.team; const s = {}; for (const x of en.stats || []) s[x.name] = x.value;
        if (!times[t.id]) times[t.id] = { id: t.id, nome: t.displayName, curto: t.shortDisplayName || t.displayName, abrev: t.abbreviation, logo: t.logos?.[0]?.href };
        else if (!times[t.id].logo) times[t.id].logo = t.logos?.[0]?.href;
        return { id: t.id, j: s.gamesPlayed || 0, v: s.wins || 0, e: s.ties || 0, d: s.losses || 0, gp: s.pointsFor || 0, gc: s.pointsAgainst || 0, pts: s.points || 0, pos: s.rank || 0, ded: s.deductions || 0 };
      })
    })).filter(g => g.linhas.length);
  }

  function normalizarLideres(j) {
    const pega = nome => ((j.stats || []).find(s => s.name === nome)?.leaders || []).slice(0, 25).map(l => ({
      nome: l.athlete?.displayName, time: l.athlete?.team?.id || null, timeNome: l.athlete?.team?.displayName || '',
      valor: l.value, jogos: Number((l.displayValue || '').match(/Matches:\s*(\d+)/)?.[1]) || null
    }));
    return { gols: pega('goalsLeaders'), assist: pega('assistsLeaders') };
  }

  async function buscar(comp) {
    const times = {};
    const agora = new Date(); const ano = agora.getFullYear();
    let temporada = null, tabela = [], nomeTemporada = '';

    if (comp.tipo === 'liga') {
      const t = await json(`${TABELA}/${comp.id}/standings`);
      temporada = t.seasons?.[0]?.year ?? ano;
      tabela = normalizarTabela(t, times);
    }

    const anos = comp.tipo === 'liga'
      ? (comp.calendario === 'europeu' ? [temporada, temporada + 1] : [temporada])
      : (comp.calendario === 'europeu' ? [ano - 1, ano, ano + 1] : [ano - 1, ano]);
    const lotes = await Promise.all(anos.map(a => json(`${SITE}/${comp.id}/scoreboard?dates=${a}&limit=1000`).catch(() => ({ events: [] }))));
    const eventos = lotes.flatMap(l => l.events || []);
    if (temporada == null) { const anosEv = eventos.map(e => e.season?.year).filter(Boolean); temporada = anosEv.length ? Math.max(...anosEv) : ano; } // copa: última edição com jogos
    const vistos = new Set();
    const jogos = eventos.filter(e => e.season?.year === temporada && !vistos.has(e.id) && vistos.add(e.id))
      .map(e => normalizarJogo(e, times)).sort((a, b) => a.d.localeCompare(b.d));
    // Jogo adiado e remarcado: a ESPN mantém o evento antigo ("adiado") e cria outro com a nova data.
    // Descarta o adiado quando existe outro jogo com o mesmo mandante e visitante.
    const pares = new Map();
    for (const j of jogos) if (j.st !== 'adiado') pares.set(j.c + '|' + j.f, (pares.get(j.c + '|' + j.f) || 0) + 1);
    const semDuplicados = jogos.filter(j => j.st !== 'adiado' || !pares.get(j.c + '|' + j.f));
    nomeTemporada = comp.calendario === 'europeu' ? `${temporada}-${String(temporada + 1).slice(2)}` : String(temporada);

    let lideres = null;
    if (comp.tipo === 'liga') {
      try { lideres = normalizarLideres(await json(`${STATS}/${comp.id}/statistics`)); } catch { lideres = null; }
    }
    return { temporada, nomeTemporada, times, tabela, jogos: semDuplicados, lideres };
  }

  // devolve do cache se ainda válido; forcar=true ignora o cache
  async function carregar(comp, forcar = false) {
    const k = 'dados-v2:' + comp.id; // v2: sem os jogos adiados duplicados
    const c = armazenar.ler(k);
    if (!forcar && c && Date.now() - c.em < VALIDADE) return { ...c.dados, em: c.em, doCache: true };
    try {
      const dados = await buscar(comp);
      armazenar.gravar(k, { em: Date.now(), dados });
      return { ...dados, em: Date.now(), doCache: false };
    } catch (e) {
      if (c) return { ...c.dados, em: c.em, doCache: true, erro: e.message }; // sem internet: usa o último cache
      throw e;
    }
  }

  return { carregar, armazenar };
})();
