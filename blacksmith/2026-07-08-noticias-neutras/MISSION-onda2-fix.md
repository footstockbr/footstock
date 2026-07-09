# Missão Onda 2 — Fix completo nos 2 classificadores (aprovado pelo operador)

## mission

O operador aprovou o fix completo. Você agora é o EXECUTOR. Aplique a correção mínima nos DOIS classificadores, valide localmente, faça commit + push na main (Trunk-Based, deploy automático via GH Actions) e valide em produção com o cron manual. Reporte cada passo com evidência real (comando + saída).

## escopo do fix (mínimo, sem refactor adjacente)

1. `footstock-next/src/lib/services/NewsSentimentClassifier.ts`:
   - Trocar `max_tokens: 8` por valor provider-aware: >=256 quando provider ativo for Kimi (evidência da Onda 1: 256 retornou text), mantendo 8 (ou 16) no Anthropic. Preferir helper/env override `NEWS_SENTIMENT_MAX_TOKENS` com default provider-aware, seguindo o estilo do arquivo.
   - Adicionar log seguro (console.warn) quando a resposta vier sem bloco `text` (registrar stop_reason + tipos de blocos, NUNCA conteúdo).
2. `motor/src/news/NewsClassifier.ts`:
   - O parse em ~linha 395 lê `response.content[0]` — com Kimi o bloco [0] é `thinking`. Trocar por busca do primeiro bloco `type === 'text'` (mesmo padrão do next).
   - `max_tokens: 150` é insuficiente com thinking: elevar de forma provider-aware (sugestão >=512 no Kimi; valide com um smoke real do payload JSON do motor usando a key de prod antes de fixar o número; se o smoke mostrar que precisa mais, use o valor medido + margem).
   - NÃO mexer na lógica de prompt caching / countTokens / rate limit / retry.
3. Cron/latência: o cronProxy do motor tem timeout default 60s e a rota processa até 30 notícias sequenciais; com thinking a latência por item sobe. Ajuste mínimo: no job `motor/src/scheduler/jobs/classifyNewsSentiment.ts`, passar `timeoutMs` maior via options do cronProxy (ex: 300_000) OU reduzir o batch via query `?limit=10` na URL do proxy — escolha UMA opção, a de menor superfície, e justifique.

## validação local (obrigatória antes do commit)

- `tsc` limpo nos dois pacotes (footstock-next e motor, cada um tem seu node_modules).
- Rodar os testes existentes dos arquivos tocados: `motor` -> suite de NewsClassifier; `footstock-next` -> testes unit que cubram NewsSentimentClassifier/ai-provider se existirem. Registrar resultado real; se um teste existente quebrar por causa do novo default, ajustar o TESTE apenas se ele fixava o valor antigo de max_tokens (comportamento, não contrato).

## commit + deploy

- Workspace `output/workspace/foot-stock` é o repo git (remote footstockbr/footstock, branch main). PROIBIDO criar branch.
- Commit único no padrão do repo, ex: `fix(news): max_tokens provider-aware p/ Kimi thinking blocks nos 2 classificadores`.
- Push na main dispara GH Actions `deploy.yml` (web, paths footstock-next/**) e `motor-deploy.yml` (motor, gate npm test). Como o commit toca os dois paths, os DOIS workflows devem disparar. Acompanhe via `gh run list/watch` até success. Se o push falhar por auth, use credentials.github de `.claude/projects/foot-stock.json` (nunca imprimir token) ou reporte bloqueio.

## validação em produção (critério de aceite)

1. Aguardar deploy dos DOIS serviços (GH Actions success + Railway ativo).
2. Cron manual: `curl -s -H "Authorization: Bearer <CRON_SECRET>" "https://www.footstock.com.br/api/cron/classify-news-sentiment?limit=3"` -> aceite: `classified=3, failed=0` (ou classified>0 com failed=0).
3. DB: confirmar `sentiment_classified_at` recente e sentiment != NEUTRAL em pelo menos 1 das 3 (se as 3 manchetes forem genuinamente neutras, rodar mais uma rodada limit=5).
4. Registrar que o backlog de ~1939 pendentes drena a 30/rodada a cada 15min (~16h). NÃO drenar manualmente em massa sem pedido do operador (custo Kimi).

## constraints

- pt-BR, sem emojis; máscara de secrets {first10}***{last4}; nunca gravar secret em arquivo.
- Correção mínima: não refatorar nada além do escopo acima.
- Se qualquer gate falhar (tsc, teste, deploy, aceite), PARE nesse ponto e reporte o bloqueio com evidência; não improvise fix adicional fora do escopo sem reportar.

## formato do entregável

```
## EXECUÇÃO
- diff resumido por arquivo (paths + o que mudou)
- validação local: comandos + resultados reais
- commit sha + push + status dos 2 workflows GH Actions
## VALIDAÇÃO PROD
- JSON do cron manual (antes/depois se útil)
- query DB com as linhas recém-classificadas (títulos truncados + sentiment)
## PENDÊNCIAS/RISCOS
- o que ficou de fora, riscos residuais, rollback (sha para revert)
```
