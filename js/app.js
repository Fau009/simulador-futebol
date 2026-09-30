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

  const PERFIS = {
    conservador: { nome: 'Conservador', ico: '🛡️', resumo: 'Vai sempre no resultado de maior chance.',
      efeito: 'Quase nunca prevê empate nem zebra, e os placares são "secos" (1×0, 2×0). A tabela prevista fica mais concentrada nos favoritos.',
      numeros: { acerto: 49.5, V: 73, E: 0, D: 27, gols: 1.6 } },
    moderado: { nome: 'Moderado', ico: '⚖️', resumo: 'Resultado de maior chance, mas vira empate quando vitória e derrota estão a menos de 12 pontos.',
      efeito: 'Os empates aparecem na mesma proporção da vida real. Acerta um pouco menos que o conservador, mas a tabela prevista fica mais realista.',
      numeros: { acerto: 47.3, V: 57, E: 26.5, D: 17, gols: 1.6 } },
    arriscado: { nome: 'Arriscado', ico: '🔥', resumo: 'Como o moderado, mas aposta no azarão quando o índice de zebra passa de 33%, e considera o jogo mais aberto (gols × 1,25).',
      efeito: 'Aposta em zebra em cerca de 12% dos jogos (acertou 35,8% delas, contra 33,2% esperados) e prevê placares com mais gols, mais perto da média real.',
      numeros: { acerto: 48.4, V: 62, E: 14, D: 23, gols: 2.5 } }
  };
  const REAL = { V: 44, E: 27, D: 29, gols: 2.6 };

  const S = { pais: null, comp: null, dados: null, sim: {}, simAtivo: false, perfil: 'moderado', chances: null, filtro: 'proximos', time: '', abertos: new Set(), aba: 'tabela' };

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
      S.hist = []; S.modelo = Calculo.modelo(S.dados.jogos);
      carregarHistorico();
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

  // histórico das temporadas anteriores chega depois (é pesado); quando chega, o algoritmo passa a usá-lo
  async function carregarHistorico() {
    const comp = S.comp, temp = S.dados.temporada;
    try {
      const h = await Dados.historico(comp, temp);
      if (S.comp !== comp || S.dados.temporada !== temp) return;
      S.hist = h; S.modelo = Calculo.modelo(S.dados.jogos, h); S.chances = null;
      if (S.aba === 'jogos' && S.abertos.size) renderJogos();
    } catch { /* sem histórico: segue só com a temporada atual */ }
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

  function renderComparativo() {
    const linhas = Object.entries(PERFIS).map(([k, p]) => `<tr class="${k === S.perfil ? 'ativo' : ''}"><td>${p.ico} ${p.nome}</td><td>${String(p.numeros.acerto).replace('.', ',')}%</td><td>${p.numeros.V}% · ${String(p.numeros.E).replace('.', ',')}% · ${p.numeros.D}%</td><td>${String(p.numeros.gols).replace('.', ',')}</td></tr>`).join('');
    $('#comparativoPerfis').innerHTML = `<table><tr><th>Perfil</th><th>Acerto</th><th>Prevê mandante · empate · visitante</th><th>Gols/jogo</th></tr>${linhas}
      <tr class="real"><td>Vida real</td><td>—</td><td>${REAL.V}% · ${REAL.E}% · ${REAL.D}%</td><td>${String(REAL.gols).replace('.', ',')}</td></tr></table>
      <p class="sutil">As chances de cada jogo são iguais nos 3 perfis; muda só a regra que escolhe o placar. Trocar o perfil refaz na hora os placares que vieram do algoritmo. Os que você digitou não mudam.</p>`;
  }

  function renderPerfil() {
    renderComparativo();
    const p = PERFIS[S.perfil], n = p.numeros;
    document.querySelectorAll('#perfis button').forEach(b => { const on = b.dataset.perfil === S.perfil; b.classList.toggle('ativo', on); b.setAttribute('aria-checked', on); });
    $('#btnPrever').textContent = `🧮 Prever (${p.nome})`;
    const barra = (rot, x, cor) => `<div class="mini-barra"><span>${rot}</span><i style="width:${x}%;background:${cor}"></i><b>${String(x).replace('.', ',')}%</b></div>`;
    $('#perfilInfo').innerHTML = `<p><b>${p.ico} ${p.nome}:</b> ${p.resumo}</p><p class="sutil">${p.efeito}</p>
      <div class="perfil-num"><div><small>Acerto do resultado (teste em 2025)</small><b>${String(n.acerto).replace('.', ',')}%</b><small>chute aleatório: 33% · sempre o mandante: 44%</small></div>
      <div class="dist"><small>Resultados que ele prevê × a vida real</small>
        ${barra('Mandante', n.V, 'var(--v)')}${barra('Empate', n.E, 'var(--e)')}${barra('Visitante', n.D, '#2563eb')}
        <small>Real: ${REAL.V}% · ${REAL.E}% · ${REAL.D}% · gols por jogo previstos ${String(n.gols).replace('.', ',')} (real ${String(REAL.gols).replace('.', ',')})</small></div></div>`;
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

  const aberto = j => j.st !== 'fim' && j.st !== 'cancelado' && !j.indef;
  const digitado = s => s && !s[3]; // 4º campo = origem: 'r' sorteado, 'a' algoritmo; placar digitado não tem
  // preenche os jogos por disputar. Substitui o que o algoritmo ou o sorteio fizeram antes; mantém o que foi digitado.
  // somente: 'a' = refaz só os jogos que vieram do algoritmo (usado ao trocar de perfil)
  function preencher(modo, somente = null) {
    const m = S.modelo; let n = 0, mantidos = 0;
    for (const j of S.dados.jogos) {
      if (!aberto(j)) continue;
      const s = S.sim[j.id];
      if (digitado(s)) { mantidos++; continue; }
      if (somente && s?.[3] !== somente) continue;
      S.sim[j.id] = modo === 'a' ? [...Calculo.prever(j, m, S.perfil).placar, null, 'a', S.perfil] : [...Calculo.sortearPlacar(j, m), null, 'r']; n++;
    }
    if (S.comp.tipo === 'copa') { // desempata confrontos sorteados nos pênaltis
      for (const f of Calculo.chaves(S.dados.jogos, S.sim)) for (const c of f.confrontos) {
        if (c.empatado && c.algumSim) {
          const u = c.jogos.at(-1); if (!S.sim[u.id]) continue;
          const [lc, lf] = m.lambdas(u); // pênaltis: no algoritmo vence o mais forte; no sorteio, chance proporcional à força
          S.sim[u.id][2] = modo === 'a' ? (lc >= lf ? 'c' : 'f') : (Math.random() < lc / (lc + lf) ? 'c' : 'f');
        }
      }
    }
    salvarSim(); renderTudo();
    const extra = mantidos ? ` · ${mantidos} placar(es) digitado(s) por você mantido(s)` : '';
    if (somente) { if (n) aviso(`${n} jogo(s) refeitos com o perfil ${PERFIS[S.perfil].nome}${extra}`); return; }
    aviso(!n ? `Nenhum jogo para preencher${extra}` : modo === 'a' ? `${n} jogo(s) previstos · perfil ${PERFIS[S.perfil].nome}${extra}` : `${n} jogo(s) sorteados com as chances do algoritmo${extra}`);
  }

  function calcularChances() {
    const g = S.dados.tabela[0]; if (!g) return;
    const btn = $('#btnChances'); btn.disabled = true; btn.textContent = '📊 Calculando…';
    setTimeout(() => {
      S.chances = Calculo.chances(g, S.dados.jogos, S.sim, S.comp.desempate, S.comp.zonas, 3000, S.modelo);
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
    if (s) return `<span class="tag-sim">${s[3] === 'a' ? (PERFIS[s[4]] ? PERFIS[s[4]].ico + ' ' + PERFIS[s[4]].nome.toLowerCase() : 'algoritmo') : s[3] === 'r' ? 'sorteado' : 'simulado'}</span>${j.st === 'fim' ? `<br>oficial ${j.gc}×${j.gf}` : ''} <button class="desfazer" data-desfazer="${j.id}">desfazer</button>`;
    if (j.st === 'vivo') return `<span class="vivo">● ao vivo ${esc(j.relogio || '')}</span>`;
    if (j.st === 'adiado') return 'adiado';
    if (j.st === 'cancelado') return 'cancelado';
    if (j.st === 'fim') return j.pc != null ? `pên. ${j.pc}×${j.pf}` : 'encerrado';
    const fase = j.fase && S.comp.tipo === 'copa' ? esc(j.fase) + '<br>' : '';
    return j.indef ? fase : fase + '<span class="dica-prev" title="Clique para ver a previsão e o cálculo">🧮 previsão</span>';
  }
  function htmlJogo(j) {
    const p = Calculo.placar(j, S.sim && S.simAtivo ? S.sim : {});
    const vc = p && (p.gc > p.gf || (p.gc === p.gf && p.pen === 'c')), vf = p && (p.gf > p.gc || (p.gc === p.gf && p.pen === 'f'));
    const aberto = S.abertos.has(j.id);
    const det = aberto ? `<div class="detalhe-jogo">
        <div class="lado-casa">${j.gols.filter(g => g[0] === j.c).map(g => `⚽ ${esc(g[1])} ${esc(g[2])}${g[3] === 'p' ? ' (pên.)' : g[3] === 'c' ? ' (contra)' : ''}`).join('<br>') || ''}${j.cartoes.filter(c => c[0] === j.c).map(c => `<br>${c[2] === 'v' ? '🟥' : '🟨'} ${esc(c[1])}`).join('')}</div>
        <div>${j.gols.filter(g => g[0] === j.f).map(g => `⚽ ${esc(g[1])} ${esc(g[2])}${g[3] === 'p' ? ' (pên.)' : g[3] === 'c' ? ' (contra)' : ''}`).join('<br>') || ''}${j.cartoes.filter(c => c[0] === j.f).map(c => `<br>${c[2] === 'v' ? '🟥' : '🟨'} ${esc(c[1])}`).join('')}</div>
        <div class="local">${esc(j.local)}${j.nota ? ' · ' + esc(j.nota) : ''}${j.st === 'fim' || j.st === 'vivo' ? '' : ' · ' + hora(j.d)}</div>${htmlPrevisao(j)}</div>` : '';
    return `<div class="jogo${S.sim[j.id] && S.simAtivo ? ' simulado' : ''}" data-jogo="${j.id}">
      <span class="hora">${j.st === 'fim' ? new Date(j.d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : hora(j.d)}</span>
      <div class="casa${vc ? ' vence' : ''}"><span>${esc(mobile() ? time(j.c).curto : time(j.c).nome)}</span>${escudo(j.c)}</div>
      ${htmlPlacar(j)}
      <div class="fora${vf ? ' vence' : ''}">${escudo(j.f)}<span>${esc(mobile() ? time(j.f).curto : time(j.f).nome)}</span></div>
      <div class="status">${htmlStatus(j)}</div>${det}</div>`;
  }

  // previsão do algoritmo para jogos ainda não disputados
  function htmlPrevisao(j) {
    if (j.st === 'fim' || j.st === 'cancelado' || j.indef || !S.modelo?.jogos) return '';
    const p = Calculo.prever(j, S.modelo, S.perfil);
    const f = x => (x * 100).toFixed(0) + '%', g = x => x.toFixed(2).replace('.', ',');
    return `<div class="previsao"><b>🧮 Previsão: ${p.placar[0]} × ${p.placar[1]}</b> · gols esperados ${g(p.lc)} × ${g(p.lf)}
      <div class="prob"><i style="width:${p.pV * 100}%" title="${esc(time(j.c).nome)} vence">${f(p.pV)}</i><i style="width:${p.pE * 100}%" title="Empate">${f(p.pE)}</i><i style="width:${p.pD * 100}%" title="${esc(time(j.f).nome)} vence">${f(p.pD)}</i></div>
      <small>${esc(time(j.c).curto)} vence · empate · ${esc(time(j.f).curto)} vence</small>
      ${htmlConfronto(j)}
      <small class="base">Base: ${S.modelo.jogos} jogos desta temporada${S.modelo.historico ? ` + ${S.modelo.historico} das 2 anteriores` : S.comp.tipo === 'liga' ? ' (carregando temporadas anteriores…)' : ''}</small></div>`;
  }

  // ---------- janela "por que este resultado?" ----------
  const n2 = x => x.toFixed(2).replace('.', ','), pc = x => (x * 100).toFixed(0) + '%';
  // Velocímetro: arco da esquerda (mandante vence) à direita (visitante vence), empate no meio.
  // O ponteiro aponta para o favorito: 0,5 + (visitante − mandante) / 2 do caminho.
  function velocimetro(p, casa, fora) {
    const cx = 150, cy = 140, r = 105, lg = 26;
    const pt = (t, rr = r) => { const a = Math.PI * (1 - t); return [cx + rr * Math.cos(a), cy - rr * Math.sin(a)]; };
    const arco = (t0, t1, cls) => {
      if (t1 - t0 < 0.002) return '';
      const [x0, y0] = pt(t0), [x1, y1] = pt(t1);
      return `<path class="${cls}" d="M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}" stroke-width="${lg}" fill="none"/>`;
    };
    const segs = [[0, p.pV, 'g-casa'], [p.pV, p.pV + p.pE, 'g-empate'], [p.pV + p.pE, 1, 'g-fora']];
    const rotulo = ([t0, t1], txt) => { if (t1 - t0 < 0.06) return ''; const [x, y] = pt((t0 + t1) / 2); return `<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" class="g-num">${txt}</text>`; };
    const t = 0.5 + (p.pD - p.pV) / 2, [nx, ny] = pt(t, r - 22);
    return `<svg class="velocimetro" viewBox="0 0 300 165" role="img" aria-label="${esc(casa)} vence ${pc(p.pV)}, empate ${pc(p.pE)}, ${esc(fora)} vence ${pc(p.pD)}">
      ${segs.map(([a, b, c]) => arco(a, b, c)).join('')}
      ${rotulo(segs[0], pc(p.pV))}${rotulo(segs[1], pc(p.pE))}${rotulo(segs[2], pc(p.pD))}
      <line x1="${cx}" y1="${cy}" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" class="g-ponteiro"/>
      <circle cx="${cx}" cy="${cy}" r="8" class="g-eixo"/>
    </svg>
    <div class="g-legenda"><span class="c">${esc(casa)} vence<b>${pc(p.pV)}</b></span><span class="e">Empate<b>${pc(p.pE)}</b></span><span class="f">${esc(fora)} vence<b>${pc(p.pD)}</b></span></div>`;
  }

  // barras V/E/D de um componente, com a diferença em relação ao combinado
  function linhaComponente(rot, desc, v, e, d, ref) {
    const dif = (x, y) => { const k = Math.round((x - y) * 100); return !ref || !k ? '' : `<em class="${k > 0 ? 'sobe' : 'desce'}">${k > 0 ? '▲' : '▼'}${Math.abs(k)}</em>`; };
    return `<tr><th>${rot}<small>${desc}</small></th>
      <td><div class="celula"><i style="width:${v * 100}%;background:var(--v)"></i><span>${pc(v)}${dif(v, ref?.[0])}</span></div></td>
      <td><div class="celula"><i style="width:${e * 100}%;background:var(--e)"></i><span>${pc(e)}${dif(e, ref?.[1])}</span></div></td>
      <td><div class="celula"><i style="width:${d * 100}%;background:#2563eb"></i><span>${pc(d)}${dif(d, ref?.[2])}</span></div></td></tr>`;
  }

  function abrirPrevisao(j) {
    const m = S.modelo, x = m.explicar(j);
    const todos = Object.fromEntries(Object.keys(PERFIS).map(k => [k, Calculo.prever(j, m, k)]));
    const p = todos[S.perfil], P = p.P, z = p.zebra;
    const A = time(j.c), B = time(j.f);
    const nomeR = { V: `vitória do ${esc(A.curto)}`, E: 'empate', D: `vitória do ${esc(B.curto)}` };
    const lin = (rot, gols, jogos, media) => `${rot}: <b>${n2(gols / Math.max(jogos, 1e-9))}</b> por jogo (${n2(gols)} gols em ${n2(jogos)} jogos ponderados; média da liga ${n2(media)})`;
    const ca = x.casa.casa || { gp: 0, gc: 0, n: 0 }, fo = x.fora.fora || { gp: 0, gc: 0, n: 0 };
    const azNome = esc(time(z.az).curto), favNome = esc(time(z.fav).curto);
    const w = Previsao.CFG.elo.peso;
    const comb = [P.pV, P.pE, P.pD];
    const porque = k => {
      const r = todos[k]; const c = Previsao.CFG;
      if (k === 'conservador') return `Maior chance: ${nomeR[r.resultado]} (${pc({ V: r.pV, E: r.pE, D: r.pD }[r.resultado])}).`;
      const base = r.equilibrado ? `Vitória e derrota a ${Math.round(Math.abs(r.pV - r.pD) * 100)} pontos (menos de ${Math.round(c.equilibrio * 100)}): empate.` : `Diferença de ${Math.round(Math.abs(r.pV - r.pD) * 100)} pontos: fica com o de maior chance.`;
      if (k === 'moderado') return base;
      return r.motivo === 'zebra' ? `Índice de zebra ${pc(z.pZ)} (≥ ${Math.round(c.zebra.limiar * 100)}%): aposta no azarão, ${azNome}.` : `Índice de zebra ${pc(z.pZ)} (abaixo de ${Math.round(c.zebra.limiar * 100)}%): não arrisca. ${base} Jogo mais aberto (gols × ${String(c.arriscadoAbertura).replace('.', ',')}).`;
    };
    $('#modalTitulo').innerHTML = `${escudo(j.c)} ${esc(A.nome)} <span class="sutil">×</span> ${esc(B.nome)} ${escudo(j.f)}`;
    $('#modalCorpo').innerHTML = `
      <p class="sutil">${diaLongo(j.d)} · ${hora(j.d)}${j.local ? ' · ' + esc(j.local) : ''}</p>
      <div class="previsao-topo">
        ${velocimetro(p, A.curto, B.curto)}
        <div class="resposta"><span>Placar previsto · ${PERFIS[S.perfil].ico} ${PERFIS[S.perfil].nome}</span><b>${p.placar[0]} × ${p.placar[1]}</b><span>${nomeR[p.resultado]}</span></div>
      </div>

      <h3>O que cada perfil faria</h3>
      <div class="perfis-jogo">${Object.entries(PERFIS).map(([k, pf]) => `
        <div class="perfil-card${k === S.perfil ? ' ativo' : ''}">
          <div class="pc-topo">${pf.ico} <b>${pf.nome}</b></div>
          <div class="pc-placar">${todos[k].placar[0]} × ${todos[k].placar[1]}</div>
          <p>${porque(k)}</p>
          ${S.simAtivo ? `<button class="btn mini" data-usar="${k}">Usar este</button>` : ''}
        </div>`).join('')}</div>
      <p class="sutil">As chances (velocímetro) são as mesmas nos 3 perfis. O que muda é a regra que escolhe o placar. Troque o perfil padrão na barra do simulador.</p>

      <h3>Como cada parte do cálculo vê o jogo</h3>
      <table class="componentes"><tr><th></th><th>${esc(A.curto)}</th><th>Empate</th><th>${esc(B.curto)}</th></tr>
        ${linhaComponente('Gols esperados', `Dixon-Coles · peso ${Math.round((1 - w) * 100)}%`, P.dc.V, P.dc.E, P.dc.D, comb)}
        ${linhaComponente('Elo', `força acumulada · peso ${Math.round(w * 100)}%`, P.elo.V, P.elo.E, P.elo.D, comb)}
        ${linhaComponente('Combinado', 'o que vale', P.pV, P.pE, P.pD, null)}
      </table>
      <p class="sutil">▲▼ = quanto cada visão fica acima ou abaixo do resultado combinado, em pontos percentuais. Quando as duas visões discordam, o Elo pesa mais, porque foi o que mais acertou no teste.</p>

      <h3>Índice de zebra</h3>
      <div class="zebra-box">
        <div class="zebra-num"><small>Azarão: ${azNome}</small><b>${pc(z.pZ)}</b><small>chance pelo modelo: ${pc(z.pAz)}</small></div>
        <ul class="sinais">${z.x.map((_, i) => i < 2 ? '' : (() => {
          const ef = z.efeito[i] * 100; const b = z.brutos;
          const det = [null, null, `gols esperados no jogo: ${n2(P.lc + P.lf)}`, `erro médio recente: ${azNome} ${n2(b.imprevAz)} · ${favNome} ${n2(b.imprevFav)} pts`,
            `pontos por jogo nos últimos 5: ${azNome} ${n2(b.formaAz)} · ${favNome} ${n2(b.formaFav)}`, `dias desde o último jogo: ${azNome} ${Math.round(b.descansoAz)} · ${favNome} ${Math.round(b.descansoFav)}`,
            b.h2h ? `${b.h2h} confrontos recentes` : 'sem confrontos recentes'][i];
          return `<li><span>${z.nomes[i]}<small>${det}</small></span><em class="${ef > 0.05 ? 'sobe' : ef < -0.05 ? 'desce' : ''}">${Math.abs(ef) < 0.05 ? '0,0' : (ef > 0 ? '+' : '') + ef.toFixed(1).replace('.', ',')} pts</em></li>`;
        })()).join('')}</ul>
      </div>
      <p class="sutil">Os pesos de cada sinal foram aprendidos por regressão logística em 2023–2024 e testados em 2025. Quase todos ficaram perto de zero: na prática, a chance do azarão pelo modelo já explica as zebras. Por isso a mudança costuma ser pequena. O perfil Arriscado aposta na zebra quando o índice chega a ${Math.round(Previsao.CFG.zebra.limiar * 100)}%.</p>

      <h3>O cálculo, passo a passo</h3>
      <ol class="passos">
        <li><h4>Média da liga</h4>
          <p>Mandantes fazem <b>${n2(x.mCasa)}</b> gols por jogo e visitantes <b>${n2(x.mFora)}</b>, considerando esta temporada e as 2 anteriores${m.historico ? '' : ' (histórico ainda carregando: só esta temporada)'}. Jogos recentes pesam mais (meia-vida de ${x.meiaVida} dias).</p></li>
        <li><h4>${esc(A.curto)} jogando em casa</h4>
          <p>${lin('Marca', ca.gp, ca.n, x.mCasa)} → ataque <b>${n2(x.casa.atCasa)}×</b> a média.<br>
          ${lin('Sofre', ca.gc, ca.n, x.mFora)} → defesa <b>${n2(x.casa.dfCasa)}×</b> (abaixo de 1 é melhor).</p></li>
        <li><h4>${esc(B.curto)} jogando fora</h4>
          <p>${lin('Marca', fo.gp, fo.n, x.mFora)} → ataque <b>${n2(x.fora.atFora)}×</b> a média.<br>
          ${lin('Sofre', fo.gc, fo.n, x.mCasa)} → defesa <b>${n2(x.fora.dfFora)}×</b>.</p>
          <p class="sutil">Com poucos jogos, cada time recebe ${x.K} jogos "na média da liga" somados, para não exagerar em poucos resultados.</p></li>
        <li><h4>Gols esperados</h4>
          <p class="conta">${esc(A.curto)}: ${n2(x.mCasa)} × ${n2(x.casa.atCasa)} × ${n2(x.fora.dfFora)} = <b>${n2(x.lc0)}</b></p>
          <p class="conta">${esc(B.curto)}: ${n2(x.mFora)} × ${n2(x.fora.atFora)} × ${n2(x.casa.dfCasa)} = <b>${n2(x.lf0)}</b></p></li>
        <li><h4>Confronto direto</h4>${htmlConfronto(j)}
          ${x.confronto.length ? `<p class="conta">Fator aplicado: ${esc(A.curto)} × ${n2(x.fc)} → <b>${n2(p.lc)}</b> · ${esc(B.curto)} × ${n2(x.ff)} → <b>${n2(p.lf)}</b></p>` : ''}</li>
        <li><h4>Chances pelos gols (Dixon-Coles)</h4>
          <table class="top-placares"><tr>${p.top.map(([a2, b2, q]) => `<td><b>${a2}×${b2}</b><br>${(q * 100).toFixed(1)}%</td>`).join('')}</tr></table>
          <p>Somando os placares: ${esc(A.curto)} ${pc(P.dc.V)} · empate ${pc(P.dc.E)} · ${esc(B.curto)} ${pc(P.dc.D)}.</p></li>
        <li><h4>Rating Elo</h4>
          <p class="conta">${esc(A.curto)} <b>${Math.round(x.eloC)}</b> + ${Previsao.CFG.elo.casa} (mando) × ${esc(B.curto)} <b>${Math.round(x.eloF)}</b> → diferença ${Math.round(x.eloC + Previsao.CFG.elo.casa - x.eloF)}</p>
          <p>Pelo Elo: ${esc(A.curto)} ${pc(P.elo.V)} · empate ${pc(P.elo.E)} · ${esc(B.curto)} ${pc(P.elo.D)}.</p></li>
        <li><h4>Combinação e decisão</h4>
          <p>${Math.round((1 - w) * 100)}% gols + ${Math.round(w * 100)}% Elo = ${esc(A.curto)} <b>${pc(P.pV)}</b> · empate <b>${pc(P.pE)}</b> · ${esc(B.curto)} <b>${pc(P.pD)}</b>.</p>
          <p>Perfil ${PERFIS[S.perfil].nome}: ${porque(S.perfil)} Dentro do resultado escolhido, o placar mais provável é <b>${p.placar[0]}×${p.placar[1]}</b>.</p></li>
      </ol>`;
    document.querySelectorAll('#modalCorpo [data-usar]').forEach(b => b.onclick = () => {
      const r = todos[b.dataset.usar];
      S.sim[j.id] = [r.placar[0], r.placar[1], null, 'a', b.dataset.usar]; salvarSim(); $('#modalPrev').close(); renderJogos(); renderSimBarra();
    });
    $('#modalPrev').showModal();
  }
  $('#modalPrev').addEventListener('click', e => { if (e.target.id === 'modalPrev') e.target.close(); }); // clique fora fecha

  // últimos confrontos entre os dois times (temporada atual + 2 anteriores)
  function htmlConfronto(j) {
    const lista = S.modelo.confronto(j.c, j.f);
    if (!lista.length) return '<div class="h2h"><b>Confronto direto:</b> sem jogos entre os dois nas últimas temporadas</div>';
    let v = 0, e = 0, d = 0, vc = 0, ec = 0, dc = 0, nc = 0;
    for (const x of lista) {
      const gm = x.c === j.c ? x.gc : x.gf, gs = x.c === j.c ? x.gf : x.gc;
      if (gm > gs) v++; else if (gm === gs) e++; else d++;
      if (x.c === j.c) { nc++; if (x.gc > x.gf) vc++; else if (x.gc === x.gf) ec++; else dc++; }
    }
    const [lc0, lf0] = S.modelo.semConfronto(j), [lc, lf] = S.modelo.lambdas(j);
    const efeito = Math.abs(lc - lc0) + Math.abs(lf - lf0) < 0.05 ? 'quase sem efeito na previsão' : `ajustou os gols esperados de ${lc0.toFixed(2).replace('.', ',')} × ${lf0.toFixed(2).replace('.', ',')} para ${lc.toFixed(2).replace('.', ',')} × ${lf.toFixed(2).replace('.', ',')}`;
    const nome = x => esc(x.nc || time(x.c).curto), nomeF = x => esc(x.nf || time(x.f).curto);
    return `<div class="h2h"><b>Confronto direto (últimos ${lista.length}):</b> ${esc(time(j.c).curto)} ${v}V ${e}E ${d}D${nc ? ` · com mando dele: ${vc}V ${ec}E ${dc}D` : ''} · ${efeito}
      <ul>${lista.slice().reverse().map(x => `<li>${new Date(x.d).toLocaleDateString('pt-BR')} · ${nome(x)} <b>${x.gc} × ${x.gf}</b> ${nomeF(x)}</li>`).join('')}</ul></div>`;
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
  $('#perfis').onclick = e => {
    const k = e.target.closest('[data-perfil]')?.dataset.perfil; if (!k || k === S.perfil) return;
    S.perfil = k; A.gravar('perfil', k); renderPerfil();
    if (S.dados && Object.values(S.sim).some(s => s[3] === 'a')) preencher('a', 'a'); // placares do algoritmo passam para o novo perfil
  };
  $('#btnAjudaPerfil').onclick = () => {
    const abrir = $('#painelPerfis').classList.contains('oculto');
    $('#painelPerfis').classList.toggle('oculto', !abrir); $('#btnAjudaPerfil').setAttribute('aria-expanded', abrir); A.gravar('ajudaPerfil', abrir);
  };
  $('#btnSortear').onclick = () => preencher('r');
  $('#btnPrever').onclick = () => preencher('a');
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
    const id = row.dataset.jogo; const j = S.dados.jogos.find(x => x.id === id);
    if (j.st !== 'fim' && j.st !== 'vivo' && j.st !== 'cancelado' && !j.indef) { abrirPrevisao(j); return; }
    S.abertos.has(id) ? S.abertos.delete(id) : S.abertos.add(id);
    row.outerHTML = htmlJogo(j);
  });
  addEventListener('hashchange', () => { const id = location.hash.slice(1); if (id && id !== S.comp?.id && acharCompeticao(id)) abrir(id); });
  let largura = innerWidth; addEventListener('resize', () => { if ((innerWidth <= 760) !== (largura <= 760) && S.dados) renderJogos(); largura = innerWidth; });

  // ---------- início ----------
  aplicarTema(A.ler('tema') || 'auto');
  S.perfil = PERFIS[A.ler('perfil')] ? A.ler('perfil') : 'moderado'; renderPerfil();
  if (A.ler('ajudaPerfil')) { $('#painelPerfis').classList.remove('oculto'); $('#btnAjudaPerfil').setAttribute('aria-expanded', 'true'); }
  montarPaises();
  abrir(location.hash.slice(1) || A.ler('ultimo') || 'bra.1');
})();
