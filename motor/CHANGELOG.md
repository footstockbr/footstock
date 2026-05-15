# Motor Changelog

## [Unreleased] - 2026-05-14 Reconciliacao Legacy

Reconciliacao legacy vs deployed: 12 decisoes implementadas atraves de 3 ondas
de scheduler (Wave 1 Financial, Wave 2 Operational, Wave 3 Observability) +
hardening de parametros canonicos.

Tag de release: `motor-reconciliation-2026-05-14`.

### Hardening de parametros

- **leader TTL = 30000ms**: alinhado deployed (legacy usava valor menor; deployed
  usa 30s confirmado em producao).
- **circuit-breaker comment fix**: corrigido comentario do header do CB para
  refletir politica deployed.
- **regional-correlation removida**: feature legacy nao usada em producao;
  removida do motor para alinhar com deployed.
- **rss-fetch-interval = 10min**: alinhado com cadencia deployed (legacy
  divergia).
- **gate stop-loss/take-profit**: gate ativo no motor reflete comportamento
  deployed.
- **agent counts -50pct**: reducao de 50% nas contagens de agentes para
  alinhar com capacidade real de producao.
- **nudge ticks = 150 (priceCalc)**: parametro do priceCalc alinhado com
  deployed.

### ADR + classificacao

- **ADR-004 long-leverage = lenda**: registrado em `docs/adrs/` que long
  leverage e lenda urbana; comunicar cliente fora deste loop.
- **classify orphan cron jobs**: classificacao dos jobs orfaos entre keep,
  migrate, drop (input das 3 ondas).

### Wave 1 - Financial (Option C: cronProxy HTTP)

7 jobs migrados de scheduler standalone para Option C - motor-as-orchestrator
HTTP via `cronProxy.ts`. Cada stub executa `await cronProxy(name)` que faz
fetch autenticado para `${FOOTSTOCK_NEXT_BASE_URL}/api/cron/${name}` com
`Authorization: Bearer ${CRON_SECRET}`.

- `subscription-expiry`
- `dunning`
- `monthly-dividends`
- `interest-accrual`
- `credit-dividends`
- `expire-dividends`
- `bonus-credit`

Helper novo em `src/scheduler/cronProxy.ts`. `.env.example` atualizado com
`FOOTSTOCK_NEXT_BASE_URL` e `CRON_SECRET`. `subscriptionExpiry.test.ts`
reescrito para padrao Option C. Type-check + 14/14 testes scheduler passando.

### Wave 2 - Operational (Option C)

3 jobs migrados para `cronProxy`:

- `cancellation-lock`
- `order-expiry` (idempotencia preservada: rota Next ja arbitra com watcher
  implicito do MarketEngine; cron-proxy nao introduz duplicata, so dispara o
  handler).
- `data-retention` (timezone preservado: rota Next resolve em
  `America/Sao_Paulo`; motor herda automaticamente via proxy).

### Wave 3 - Observability (Option C)

2 jobs migrados para `cronProxy`:

- `scoring`
- `nsm` (apiVersion v1 -> rota canonica em `/api/v1/cron/nsm` com
  `runNSMReport()` / INT-115 / module-27 / TASK-3).

`scoring.test.ts` e `nsm.test.ts` criados. `cronProxy.test.ts` cobre
apiVersion v0 e v1, env missing, non-2xx, timeout, trailing slash.

### Pending actions (operacionais, fora deste loop)

- `FS-SCHED-W1-2026-05-15` / `FS-SCHED-W2-2026-05-15` /
  `FS-SCHED-W3-2026-05-15`: cutover Railway por job (env vars no motor,
  staging 48h por wave, flag `NEXT_PUBLIC_MOTOR_CRON_ACTIVE=410` para desligar
  cron handler do Next quando motor assumir, dashboard de health do nsm).
- Comunicar cliente sobre lenda de long leverage (ADR-004).
