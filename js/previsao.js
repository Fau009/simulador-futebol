// Motor de previsão: gols esperados (Poisson com correção Dixon-Coles) + rating Elo, combinados;
// índice de zebra aprendido por regressão logística; perfis conservador / moderado / arriscado.
// Os parâmetros em CFG foram escolhidos por teste retroativo (ver README e pesquisa/).
const Previsao = (() => {
  const CFG = {
    meiaVida: 120, K: 5,                       // peso por tempo e "jogos médios" somados a cada time
    h2hJogos: 6, h2hK: 6, h2hOutro: 0.5,        // confronto direto
    rho: -0.06,                                 // Dixon-Coles: corrige 0×0, 1×0, 0×1 e 1×1
    elo: { K: 10, casa: 60, regressao: 0.1, peso: 0.8, empA: 0.32, empB: 0.4 }, // peso 0,8 do Elo no conjunto
    equilibrio: 0.12,                           // perfil moderado: empate quando V e D estão a menos disso
    zebra: { b: [0.120, 1.102, -0.027, 0.005, 0.014, -0.089, 0.010], limiar: 0.33 }, // regressão logística: treino 2023–24, teste 2025
    arriscadoAbertura: 1.25                     // perfil arriscado: jogo mais "aberto" na escolha do placar
  };
  const NOMES_SINAIS = ['base', 'Chance do azarão pelo modelo', 'Jogo com muitos gols esperados', 'Times imprevisíveis', 'Forma recente (azarão × favorito)', 'Descanso (azarão × favorito)', 'Confronto direto favorece o azarão'];

  const fat = [1, 1, 2, 6, 24, 120, 720, 5040, 40320];
  const pPois = (k, l) => Math.exp(-l) * Math.pow(l, k) / fat[k];
  const N = 8;
  const logit = p => Math.log(p / (1 - p)), sig = x => 1 / (1 + Math.exp(-x));
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  // matriz de placares 0..8 × 0..8 com a correção de Dixon-Coles nos placares baixos
  function matriz(lc, lf, rho = CFG.rho) {
    const m = []; let s = 0;
    for (let a = 0; a <= N; a++) for (let b = 0; b <= N; b++) {
      let tau = 1;
      if (a === 0 && b === 0) tau = 1 - lc * lf * rho; else if (a === 0 && b === 1) tau = 1 + lc * rho;
      else if (a === 1 && b === 0) tau = 1 + lf * rho; else if (a === 1 && b === 1) tau = 1 - rho;
      const p = Math.max(0, pPois(a, lc) * pPois(b, lf) * tau); m.push([a, b, p]); s += p;
    }
    for (const x of m) x[2] /= s;
    return m;
  }
  const classe = (a, b) => a > b ? 'V' : a === b ? 'E' : 'D';
  function somaClasses(m) { const r = { V: 0, E: 0, D: 0 }; for (const [a, b, p] of m) r[classe(a, b)] += p; return r; }
  const maisProvavel = (m, r) => m.filter(([a, b]) => classe(a, b) === r).reduce((x, y) => y[2] > x[2] ? y : x);

  function modelo(jogos, hist = [], agora = Date.now()) {
    const atuais = jogos.filter(j => j.st === 'fim');
    const base = [...hist, ...atuais].sort((a, b) => a.d.localeCompare(b.d));
    agora = Math.max(agora, atuais.length ? Date.parse(atuais.at(-1).d) : 0);
    const { meiaVida, K } = CFG;

    // --- força em casa/fora com peso por tempo
    let gC = 0, gF = 0, pT = 0;
    const s = {}; const T = id => (s[id] ||= { casa: { gp: 0, gc: 0, n: 0 }, fora: { gp: 0, gc: 0, n: 0 } });
    const confrontos = new Map(); const chave = (a, b) => a < b ? a + '|' + b : b + '|' + a;
    const ultimos = {}; // resultados recentes por time (para forma e imprevisibilidade)
    for (const j of base) {
      const k = chave(j.c, j.f); if (!confrontos.has(k)) confrontos.set(k, []); confrontos.get(k).push(j);
      (ultimos[j.c] ||= []).push(j); (ultimos[j.f] ||= []).push(j);
      const w = Math.pow(0.5, (agora - Date.parse(j.d)) / 864e5 / meiaVida); if (w < 0.005) continue;
      gC += j.gc * w; gF += j.gf * w; pT += w;
      const c = T(j.c).casa, f = T(j.f).fora;
      c.gp += j.gc * w; c.gc += j.gf * w; c.n += w; f.gp += j.gf * w; f.gc += j.gc * w; f.n += w;
    }
    const mCasa = pT ? gC / pT : 1.45, mFora = pT ? gF / pT : 1.15;
    const t = {};
    for (const id in s) {
      const { casa, fora } = s[id];
      t[id] = {
        atCasa: (casa.gp + K * mCasa) / (casa.n + K) / mCasa, dfCasa: (casa.gc + K * mFora) / (casa.n + K) / mFora,
        atFora: (fora.gp + K * mFora) / (fora.n + K) / mFora, dfFora: (fora.gc + K * mCasa) / (fora.n + K) / mCasa, casa, fora
      };
    }
    const neutro = { atCasa: 1, dfCasa: 1, atFora: 1, dfFora: 1 };
    const baseLambdas = (c, f) => { const a = t[c] || neutro, b = t[f] || neutro; return [mCasa * a.atCasa * b.dfFora, mFora * b.atFora * a.dfCasa]; };
    const confronto = (c, f) => (confrontos.get(chave(c, f)) || []).slice(-CFG.h2hJogos);
    function fatorH2H(c, f) {
      let realC = 0, espC = 0, realF = 0, espF = 0, n = 0;
      for (const j of confronto(c, f)) {
        const mesmo = j.c === c, w = mesmo ? 1 : CFG.h2hOutro;
        const [lc, lf] = mesmo ? baseLambdas(c, f) : baseLambdas(f, c);
        if (mesmo) { realC += j.gc * w; espC += lc * w; realF += j.gf * w; espF += lf * w; }
        else { realC += j.gf * w; espC += lf * w; realF += j.gc * w; espF += lc * w; }
        n += w;
      }
      if (!n) return [1, 1];
      const k = CFG.h2hK;
      return [(realC + k * espC / n) / (espC + k * espC / n), (realF + k * espF / n) / (espF + k * espF / n)];
    }
    const lambdas = j => {
      const [lc, lf] = baseLambdas(j.c, j.f), [fc, ff] = fatorH2H(j.c, j.f);
      return [clamp(lc * fc, 0.15, 5), clamp(lf * ff, 0.15, 5)];
    };

    // --- Elo: percorre todos os jogos em ordem; entre temporadas (pausa > 45 dias) puxa todos para a média
    const elo = {}; let ultimaData = null;
    const E = id => (elo[id] ??= 1500);
    for (const j of base) {
      const dt = Date.parse(j.d);
      if (ultimaData && dt - ultimaData > 45 * 864e5) for (const id in elo) elo[id] = 1500 + (elo[id] - 1500) * (1 - CFG.elo.regressao);
      ultimaData = dt;
      const d = E(j.c) + CFG.elo.casa - E(j.f); const esp = 1 / (1 + Math.pow(10, -d / 400));
      const res = j.gc > j.gf ? 1 : j.gc === j.gf ? 0.5 : 0;
      const margem = Math.log(Math.abs(j.gc - j.gf) + 1) + 1; // vitórias largas mexem mais
      const delta = CFG.elo.K * margem * (res - esp);
      elo[j.c] += delta; elo[j.f] -= delta;
    }
    function probsElo(j) {
      const d = E(j.c) + CFG.elo.casa - E(j.f); const e = 1 / (1 + Math.pow(10, -d / 400));
      const pE = clamp(CFG.elo.empA - CFG.elo.empB * Math.abs(e - 0.5), 0.08, 0.4);
      const pV = clamp(e - pE / 2, 0.02, 0.96), pD = clamp(1 - e - pE / 2, 0.02, 0.96); const s2 = pV + pE + pD;
      return { V: pV / s2, E: pE / s2, D: pD / s2, d };
    }

    // --- combinação: Dixon-Coles (peso 1−w) + Elo (peso w); a matriz de placares é reescalada por classe
    const cache = new Map();
    function probs(j) {
      const k = j.c + '|' + j.f; if (cache.has(k)) return cache.get(k);
      const [lc, lf] = lambdas(j); const m = matriz(lc, lf); const dc = somaClasses(m); const el = probsElo(j); const w = CFG.elo.peso;
      const P = { V: (1 - w) * dc.V + w * el.V, E: (1 - w) * dc.E + w * el.E, D: (1 - w) * dc.D + w * el.D };
      const mat = m.map(([a, b, p]) => { const c = classe(a, b); return [a, b, dc[c] > 0 ? p * P[c] / dc[c] : 0]; });
      const r = { pV: P.V, pE: P.E, pD: P.D, lc, lf, mat, dc, elo: el };
      cache.set(k, r); return r;
    }

    // --- sinais de zebra (do ponto de vista do azarão)
    const datas = {}; // todas as datas de jogo de cada time (inclui agendados, para o descanso)
    for (const j of [...hist, ...jogos]) { if (j.st === 'cancelado') continue; (datas[j.c] ||= []).push(Date.parse(j.d)); (datas[j.f] ||= []).push(Date.parse(j.d)); }
    for (const id in datas) datas[id].sort((a, b) => a - b);
    const descanso = (id, dt) => { const ds = datas[id] || []; let ant = null; for (const x of ds) { if (x < dt - 36e5) ant = x; else break; } return ant ? (dt - ant) / 864e5 : 7; };
    const pts = (j, id) => { const gm = j.c === id ? j.gc : j.gf, gs = j.c === id ? j.gf : j.gc; return gm > gs ? 3 : gm === gs ? 1 : 0; };
    const ppg = (id, n, antes) => { const l = (ultimos[id] || []).filter(x => Date.parse(x.d) < antes).slice(-n); return l.length ? l.reduce((s2, x) => s2 + pts(x, id), 0) / l.length : 1.35; };
    const imprevCache = {};
    function imprev(id) { // média de |pontos reais − pontos esperados| nos últimos 10 jogos (só Dixon-Coles, com a força atual)
      if (imprevCache[id] != null) return imprevCache[id];
      const l = (ultimos[id] || []).slice(-10); if (!l.length) return (imprevCache[id] = 1.1);
      let s2 = 0;
      for (const x of l) { const d = somaClasses(matriz(...lambdas(x))); const xp = x.c === id ? 3 * d.V + d.E : 3 * d.D + d.E; s2 += Math.abs(pts(x, id) - xp); }
      return (imprevCache[id] = s2 / l.length);
    }
    function sinais(j, P = probs(j)) {
      const fav = P.pV >= P.pD ? j.c : j.f, az = fav === j.c ? j.f : j.c;
      const pAz = Math.min(P.pV, P.pD), dt = Date.parse(j.d);
      const h = confronto(j.c, j.f); let fr = 0;
      if (h.length) { for (const x of h) fr += pts(x, az) - pts(x, fav); fr = fr / h.length / 3; }
      return {
        fav, az, pAz,
        x: [1, logit(clamp(pAz, 0.01, 0.99)), P.lc + P.lf - 2.6, (imprev(az) + imprev(fav)) / 2 - 1.1,
          (ppg(az, 5, dt) - ppg(az, 20, dt)) - (ppg(fav, 5, dt) - ppg(fav, 20, dt)),
          (clamp(descanso(az, dt), 2, 10) - clamp(descanso(fav, dt), 2, 10)) / 4, fr],
        brutos: { descansoAz: descanso(az, dt), descansoFav: descanso(fav, dt), formaAz: ppg(az, 5, dt), formaFav: ppg(fav, 5, dt), imprevAz: imprev(az), imprevFav: imprev(fav), h2h: h.length }
      };
    }
    function zebra(j, P = probs(j)) {
      const sn = sinais(j, P); const b = CFG.zebra.b;
      let z = 0; const contrib = [];
      for (let i = 0; i < b.length; i++) { const c = b[i] * sn.x[i]; z += c; contrib.push(c); }
      const pZ = sig(z);
      // pontos de cada sinal = quanto ele muda a chance de zebra em relação a só usar a chance do modelo
      const baseOnly = sig(b[0] + b[1] * sn.x[1]);
      return { ...sn, pZ, pBase: sn.pAz, contrib, nomes: NOMES_SINAIS, efeito: sn.x.map((_, i) => i < 2 ? 0 : sig(z) - sig(z - contrib[i])), baseOnly };
    }

    return {
      mCasa, mFora, jogos: atuais.length, historico: hist.length, confronto, lambdas, probs, zebra, sinais, elo: id => E(id),
      semConfronto: j => baseLambdas(j.c, j.f),
      explicar(j) {
        const [lc0, lf0] = baseLambdas(j.c, j.f), [fc, ff] = fatorH2H(j.c, j.f);
        return { mCasa, mFora, K, meiaVida, casa: t[j.c] || neutro, fora: t[j.f] || neutro, lc0, lf0, fc, ff, confronto: confronto(j.c, j.f), eloC: E(j.c), eloF: E(j.f) };
      }
    };
  }

  // decide o placar conforme o perfil
  const PERFIS = {
    conservador: 'Conservador', moderado: 'Moderado', arriscado: 'Arriscado'
  };
  function prever(j, m, perfil = 'moderado') {
    const P = m.probs(j); const z = m.zebra(j, P);
    let r, mat = P.mat, motivo;
    const maior = P.pV >= P.pE && P.pV >= P.pD ? 'V' : P.pD >= P.pE ? 'D' : 'E';
    if (perfil === 'conservador') { r = maior; motivo = 'resultado mais provável'; }
    else {
      const equilibrado = Math.abs(P.pV - P.pD) < CFG.equilibrio;
      r = equilibrado ? 'E' : maior; motivo = equilibrado ? 'jogo equilibrado' : 'resultado mais provável';
      if (perfil === 'arriscado') {
        if (z.pZ >= CFG.zebra.limiar) { r = z.az === j.c ? 'V' : 'D'; motivo = 'zebra'; }
        const k = CFG.arriscadoAbertura; // jogo mais aberto: placares com mais gols
        const ma = matriz(P.lc * k, P.lf * k); const dc = somaClasses(ma);
        mat = ma.map(([a, b, p]) => [a, b, p * ({ V: P.pV, E: P.pE, D: P.pD })[classe(a, b)] / dc[classe(a, b)]]);
      }
    }
    const esc = maisProvavel(mat, r);
    const top = P.mat.filter(([a, b]) => a <= 5 && b <= 5).sort((x, y) => y[2] - x[2]).slice(0, 6);
    return { placar: [esc[0], esc[1]], resultado: r, motivo, perfil, pV: P.pV, pE: P.pE, pD: P.pD, lc: P.lc, lf: P.lf, top, zebra: z, P, equilibrado: Math.abs(P.pV - P.pD) < CFG.equilibrio, equilibrio: CFG.equilibrio };
  }

  // sorteio de um placar com as chances combinadas
  function sortear(j, m) {
    const mat = m.probs(j).mat; let u = Math.random();
    for (const [a, b, p] of mat) { u -= p; if (u <= 0) return [a, b]; }
    return [mat.at(-1)[0], mat.at(-1)[1]];
  }
  // versão rápida para o Monte Carlo: tabela acumulada
  function sorteador(j, m) {
    const mat = m.probs(j).mat; const acc = []; let s = 0; for (const x of mat) { s += x[2]; acc.push(s); }
    return () => { const u = Math.random() * s; let lo = 0, hi = acc.length - 1; while (lo < hi) { const md = (lo + hi) >> 1; if (acc[md] < u) lo = md + 1; else hi = md; } return [mat[lo][0], mat[lo][1]]; };
  }

  return { CFG, PERFIS, NOMES_SINAIS, matriz, modelo, prever, sortear, sorteador };
})();
