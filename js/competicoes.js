// Países e campeonatos disponíveis na fonte (API pública da ESPN, sem chave).
// tipo: liga (tabela de pontos) | copa (mata-mata)
// calendario: ano (jan–dez, como no Brasil) | europeu (ago–mai)
// zonas: faixas de posição da tabela (referência; regulamentos podem mudar a cada temporada)
// desempate: critérios na ordem (confronto direto não é considerado)

const Z = {
  lib: { nome: 'Libertadores', cor: '#1f6feb' },
  prelib: { nome: 'Pré-Libertadores', cor: '#6ea8fe' },
  sula: { nome: 'Sul-Americana', cor: '#f08c00' },
  ucl: { nome: 'Champions League', cor: '#1f6feb' },
  uel: { nome: 'Europa League', cor: '#f08c00' },
  uecl: { nome: 'Conference League', cor: '#2a9d8f' },
  acesso: { nome: 'Acesso', cor: '#2f9e44' },
  playoff: { nome: 'Playoff', cor: '#e0a100' },
  reb: { nome: 'Rebaixamento', cor: '#d62828' }
};
const faixa = (de, ate, z) => ({ de, ate, ...Z[z], id: z });

const PAISES = [
  {
    id: 'br', nome: 'Brasil', bandeira: 'br', competicoes: [
      { id: 'bra.1', nome: 'Brasileirão Série A', tipo: 'liga', calendario: 'ano', desempate: ['pontos', 'vitorias', 'saldo', 'gp'],
        zonas: [faixa(1, 4, 'lib'), faixa(5, 6, 'prelib'), faixa(7, 12, 'sula'), faixa(17, 20, 'reb')] },
      { id: 'bra.2', nome: 'Brasileirão Série B', tipo: 'liga', calendario: 'ano', desempate: ['pontos', 'vitorias', 'saldo', 'gp'],
        zonas: [faixa(1, 4, 'acesso'), faixa(17, 20, 'reb')] },
      { id: 'bra.copa_do_brazil', nome: 'Copa do Brasil', tipo: 'copa', calendario: 'ano' },
      { id: 'bra.camp.paulista', nome: 'Paulistão', tipo: 'liga', calendario: 'ano', desempate: ['pontos', 'vitorias', 'saldo', 'gp'], zonas: [] },
      { id: 'bra.camp.carioca', nome: 'Carioca', tipo: 'liga', calendario: 'ano', desempate: ['pontos', 'vitorias', 'saldo', 'gp'], zonas: [] }
    ]
  },
  {
    id: 'en', nome: 'Inglaterra', bandeira: 'gb-eng', competicoes: [
      { id: 'eng.1', nome: 'Premier League', tipo: 'liga', calendario: 'europeu', desempate: ['pontos', 'saldo', 'gp'],
        zonas: [faixa(1, 4, 'ucl'), faixa(5, 5, 'uel'), faixa(6, 6, 'uecl'), faixa(18, 20, 'reb')] },
      { id: 'eng.2', nome: 'Championship', tipo: 'liga', calendario: 'europeu', desempate: ['pontos', 'saldo', 'gp'],
        zonas: [faixa(1, 2, 'acesso'), faixa(3, 6, 'playoff'), faixa(22, 24, 'reb')] },
      { id: 'eng.fa', nome: 'FA Cup', tipo: 'copa', calendario: 'europeu' },
      { id: 'eng.league_cup', nome: 'Copa da Liga (Carabao Cup)', tipo: 'copa', calendario: 'europeu' }
    ]
  },
  {
    id: 'es', nome: 'Espanha', bandeira: 'es', competicoes: [
      { id: 'esp.1', nome: 'La Liga', tipo: 'liga', calendario: 'europeu', desempate: ['pontos', 'saldo', 'gp'],
        zonas: [faixa(1, 4, 'ucl'), faixa(5, 5, 'uel'), faixa(6, 6, 'uecl'), faixa(18, 20, 'reb')] },
      { id: 'esp.2', nome: 'La Liga 2', tipo: 'liga', calendario: 'europeu', desempate: ['pontos', 'saldo', 'gp'],
        zonas: [faixa(1, 2, 'acesso'), faixa(3, 6, 'playoff'), faixa(19, 22, 'reb')] },
      { id: 'esp.copa_del_rey', nome: 'Copa do Rei', tipo: 'copa', calendario: 'europeu' }
    ]
  },
  {
    id: 'de', nome: 'Alemanha', bandeira: 'de', competicoes: [
      { id: 'ger.1', nome: 'Bundesliga', tipo: 'liga', calendario: 'europeu', desempate: ['pontos', 'saldo', 'gp'],
        zonas: [faixa(1, 4, 'ucl'), faixa(5, 5, 'uel'), faixa(6, 6, 'uecl'), faixa(16, 16, 'playoff'), faixa(17, 18, 'reb')] },
      { id: 'ger.2', nome: '2. Bundesliga', tipo: 'liga', calendario: 'europeu', desempate: ['pontos', 'saldo', 'gp'],
        zonas: [faixa(1, 2, 'acesso'), faixa(3, 3, 'playoff'), faixa(16, 16, 'playoff'), faixa(17, 18, 'reb')] },
      { id: 'ger.dfb_pokal', nome: 'Copa da Alemanha (DFB-Pokal)', tipo: 'copa', calendario: 'europeu' }
    ]
  },
  {
    id: 'it', nome: 'Itália', bandeira: 'it', competicoes: [
      { id: 'ita.1', nome: 'Serie A', tipo: 'liga', calendario: 'europeu', desempate: ['pontos', 'saldo', 'gp'],
        zonas: [faixa(1, 4, 'ucl'), faixa(5, 5, 'uel'), faixa(6, 6, 'uecl'), faixa(18, 20, 'reb')] },
      { id: 'ita.2', nome: 'Serie B', tipo: 'liga', calendario: 'europeu', desempate: ['pontos', 'saldo', 'gp'],
        zonas: [faixa(1, 2, 'acesso'), faixa(3, 8, 'playoff'), faixa(18, 20, 'reb')] },
      { id: 'ita.coppa_italia', nome: 'Copa da Itália', tipo: 'copa', calendario: 'europeu' }
    ]
  },
  {
    id: 'pt', nome: 'Portugal', bandeira: 'pt', competicoes: [
      { id: 'por.1', nome: 'Primeira Liga', tipo: 'liga', calendario: 'europeu', desempate: ['pontos', 'saldo', 'gp'],
        zonas: [faixa(1, 2, 'ucl'), faixa(3, 3, 'uel'), faixa(4, 4, 'uecl'), faixa(16, 16, 'playoff'), faixa(17, 18, 'reb')] },
      { id: 'por.taca.portugal', nome: 'Taça de Portugal', tipo: 'copa', calendario: 'europeu' }
    ]
  }
];

const bandeiraUrl = p => `https://flagcdn.com/w40/${p.bandeira}.png`;

const acharCompeticao = id => {
  for (const p of PAISES) for (const c of p.competicoes) if (c.id === id) return { pais: p, comp: c };
  return null;
};
