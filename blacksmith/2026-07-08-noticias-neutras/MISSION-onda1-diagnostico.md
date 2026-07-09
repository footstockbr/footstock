# Missão Onda 1 — Diagnóstico: por que TODAS as notícias em footstock.com.br/noticias estão "Neutro"

## mission

Você é o EXECUTOR/DEBUGGER desta investigação. Verifique EM PRODUÇÃO por que 100% das notícias exibidas em https://www.footstock.com.br/noticias aparecem com badge "Neutro". A suspeita do operador é que a API do Kimi não está vinculada corretamente em produção. Produza um veredito baseado em EVIDÊNCIA COLETADA (não em leitura de código apenas) para cada hipótese S1..S5 abaixo, aponte a causa raiz e recomende o fix. NÃO aplique nenhum fix nesta onda; apenas diagnostique. A única escrita permitida em produção é o disparo manual do cron com `?limit=3` (efeito: classifica até 3 notícias, inócuo e diagnóstico).

## contexto da arquitetura (já mapeado pelo analista; confie mas re-verifique nos anchors)

- Workspace: `output/workspace/foot-stock` (relativo à raiz do repo systemForge onde você está).
- UI: `footstock-next/src/app/(app)/noticias/noticias-content.tsx:134` — badge do enum `news.sentiment` (`BULLISH|BEARISH|NEUTRAL`, default do schema = NEUTRAL, label "Neutro").
- Classificação forward+backfill: motor (Railway service `motor`) agenda `classify-news-sentiment` a cada 15min (`motor/src/scheduler/index.ts:86`) → `cronProxy` faz GET autenticado `Bearer CRON_SECRET` em `{FOOTSTOCK_NEXT_BASE_URL}/api/cron/classify-news-sentiment` (`motor/src/scheduler/cronProxy.ts`).
- A route (`footstock-next/src/app/api/cron/classify-news-sentiment/route.ts`) pega até 30 notícias com `sentiment_classified_at IS NULL` e chama `classifyNewsSentiment()`.
- `footstock-next/src/lib/services/NewsSentimentClassifier.ts` — chamada via @anthropic-ai/sdk com `max_tokens: 8`, espera UMA palavra (BULLISH/BEARISH/NEUTRAL). Retorna `null` em: sem API key (`hasAIKey()` false, SILENCIOSO), circuit breaker de crédito aberto (10min), erro HTTP, timeout 20s, resposta não-parseável. `null` = notícia não marcada, fica NEUTRAL default na UI.
- Provider: `footstock-next/src/lib/services/ai-provider.ts` — `AI_PROVIDER` default `kimi`; usa `KIMI_API_KEY` + `KIMI_BASE_URL` (default `https://api.kimi.com/coding`) + `KIMI_MODEL` (default `kimi-for-coding`). O SDK adiciona `/v1/messages` ao baseURL; auth via header `x-api-key`.
- Quem executa a chamada LLM é o serviço WEB (a route roda no next), não o motor.
- O motor tem um classificador separado (`motor/src/news/NewsClassifier.ts`, sentiment numérico para preço) — NÃO é o que alimenta o badge da aba notícias; ignore-o exceto se os logs mostrarem falha correlata de provider.

## hipóteses a confirmar/refutar (cada uma com evidência de produção)

- S1: `KIMI_API_KEY` ausente/inválida/rotacionada no Railway service `web` → `hasAIKey()` false ou 401 → null silencioso.
- S2: `kimi-for-coding` com `max_tokens: 8` devolve resposta truncada/vazia/sem text block (ex: modelo reasoning ou verboso) → `parseSentiment` null → `failed` em toda rodada.
- S3: Billing/limite da conta Kimi → erro "credit balance/billing" → circuit breaker abre → null.
- S4: Cron nunca executa com sucesso: scheduler do motor parado, `CRON_SECRET` divergente entre motor e web (401), ou `FOOTSTOCK_NEXT_BASE_URL` errado.
- S5: Pipeline funciona, mas o modelo devolve NEUTRAL para quase tudo (viés do prompt "Na dúvida, NEUTRAL" e/ou fraqueza do kimi-for-coding fora de código). Distinguível: `sentiment_classified_at` preenchido em massa com sentiment NEUTRAL.

## credenciais e acessos (ORCH — leia você mesmo os valores; NUNCA imprima segredos em claro, máscara {first10}***{last4})

- Arquivo: `.claude/projects/foot-stock.json` (raiz do repo systemForge), chave `credentials`:
  - `credentials.railway.api_token.value` = RAILWAY_TOKEN (token de PROJETO: funciona para `railway variables`/GraphQL, NÃO para `railway whoami`). `credentials.railway.services` mapeia ids: web=ae3d2626…, motor=451e1621…, postgres, redis. project_id e environment_id (production) também estão lá.
  - `credentials.database.primary.url.value` = DATABASE_URL via proxy público `tramway.proxy.rlwy.net:39979` (sslmode=disable funciona; user footstock, db footstock).
