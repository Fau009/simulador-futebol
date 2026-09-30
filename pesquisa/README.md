# Pesquisa do algoritmo de previsão

Scripts usados para calibrar e validar o `js/previsao.js` com teste retroativo: cada jogo é previsto só com os jogos anteriores a ele.

```bash
node pesquisa/baixar.cjs    # baixa 2021–2027 de 8 ligas (BR A/B, ING 1/2, ESP, ITA, ALE, POR) → dados.json
node pesquisa/gerar.cjs     # roda o motor para cada jogo de 2023–2025 → registros.json
node pesquisa/fase1.cjs     # Dixon-Coles, sinais de zebra, índice "à mão", perfis
node pesquisa/fase2.cjs     # Elo, conjunto, binomial negativa, zebra aprendida (regressão logística)
node pesquisa/fase2b.cjs    # busca ampliada de parâmetros do Elo e do peso do conjunto
node pesquisa/fase3.cjs     # retreino da zebra com o modelo final e métricas dos perfis (teste 2025)
node pesquisa/validar.cjs   # valida o código real do site com 2, 3 e 4 temporadas de histórico
```

## Principais resultados (8.695 jogos de 2023–2025)

| Etapa | Log-loss do resultado (menor é melhor) |
|---|---|
| Poisson (gols esperados) | 1,0228 |
| Dixon-Coles (ρ = −0,06) | 1,0224 |
| Elo sozinho (K=10, mando 60) | 1,0065 |
| **Conjunto 20% Dixon-Coles + 80% Elo** | **1,0048** |
| Binomial negativa (r = 5 a 40) | 1,0230 a 1,0251 (não ajudou) |

- **Conjunto e Elo:** o conjunto ganhou do Dixon-Coles sozinho nas 8 ligas.
- **Sinais de zebra:** volatilidade, imprevisibilidade, forma, descanso e confronto direto, com pesos aprendidos em 2023–2024 e testados em 2025, ficaram praticamente zerados. A log-loss da zebra foi 0,5293 com o modelo sozinho e 0,5292 com a regressão. O índice mostrado no site é essa regressão, que na prática é a chance do azarão levemente recalibrada.

Perfis (teste 2025, 2.901 jogos; real: 44% mandante, 27% empate, 29% visitante, 2,62 gols por jogo):

| Perfil | Acerto | Mandante / Empate / Visitante previstos | Gols por jogo |
|---|---|---|---|
| Conservador | 49,5% | 73 / 0 / 27% | 1,60 |
| Moderado | 47,3% | 57 / 26,5 / 17% | 1,62 |
| Arriscado | 48,4% | 62 / 14 / 23% | 2,46 |

No perfil Arriscado, as apostas em zebra (12% dos jogos) acertaram 35,8%, contra 33,2% esperados.
