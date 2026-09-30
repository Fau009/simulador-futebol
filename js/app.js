// Simulador de Futebol — interface
(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const A = Dados.armazenar;
  const mobile = () => innerWidth <= 760;
  const hora = iso => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const diaLongo = iso => new Date(iso).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  const dataHora = ms => new Date(ms).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const pct = x => x >= 0.995 ? '100%' : x > 0 && x < 0.005 ? '<1%' : Math.round(x * 100) + '%';

  const S = { pais: null, comp: null, dados: null, sim: {}, simAtivo: false, chances: null, filtro: 'proximos', time: '', abertos: new Set(), aba: 'tabela' };

  function aviso(txt) {
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = txt;
    document.body.appendChild(t); setTimeout(() => t.remove(), 2800);
  }
  const time = id => S.dados?.times[id] || { nome: '?', curto: '?', abrev: '?' };
  const escudo = (id, cls = '') => { const t = time(id); return t.logo ? `<img class="${cls}" src="${esc(t.logo)}" alt="" loading="lazy">` : ''; };
  const chaveSim = () => `sim:${S.comp.id}:${S.dados.temporada}`;
  const salvarSim = () => { A.gravar(chaveSim(), S.sim); S.chances = null; };

  // ---------- país e campeonato ----------
  function montarPaises() {
    $('#selPais').innerHTML = PAISES.map(p => `<option value="${p.id}">${esc(p.nome)}</option>`).join('');
  }
  function montarComps() {
    $('#selComp').innerHTML = S.pais.competicoes.map(c => `<option value="${c.id}">${esc(c.nome)}</option>`).join('');
  }

  async function abrir(id, forcar = false) {
    const achado = acharCompeticao(id) || acharCompeticao('bra.1');
    S.pais = achado.pais; S.comp = achado.comp; S.chances = null; S.abertos.clear(); S.time = '';
    $('#selPais').value = S.pais.id; montarComps(); $('#selComp').value = S.comp.id;
    history.replaceState(null, '', '#' + S.comp.id); A.gravar('ultimo', S.comp.id);
    $('#nomeComp').textContent = S.comp.nome;
    $('.aba[data-aba="tabela"]').textContent = S.comp.tipo === 'copa' ? 'Chaves' : 'Tabela';
    if (!S.dados || S.dados.compId !== id) {
      for (const p of ['#aba-tabela', '#aba-artilharia', '#aba-destaques']) $(p).innerHTML = '<div class="carregando">Carregando dados…</div>';
      $('#listaJogos').innerHTML = '<div class="carregando">Carregando jogos…</div>';
    }
    const btn = $('#btnRecarregar'); btn.disabled = true;
    try {
      const d = await Dados.carregar(S.comp, forcar);
      if (S.comp.id !== id && acharCompeticao(id)) return;
      S.dados = { ...d, compId: S.comp.id };
      S.sim = A.ler(chaveSim()) || {};
      const ids = new Set(S.dados.jogos.map(j => j.id)); // descarta simulações de jogos que não existem mais
      for (const k of Object.keys(S.sim)) if (!ids.has(k)) delete S.sim[k];
      if (d.erro) aviso('Sem conexão com a fonte: mostrando os últimos dados salvos');
      else if (forcar) aviso('Dados atualizados');
      renderTudo();
    } catch (e) {
      for (const p of ['#aba-tabela', '#aba-artilharia', '#aba-destaques']) $(p).innerHTML = `<div class="vazio">Não foi possível carregar os dados agora (${esc(e.message)}). Tente o botão Recarregar.</div>`;
      $('#listaJogos').innerHTML = '';
    }
    btn.disabled = false;
  }

  function renderTudo() {
    renderTopo(); montarFiltroTime(); renderTabela(); renderJogos(); renderArtilharia(); renderDestaques(); renderSimBarra();
  }

  function renderTopo() {
    const d = S.dados; const fim = d.jogos.filter(j => j.st === 'fim').length;
    $('#infoComp').innerHTML = `<img class="bandeira" src="${bandeiraUrl(S.pais)}" alt=""> ${esc(S.pais.nome)} · Temporada ${d.nomeTemporada} · ${fim} de ${d.jogos.length} jogos realizados`;
    $('#txtAtualizacao').innerHTML = `Atualizado: <b>${dataHora(d.em)}</b>${d.doCache ? ' (cache)' : ''}`;
  }

  // ---------- simulação ----------
  const simulados = () => Object.keys(S.sim).length;
  function renderSimBarra() {
    const on = S.simAtivo;
    $('#btnSim').setAttribute('aria-pressed', String(on));
    $('#btnSim b').textContent = on ? 'Sair do simulador' : 'Modo simulador';
    $('#simResumo').textContent = on ? 'Os resultados simulados ficam salvos neste navegador' : 'Simule os próximos jogos e veja a tabela mudar';
    $('#barraSim').classList.toggle('oculto', !on);
    const n = simulados();
    $('#simContagem').textContent = n ? `${n} jogo(s) com placar simulado` : 'Digite placares nos jogos ou sorteie os restantes';
    $('#btnChances').classList.toggle('oculto', S.comp.tipo !== 'liga' || S.dados?.tabela.length !== 1);
  }

  function definirPlacar(jogo, a, b) {
    if (a === '' && b === '') { delete S.sim[jogo.id]; }
    else {
      if (a === '' || b === '') return false; // espera os dois lados
      a = Math.max(0, Math.min(30, parseInt(a, 10) || 0)); b = Math.max(0, Math.min(30, parseInt(b, 10) || 0));
      if (jogo.st === 'fim' && a === jogo.gc && b === jogo.gf) delete S.sim[jogo.id];
      else S.sim[jogo.id] = [a, b, S.sim[jogo.id]?.[2] || null];
    }
    salvarSim(); return true;
  }

  function sortear() {
    const fz = Calculo.forcas(S.dados.jogos); let n = 0;
    for (const j of S.dados.jogos) {
      if (j.st === 'fim' || j.st === 'cancelado' || j.indef || S.sim[j.id]) continue;
      S.sim[j.id] = [...Calculo.sortearPlacar(j, fz), null]; n++;
    }
    if (S.comp.tipo === 'copa') { // desempata confrontos sorteados nos pênaltis
      for (const f of Calculo.chaves(S.dados.jogos, S.sim)) for (const c of f.confrontos) {
        if (c.empatado && c.algumSim) { const u = c.jogos.at(-1); if (S.sim[u.id]) S.sim[u.id][2] = Math.random() < .5 ? 'c' : 'f'; }
      }
    }
    salvarSim(); renderTudo();
    aviso(n ? `${n} jogo(s) sorteados com base no desempenho da temporada` : 'Não há jogos pendentes para sortear');
  }

  function calcularChances() {
    const g = S.dados.tabela[0]; if (!g) return;
    const btn = $('#btnChances'); btn.disabled = true; btn.textContent = '📊 Calculando…';
    setTimeout(() => {
      S.chances = Calculo.chances(g, S.dados.jogos, S.sim, S.comp.desempate, S.comp.zonas, 3000);
      btn.disabled = false; btn.textContent = '📊 Calcular chances';
      mostrarAba('tabela'); renderTabela();
      aviso(`Chances calculadas com ${S.chances.n.toLocaleString('pt-BR')} simulações de ${S.chances.pendentes} jogo(s) restantes`);
    }, 30);
  }

  // ---------- tabela ----------
  function zonaDe(pos) { return (S.comp.zonas || []).find(z => pos >= z.de && pos <= z.ate); }

  function htmlTabela(grupo, compacta = false) {
    const linhas = Calculo.tabela(grupo, S.dados.jogos, S.simAtivo ? S.sim : {}, S.comp.desempate || ['pontos', 'saldo', 'gp'], S.dados.times);
    const forma = Calculo.forma(S.dados.jogos, S.simAtivo ? S.sim : {});
    const ch = !compacta && S.chances && S.dados.tabela.length === 1 ? S.chances : null;
    const zonasCh = ch ? S.comp.zonas : [];
    const deltas = {}; // pontos ganhos na simulação
    if (S.simAtivo) for (const l of grupo.linhas) deltas[l.id] = l.pts;
    const opc = compacta ? 'oculto' : 'col-opc';
    const cab = `<tr><th>#</th><th class="col-time" style="text-align:left">Time</th><th>P</th><th>J</th><th>V</th><th>E</th><th>D</th>
      <th class="${opc}">GP</th><th class="${opc}">GC</th><th>SG</th><th class="${opc}">%</th><th class="${opc}">Últimos 5</th>
      ${ch ? `<th>Título</th>${zonasCh.map(z => `<th title="${esc(z.nome)} (${z.de}º–${z.ate}º)">${esc(z.nome.split(' ')[0])}${zonasCh.filter(x => x.id === z.id).length > 1 ? ` ${z.de}º` : ''}</th>`).join('')}` : ''}</tr>`;
    const corpo = linhas.map(l => {
      const t = time(l.id); const z = zonaDe(l.pos); const sg = l.gp - l.gc;
      const dPts = S.simAtivo && deltas[l.id] != null ? l.pts - deltas[l.id] : 0;
      const mud = l.mudou ? `<span class="mudou ${l.mudou > 0 ? 'sobe' : 'desce'}" title="${l.mudou > 0 ? 'Subiu' : 'Caiu'} ${Math.abs(l.mudou)} posição(ões) na simulação">${l.mudou > 0 ? '▲' : '▼'}${Math.abs(l.mudou)}</span>` : '';
      const ap = l.j ? Math.round(l.pts / (l.j * 3) * 100) + '%' : '—';
      const chances = ch ? [ch.res[l.id].titulo, ...zonasCh.map(zz => ch.res[l.id].zonas[zz.id + zz.de])]
        .map((p, i) => `<td class="chance">${pct(p)}<div class="barra"><i style="width:${p * 100}%;background:${i === 0 ? 'var(--primaria)' : zonasCh[i - 1].cor}"></i></div></td>`).join('') : '';
      return `<tr>
        <td class="pos" style="--zona:${z?.cor || 'transparent'}" title="${esc(z?.nome || '')}">${l.pos}${mud}</td>
        <td class="col-time"><div class="time">${escudo(l.id)}<span class="nome-longo">${esc(t.nome)}</span><span class="nome-curto">${esc(t.abrev || t.curto)}</span></div></td>
        <td class="pts">${l.pts}${dPts ? `<span class="delta">${dPts > 0 ? '+' : ''}${dPts}</span>` : ''}</td><td>${l.j}</td><td>${l.v}</td><td>${l.e}</td><td>${l.d}</td>
        <td class="${opc}">${l.gp}</td><td class="${opc}">${l.gc}</td><td>${sg > 0 ? '+' + sg : sg}</td><td class="${opc}">${ap}</td>
        <td class="${opc}"><span class="forma">${(forma[l.id] || []).map(r => `<i class="${r}">${r}</i>`).join('')}</span></td>
        ${chances}</tr>`;
    }).join('');
    return `<div class="cartao tabela-wrap"><table class="classif"><thead>${cab}</thead><tbody>${corpo}</tbody></table></div>`;
  }

  function renderTabela() {
    const el = $('#aba-tabela'); const d = S.dados;
    if (S.comp.tipo === 'copa') { el.innerHTML = htmlChaves(); return; }
    if (!d.tabela.length) { el.innerHTML = '<div class="vazio">Tabela ainda não disponível para esta temporada.</div>'; return; }
    const zonas = S.comp.zonas || [];
    const vistos = new Set();
    const legenda = zonas.filter(z => !vistos.has(z.id) && vistos.add(z.id)).map(z => `<span style="--c:${z.cor}">${esc(z.nome)}</span>`).join('');
    el.innerHTML = (S.chances ? `<p class="sutil">Chances calculadas com ${S.chances.n.toLocaleString('pt-BR')} simulações do restante do campeonato (gols sorteados pela força de ataque e defesa de cada time na temporada)${simulados() ? ', respeitando os placares que você definiu' : ''}.</p>` : '') +
      d.tabela.map(g => (d.tabela.length > 1 ? `<h3 class="grupo-titulo">${esc(g.nome)}</h3>` : '') + htmlTabela(g)).join('') +
      (legenda ? `<div class="legenda">${legenda}<span style="--c:transparent">Critérios: ${(S.comp.desempate || []).map(c => ({ pontos: 'pontos', vitorias: 'vitórias', saldo: 'saldo', gp: 'gols pró' }[c])).join(', ')}</span></div>` : '') +
      (S.simAtivo && simulados() ? '<p class="sutil">▲▼ mostra quantas posições o time ganhou ou perdeu em relação à tabela oficial; +N são os pontos vindos da simulação.</p>' : '');
  }

  // tabela compacta ao lado dos jogos (desktop, modo simulador): atualiza a cada placar digitado
  function renderMini() {
    const on = S.simAtivo && S.comp.tipo === 'liga' && S.dados?.tabela.length === 1;
    $('#jogosLayout').classList.toggle('com-mini', on);
    $('#miniTabela').classList.toggle('oculto', !on);
    if (on) $('#miniTabela').innerHTML = `<h3>Tabela com a simulação</h3>${htmlTabela(S.dados.tabela[0], true)}`;
  }

  // ---------- jogos ----------
  function montarFiltroTime() {
    const ids = [...new Set(S.dados.jogos.flatMap(j => [j.c, j.f]))].sort((a, b) => time(a).nome.localeCompare(time(b).nome));
    $('#filtroTime').innerHTML = '<option value="">Todos os times</option>' + ids.map(id => `<option value="${id}">${esc(time(id).nome)}</option>`).join('');
  }

  function htmlPlacar(j) {
    const s = S.sim[j.id];
    if (S.simAtivo && j.st !== 'cancelado' && !j.indef) {
      const a = s ? s[0] : j.st === 'fim' ? j.gc : '', b = s ? s[1] : j.st === 'fim' ? j.gf : '';
      return `<div class="placar"><input type="number" min="0" max="30" inputmode="numeric" data-lado="c" value="${a}" aria-label="Gols ${esc(time(j.c).nome)}"><span class="x">×</span><input type="number" min="0" max="30" inputmode="numeric" data-lado="f" value="${b}" aria-label="Gols ${esc(time(j.f).nome)}"></div>`;
    }
    if (j.st === 'fim' || j.st === 'vivo') return `<div class="placar">${j.gc}<span class="x">×</span>${j.gf}</div>`;
    return `<div class="placar"><span class="x">${hora(j.d)}</span></div>`;
  }
  function htmlStatus(j) {
    const s = S.sim[j.id];
    if (s) return `<span class="tag-sim">simulado</span>${j.st === 'fim' ? `<br>oficial ${j.gc}×${j.gf}` : ''} <button class="desfazer" data-desfazer="${j.id}">desfazer</button>`;
    if (j.st === 'vivo') return `<span class="vivo">● ao vivo ${esc(j.relogio || '')}</span>`;
    if (j.st === 'adiado') return 'adiado';
    if (j.st === 'cancelado') return 'cancelado';
    if (j.st === 'fim') return j.pc != null ? `pên. ${j.pc}×${j.pf}` : 'encerrado';
    return j.fase && S.comp.tipo === 'copa' ? esc(j.fase) : '';
  }
  function htmlJogo(j) {
    const p = Calculo.placar(j, S.sim && S.simAtivo ? S.sim : {});
    const vc = p && (p.gc > p.gf || (p.gc === p.gf && p.pen === 'c')), vf = p && (p.gf > p.gc || (p.gc === p.gf && p.pen === 'f'));
    const aberto = S.abertos.has(j.id);
    const det = aberto ? `<div class="detalhe-jogo">
        <div class="lado-casa">${j.gols.filter(g => g[0] === j.c).map(g => `⚽ ${esc(g[1])} ${esc(g[2])}${g[3] === 'p' ? ' (pên.)' : g[3] === 'c' ? ' (contra)' : ''}`).join('<br>') || ''}${j.cartoes.filter(c => c[0] === j.c).map(c => `<br>${c[2] === 'v' ? '🟥' : '🟨'} ${esc(c[1])}`).join('')}</div>
        <div>${j.gols.filter(g => g[0] === j.f).map(g => `⚽ ${esc(g[1])} ${esc(g[2])}${g[3] === 'p' ? ' (pên.)' : g[3] === 'c' ? ' (contra)' : ''}`).join('<br>') || ''}${j.cartoes.filter(c => c[0] === j.f).map(c => `<br>${c[2] === 'v' ? '🟥' : '🟨'} ${esc(c[1])}`).join('')}</div>
        <div class="local">${esc(j.local)}${j.nota ? ' · ' + esc(j.nota) : ''}${j.st === 'fim' || j.st === 'vivo' ? '' : ' · ' + hora(j.d)}</div></div>` : '';
    return `<div class="jogo${S.sim[j.id] && S.simAtivo ? ' simulado' : ''}" data-jogo="${j.id}">
      <span class="hora">${j.st === 'fim' ? new Date(j.d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : hora(j.d)}</span>
      <div class="casa${vc ? ' vence' : ''}"><span>${esc(mobile() ? time(j.c).curto : time(j.c).nome)}</span>${escudo(j.c)}</div>
      ${htmlPlacar(j)}
      <div class="fora${vf ? ' vence' : ''}">${escudo(j.f)}<span>${esc(mobile() ? time(j.f).curto : time(j.f).nome)}</span></div>
      <div class="status">${htmlStatus(j)}</div>${det}</div>`;
  }

  function jogosFiltrados() {
    let js = S.dados.jogos;
    if (S.time) js = js.filter(j => j.c === S.time || j.f === S.time);
    if (S.filtro === 'proximos') js = js.filter(j => j.st !== 'fim' && j.st !== 'cancelado');
    else if (S.filtro === 'realizados') js = js.filter(j => j.st === 'fim').slice().reverse();
    return js;
  }

  function renderJogos() {
    renderMini();
    const js = jogosFiltrados();
    const el = $('#listaJogos');
    if (!js.length) { el.innerHTML = `<div class="vazio">${S.filtro === 'proximos' ? 'Não há jogos por disputar nesta temporada.' : 'Nenhum jogo encontrado.'}</div>`; return; }
    const blocos = []; let dia = null, atual = null;
    const adiados = S.filtro === 'proximos' ? js.filter(j => j.st === 'adiado') : [];
    for (const j of js) {
      if (adiados.includes(j)) continue;
      const d = new Date(j.d).toDateString();
      if (d !== dia) { dia = d; atual = { rot: diaLongo(j.d), itens: [] }; blocos.push(atual); }
      atual.itens.push(htmlJogo(j));
    }
    if (adiados.length) blocos.push({ rot: `Adiados, sem nova data (${adiados.length})`, itens: adiados.map(htmlJogo) });
    el.innerHTML = blocos.map(b => `<div class="dia">${esc(b.rot)}</div><div class="cartao">${b.itens.join('')}</div>`).join('');
  }

  // ---------- chaves (copas) ----------
  function htmlChaves() {
    const fases = Calculo.chaves(S.dados.jogos, S.simAtivo ? S.sim : {});
    if (!fases.length) return '<div class="vazio">Ainda não há jogos desta copa na temporada.</div>';
    return `<div class="chaves">${fases.map(f => `<div class="fase"><h3>${esc(traduzFase(f.nome))}</h3>${f.confrontos.map(c => {
      const [x, y] = c.times;
      const lin = (id, g) => `<div class="lin${c.vencedor === id ? ' vence' : ''}">${escudo(id, 'escudo')}<span class="nome">${esc(time(id).nome)}</span><span class="agg">${c.jogos.some(j => Calculo.placar(j, S.simAtivo ? S.sim : {})) ? g : ''}</span></div>`;
      const pernas = c.jogos.map((j, i) => `<div class="perna" data-jogo="${j.id}"><span>${c.jogos.length > 1 ? (i + 1) + 'º jogo · ' : ''}${esc(time(j.c).abrev || time(j.c).curto)} × ${esc(time(j.f).abrev || time(j.f).curto)}</span>${htmlPlacar(j)}</div>`).join('');
      const pen = S.simAtivo && c.empatado && c.algumSim ? (() => {
        const u = c.jogos.at(-1); const w = S.sim[u.id]?.[2];
        return `<div class="penaltis" data-jogo="${u.id}">Pênaltis:<button data-pen="c" class="${w === 'c' ? 'ativo' : ''}">${esc(time(u.c).curto)}</button><button data-pen="f" class="${w === 'f' ? 'ativo' : ''}">${esc(time(u.f).curto)}</button></div>`;
      })() : '';
      return `<div class="cartao confronto${c.algumSim && S.simAtivo ? ' simulado' : ''}">${lin(x, c.agregado[0])}${lin(y, c.agregado[1])}<div class="pernas">${pernas}</div>${pen}</div>`;
    }).join('')}</div>`).join('')}</div>`;
  }
  const traduzFase = n => ({
    'first-round': '1ª fase', 'second-round': '2ª fase', 'third-round': '3ª fase', 'fourth-round': '4ª fase', 'fifth-round': '5ª fase',
    'round-of-64': '32 avos de final', 'round-of-32': '16 avos de final', 'round-of-16': 'Oitavas de final', 'quarterfinals': 'Quartas de final',
    'semifinals': 'Semifinais', 'final': 'Final', 'finals': 'Final'
  }[n] || n.replace(/-/g, ' '));

  // ---------- artilharia ----------
  function htmlRanking(titulo, lista, unidade) {
    if (!lista?.length) return `<div class="cartao"><div class="ranking-titulo">${titulo}</div><div class="vazio">Sem dados ainda.</div></div>`;
    return `<div class="cartao"><div class="ranking-titulo">${titulo}</div><ol class="ranking">${lista.map((x, i) => {
      const t = x.time && S.dados.times[x.time];
      return `<li><span class="n">${i + 1}</span><span class="quem"><b>${esc(x.nome)}</b><small>${t?.logo ? `<img src="${esc(t.logo)}" alt="">` : ''}${esc(t?.nome || x.timeNome || '')}${x.jogos ? ` · ${x.jogos} jogos` : ''}${x.pen ? ` · ${x.pen} de pênalti` : ''}</small></span><span class="val">${x.valor}<small> ${unidade}</small></span></li>`;
    }).join('')}</ol></div>`;
  }
  function renderArtilharia() {
    const L = S.dados.lideres;
    const calc = Calculo.artilharia(S.dados.jogos);
    $('#aba-artilharia').innerHTML = L && L.gols.length
      ? `<div class="duas">${htmlRanking('⚽ Artilharia', L.gols, 'gols')}${htmlRanking('🎯 Assistências', L.assist, 'assist.')}</div>`
      : `<p class="sutil">Artilharia calculada a partir dos gols registrados nos jogos da competição.</p>${htmlRanking('⚽ Artilharia', calc, 'gols')}`;
  }

  // ---------- destaques ----------
  function renderDestaques() {
    const d = Calculo.destaques(S.dados.jogos, S.dados.times);
    const el = $('#aba-destaques');
    if (!d) { el.innerHTML = '<div class="vazio">Ainda não há jogos realizados nesta temporada.</div>'; return; }
    const card = (rot, x, txt) => x ? `<div class="cartao destaque"><div class="rot">${rot}</div><div class="quem">${escudo(x.id)}${esc(time(x.id).nome)}</div><div class="num">${txt(x)}</div></div>` : '';
    const g = d.maiorGoleada;
    el.innerHTML = `<div class="numeros">
        <div class="cartao"><b>${d.jogos}</b><span>jogos realizados</span></div>
        <div class="cartao"><b>${d.gols}</b><span>gols marcados</span></div>
        <div class="cartao"><b>${d.media.toFixed(2).replace('.', ',')}</b><span>gols por jogo</span></div>
        <div class="cartao"><b>${Math.round(d.vitCasa / d.jogos * 100)}% · ${Math.round(d.emp / d.jogos * 100)}% · ${Math.round(d.vitFora / d.jogos * 100)}%</b><span>mandante · empate · visitante</span></div>
      </div>
      <div class="grade">
        ${card('Melhor ataque', d.ataque, x => `${x.gp} gols em ${x.j} jogos`)}
        ${card('Melhor defesa', d.defesa, x => `${x.gc} gols sofridos em ${x.j} jogos`)}
        ${card('Mais vitórias', d.vitorias, x => `${x.v} vitórias`)}
        ${card('Maior invencibilidade atual', d.invicto, x => `${x.semPerder} jogos sem perder`)}
        ${card('Maior invencibilidade na temporada', d.maiorInvencibilidade, x => `${x.maxSemPerder} jogos seguidos sem perder`)}
        ${card('Melhor mandante', d.mandante, x => `${Math.round(x.casa[0] / x.casa[1] * 100)}% de aproveitamento em casa`)}
        ${card('Melhor visitante', d.visitante, x => `${Math.round(x.fora[0] / x.fora[1] * 100)}% de aproveitamento fora`)}
        ${card('Maior jejum de vitórias', d.jejum, x => `${x.semVencer} jogos sem vencer`)}
        ${d.cartoes && (d.cartoes.am + d.cartoes.vm) ? card('Mais cartões', d.cartoes, x => `${x.am} 🟨 · ${x.vm} 🟥`) : ''}
        ${g ? `<div class="cartao destaque"><div class="rot">Maior goleada</div><div class="quem">${escudo(g.c)}${g.gc} × ${g.gf}${escudo(g.f)}</div><div class="num">${esc(time(g.c).nome)} × ${esc(time(g.f).nome)} · ${new Date(g.d).toLocaleDateString('pt-BR')}</div></div>` : ''}
      </div>`;
  }

  // ---------- abas e tema ----------
  function mostrarAba(nome) {
    S.aba = nome;
    document.querySelectorAll('.aba').forEach(b => b.classList.toggle('ativa', b.dataset.aba === nome));
    document.querySelectorAll('.painel').forEach(p => p.classList.toggle('ativa', p.id === 'aba-' + nome));
    if (nome === 'tabela' && S.dados) renderTabela();
    if (nome === 'jogos' && S.dados) renderJogos();
  }
  const TEMAS = ['auto', 'claro', 'escuro'];
  function aplicarTema(t) {
    const r = document.documentElement;
    if (t === 'auto') delete r.dataset.theme; else r.dataset.theme = t === 'escuro' ? 'dark' : 'light';
    A.gravar('tema', t);
    $('#btnTema').textContent = t === 'escuro' ? '☾' : t === 'claro' ? '☀' : '◐';
    $('#btnTema').title = `Tema: ${t === 'auto' ? 'automático' : t}`;
  }

  // ---------- eventos ----------
  $('#selPais').onchange = e => { const p = PAISES.find(x => x.id === e.target.value); abrir(p.competicoes[0].id); };
  $('#selComp').onchange = e => abrir(e.target.value);
  $('#btnRecarregar').onclick = () => abrir(S.comp.id, true);
  $('#btnTema').onclick = () => aplicarTema(TEMAS[(TEMAS.indexOf(A.ler('tema') || 'auto') + 1) % 3]);
  document.querySelectorAll('.aba').forEach(b => b.onclick = () => mostrarAba(b.dataset.aba));
  $('#btnSim').onclick = () => {
    S.simAtivo = !S.simAtivo; S.chances = null;
    renderSimBarra(); renderTabela(); renderJogos();
    if (S.simAtivo) { S.filtro = 'proximos'; document.querySelectorAll('#filtroJogos .chip').forEach(c => c.classList.toggle('ativo', c.dataset.f === 'proximos')); mostrarAba(S.comp.tipo === 'copa' ? 'tabela' : 'jogos'); }
  };
  $('#btnSortear').onclick = sortear;
  $('#btnChances').onclick = calcularChances;
  $('#btnLimpar').onclick = () => {
    if (!simulados()) { aviso('Não há nada simulado'); return; }
    if (!confirm('Apagar todos os placares simulados deste campeonato?')) return;
    S.sim = {}; salvarSim(); renderTudo(); aviso('Simulação apagada');
  };
  $('#filtroJogos').onclick = e => {
    const f = e.target.closest('.chip')?.dataset.f; if (!f) return;
    S.filtro = f; document.querySelectorAll('#filtroJogos .chip').forEach(c => c.classList.toggle('ativo', c.dataset.f === f)); renderJogos();
  };
  $('#filtroTime').onchange = e => { S.time = e.target.value; renderJogos(); };

  // digitação de placares (lista de jogos e chaves): atualiza sem redesenhar a lista, para não perder o foco
  function aoDigitar(e) {
    const inp = e.target; if (inp.tagName !== 'INPUT') return;
    const box = inp.closest('[data-jogo]'); const j = S.dados.jogos.find(x => x.id === box.dataset.jogo); if (!j) return;
    const [a, b] = [...box.querySelectorAll('.placar input')].map(x => x.value);
    if (!definirPlacar(j, a, b)) return;
    box.classList.toggle('simulado', !!S.sim[j.id]);
    renderMini();
    const st = box.querySelector('.status'); if (st) st.innerHTML = htmlStatus(j);
    renderSimBarra();
  }
  $('#listaJogos').addEventListener('input', aoDigitar);
  $('#listaJogos').addEventListener('change', () => { if (S.aba === 'tabela') renderTabela(); });
  $('#aba-tabela').addEventListener('input', aoDigitar);
  $('#aba-tabela').addEventListener('change', e => { if (e.target.tagName === 'INPUT') renderTabela(); });
  $('#aba-tabela').addEventListener('click', e => {
    const b = e.target.closest('[data-pen]'); if (!b) return;
    const id = b.closest('[data-jogo]').dataset.jogo; const j = S.dados.jogos.find(x => x.id === id);
    if (!S.sim[id] && j?.st === 'fim') S.sim[id] = [j.gc, j.gf, null]; // último jogo oficial: guarda o placar para registrar os pênaltis
    if (S.sim[id]) { S.sim[id][2] = b.dataset.pen; salvarSim(); renderTabela(); renderSimBarra(); }
  });
  $('#listaJogos').addEventListener('click', e => {
    const d = e.target.closest('[data-desfazer]');
    if (d) { delete S.sim[d.dataset.desfazer]; salvarSim(); renderJogos(); renderSimBarra(); return; } // renderJogos também atualiza a tabela ao lado
    if (e.target.closest('input')) return;
    const row = e.target.closest('.jogo'); if (!row) return;
    const id = row.dataset.jogo; S.abertos.has(id) ? S.abertos.delete(id) : S.abertos.add(id);
    const j = S.dados.jogos.find(x => x.id === id); row.outerHTML = htmlJogo(j);
  });
  addEventListener('hashchange', () => { const id = location.hash.slice(1); if (id && id !== S.comp?.id && acharCompeticao(id)) abrir(id); });
  let largura = innerWidth; addEventListener('resize', () => { if ((innerWidth <= 760) !== (largura <= 760) && S.dados) renderJogos(); largura = innerWidth; });

  // ---------- início ----------
  aplicarTema(A.ler('tema') || 'auto');
  montarPaises();
  abrir(location.hash.slice(1) || A.ler('ultimo') || 'bra.1');
})();