- `CRON_SECRET`: obtenha via variables do Railway (service web ou motor).
- Fallback local (para comparação apenas): `output/workspace/foot-stock/.env` tem KIMI_API_KEY local — a de PROD pode divergir; a fonte da verdade para o smoke é a var do Railway service web.
- Railway CLI pode estar disponível no PATH; se não, use a GraphQL API `https://backboard.railway.app/graphql/v2` com header `Project-Access-Token: <token>` (para project token) — teste primeiro `railway variables --service <id>` com env `RAILWAY_TOKEN`.

## passos de coleta (ordem sugerida)

1. ENV PROD: liste as variables dos services `web` e `motor` (env production). Registre presença/máscara de: `AI_PROVIDER`, `KIMI_API_KEY`, `KIMI_BASE_URL`, `KIMI_MODEL`, `ANTHROPIC_API_KEY`, `CRON_SECRET`, `FOOTSTOCK_NEXT_BASE_URL`, `NEWS_SENTIMENT_MODEL`. Compare CRON_SECRET web vs motor (hash/primeiros chars, não o valor).
2. DB: via psql no proxy público, colete:
   - `SELECT sentiment, COUNT(*) FROM news GROUP BY sentiment;`
   - `SELECT COUNT(*) FILTER (WHERE sentiment_classified_at IS NOT NULL) AS classified, COUNT(*) FILTER (WHERE sentiment_classified_at IS NULL) AS pending, MAX(sentiment_classified_at) AS last_classified FROM news;`
   - Distribuição de sentiment APENAS entre classificadas: `SELECT sentiment, COUNT(*) FROM news WHERE sentiment_classified_at IS NOT NULL GROUP BY sentiment;`
   - Amostra: `SELECT id, left(title,70) AS title, sentiment, sentiment_classified_at, published_at FROM news ORDER BY published_at DESC LIMIT 20;`
   - Atenção ao nome real das colunas (Prisma pode mapear camelCase → snake_case; verifique `prisma/schema.prisma` do workspace se a query falhar; a tabela pode ser "news" ou mapeada).
3. SMOKE KIMI (chave de PROD do service web): reproduza a chamada EXATA do classifier via curl:
   - POST `{KIMI_BASE_URL}/v1/messages`, headers `x-api-key: <key>`, `anthropic-version: 2023-06-01`, `content-type: application/json`.
   - Body: `{"model":"<KIMI_MODEL>","max_tokens":8,"system":"<prompt de sentimento resumido — use o SYSTEM_PROMPT real de NewsSentimentClassifier.ts>","messages":[{"role":"user","content":"Titulo: Flamengo vence o classico e assume a lideranca do Brasileirao\n\nSentimento:"}]}`
   - Registre: HTTP status, corpo COMPLETO (content blocks, stop_reason, usage). Se vier vazio/truncado/erro, repita com `max_tokens: 64` e compare — isso separa S2 de S1/S3.
   - Se 401/403: registre o corpo do erro (S1). Se mensagem de billing: S3.
4. CRON MANUAL: `curl -s -H "Authorization: Bearer <CRON_SECRET>" "https://www.footstock.com.br/api/cron/classify-news-sentiment?limit=3"` — registre o JSON (scanned/classified/bullish/bearish/neutral/failed/remaining). `failed=3` confirma falha na chamada LLM; `classified=3, neutral=3` aponta S5; 401 aponta CRON_SECRET errado no seu teste (pegue o do web).
5. LOGS (se o tempo permitir): deployment logs recentes do service web procurando `[NewsSentimentClassifier]` e `CIRCUIT_OPEN`; do motor procurando `classify-news-sentiment` e `[ALERT]`. Via CLI `railway logs` ou GraphQL. Se inacessível com project token, registre a limitação e siga.

## formato do entregável (anexe ao final da sua resposta)

```
## VEREDITO
- Causa raiz: <1-3 frases>
- S1: CONFIRMADA|REFUTADA|INCONCLUSIVA — evidência: <...>
- S2: ... (idem para S3, S4, S5)

## EVIDÊNCIAS
- ENV web: <tabela var=presente/mascarado>
- ENV motor: <idem>
- DB: <números coletados>
- Smoke Kimi: <status + stop_reason + texto retornado, max_tokens 8 vs 64>
- Cron manual: <JSON retornado>
- Logs: <linhas relevantes ou "inacessível">

## FIX RECOMENDADO
- <mudança mínima, arquivo:linha quando código; var quando env; NÃO aplicar>
- Risco/rollback: <1 frase>
```

## constraints (não-negociáveis)

- Idioma pt-BR; sem emojis.
- NUNCA imprimir segredo em claro (máscara {first10}***{last4}); nunca gravar segredo em arquivo novo.
- Nenhuma alteração em produção (env/DB/deploy) nesta onda; exceção única: o cron manual `?limit=3`.
- Nenhum `git checkout -b` / branch nova (Trunk-Based Always Main).
- Não editar código nesta onda; o fix é da Onda 2 após aprovação do analista.
- Se um acesso falhar (ex: logs), registre a limitação e continue com o resto; não trave a missão inteira.
