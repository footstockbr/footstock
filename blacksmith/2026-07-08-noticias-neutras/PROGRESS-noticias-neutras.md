# PROGRESS — delegacao noticias-neutras (footstock.com.br/noticias)

Documento-base: sintoma reportado pelo operador (todas as noticias com badge "Neutro" em prod) + `MISSION-onda1-diagnostico.md`
Tasklist alvo: este diretorio (`blacksmith/2026-07-08-noticias-neutras/`)
Iniciado em: 2026-07-08
Analista: analista-delegador-rules v1.0.0 (executor delegado: /mcp:codex persona code-debugger)

## Itens

- [x] Mapear cadeia de classificacao de sentimento (UI -> cron -> classifier -> provider)
  > sinal: noticias-content.tsx:134 (badge NEUTRAL default), route.ts do cron (sentiment_classified_at IS NULL), NewsSentimentClassifier.ts (max_tokens:8, null em falha), ai-provider.ts (AI_PROVIDER default kimi), scheduler index.ts:86 (*/15)
- [x] Catalogar hipoteses S1..S5
  > sinal: S1 key invalida no web; S2 max_tokens:8 truncado; S3 billing/circuit; S4 cron nao roda (CRON_SECRET/scheduler); S5 vies NEUTRAL do modelo
- [x] Localizar credenciais ORCH para debug em prod
  > sinal: .claude/projects/foot-stock.json > credentials.railway (project token, services map) + credentials.database.primary (proxy tramway 39979)
- [x] Onda 1 — diagnostico em producao (env Railway, DB, smoke Kimi, cron manual, logs)
  > delegado: 2026-07-08 agente=/mcp:codex persona=code-debugger missao=MISSION-onda1-diagnostico.md
  > retorno: session 0e070a05ac4ae9dd (thread 019f43c3-1e1b-7b43-8ac6-277ee23646b6), artifact .claude/mcp-codex-sessions/0e070a05ac4ae9dd.json
  > veredito: S2 CONFIRMADA (kimi-for-coding emite thinking antes do text; max_tokens:8 e 64 cortam antes do bloco text -> parse null -> failed -> NEUTRAL default). S1/S3/S4/S5 REFUTADAS com evidencia (env ok, HTTP 200, sem billing, cron roda 15min, cron manual failed=3)
  > numeros DB: BULLISH=1152 BEARISH=907 NEUTRAL=8316; classified=8436 pending=1939; ultimos 20 publicados todos NEUTRAL/pendentes
- [x] Onda 2 — fix conforme causa raiz (depende da Onda 1)
  > delegado: 2026-07-08 agente=/mcp:codex persona=code-debugger (turno 2, mesma thread) missao=MISSION-onda2-fix.md
  > aprovacao: operador humano aprovou "fix completo nos 2 classificadores" via AskUserQuestion
  > retorno: commit f2bc0d95 (verificado pelo analista: 4 files, max_tokens provider-aware NEWS_SENTIMENT_MAX_TOKENS 256-kimi/16-anthropic + NEWS_CLASSIFIER_MAX_TOKENS 512-kimi/150-anthropic + content.find(text) no motor + timeout cron 300s + teste thinking-antes-de-text)
  > validacao local: tsc limpo x2, ai-provider 8/8, NewsClassifier 28/28
  > deploy: GH Actions Motor Deploy + Deploy Railway Web ambos success; Railway web/motor SUCCESS
  > validacao prod: cron manual limit=3 -> classified=3 failed=0 (1 BULLISH, 2 NEUTRAL genuinos); DB last_classified=2026-07-08 22:32:35; backlog 1938 drena ~16h no cron */15
  > rollback: git revert f2bc0d95

## Sumario de delegacao

- Total de itens catalogados: 5
- Delegados: 2 (Onda 1 diagnostico + Onda 2 fix)
- Retornados fechados: 2
- Parciais: 0
- Em aberto para proxima rodada: 0 (backlog de 1938 pendentes drena sozinho via cron */15; conferir a aba /noticias em ~16h)
