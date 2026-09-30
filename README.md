# Simulador de Futebol

Tabelas, jogos, artilharia e destaques dos campeonatos de 6 países, com um **modo simulador**: você digita (ou sorteia) placares dos próximos jogos, ou altera resultados já disputados, e a tabela é recalculada na hora.

🔗 **Site:** https://fau009.github.io/simulador-futebol/

## Campeonatos

| País | Campeonatos |
|---|---|
| 🇧🇷 Brasil | Brasileirão Série A, Série B, Copa do Brasil, Paulistão, Carioca |
| 🏴 Inglaterra | Premier League, Championship, FA Cup, Carabao Cup |
| 🇪🇸 Espanha | La Liga, La Liga 2, Copa do Rei |
| 🇩🇪 Alemanha | Bundesliga, 2. Bundesliga, DFB-Pokal |
| 🇮🇹 Itália | Serie A, Serie B, Copa da Itália |
| 🇵🇹 Portugal | Primeira Liga, Taça de Portugal |

## O que tem

- **Tabela**: pontos, jogos, vitórias, empates, derrotas, gols, saldo, aproveitamento, últimos 5 jogos e faixas de classificação (Libertadores, Champions, rebaixamento etc.).
- **Chaves** (copas): fases do mata-mata com jogos de ida e volta, placar agregado e pênaltis.
- **Jogos**: próximos, realizados ou todos, com filtro por time. Ao clicar num jogo aparecem os gols (autor e minuto), os cartões e o estádio.
- **Artilharia e assistências**.
- **Destaques**: melhor ataque e defesa, mais vitórias, invencibilidade, melhor mandante e visitante, jejum, cartões, maior goleada, média de gols e percentual de vitórias de mandante e visitante.
- **Modo simulador**:
  - digite placares nos jogos futuros, ou altere resultados já disputados, e veja a tabela mudar (no desktop, a tabela fica ao lado dos jogos);
  - **🎲 Sortear jogos restantes**: preenche os jogos sem placar com resultados prováveis (Poisson, pela força de ataque e defesa de cada time na temporada);
  - **📊 Calcular chances**: simula o restante do campeonato 3.000 vezes e mostra a chance de título e de cada faixa da tabela;
  - nas copas, os placares definem quem avança, e o empate no agregado pede o vencedor nos pênaltis.
- Tema claro e escuro, e versão mobile.

## Como funciona

Não tem servidor nem banco de dados: é só a página.
- **Dados:** vêm da API pública da ESPN (não oficial), buscados direto pelo navegador.
- **Cache:** ficam guardados no `localStorage` por 30 minutos. O botão **Recarregar** busca de novo. Sem internet, o site mostra o último cache.
- **Simulações:** ficam salvas só no seu navegador, separadas por campeonato e temporada.

```
index.html
css/estilo.css
js/competicoes.js  # países, campeonatos, zonas da tabela e critérios de desempate
js/dados.js        # busca na ESPN, normalização e cache
js/calculo.js      # tabela com simulação, forma, artilharia, destaques, chaves e Monte Carlo
js/app.js          # interface
```

Para rodar localmente, sirva a pasta com qualquer servidor estático (ex.: `npx http-server .`).

## Limitações

- **Fonte não oficial:** a API da ESPN não é oficial e pode mudar sem aviso.
- **Zonas de classificação:** são uma referência aproximada, porque o regulamento muda a cada temporada.
- **Desempate:** usa pontos, vitórias (no Brasil), saldo e gols pró. Confronto direto não é considerado.
- **Copas:** as fases seguintes só aparecem depois do sorteio oficial. Antes disso, os jogos mostram "A definir" e não podem ser simulados.
- **Fora da fonte:** a segunda divisão e a copa da liga de Portugal não estão disponíveis.
