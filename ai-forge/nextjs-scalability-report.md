# FootStock — Scalability Report

> Gerado por `/nextjs:scalability` em 2026-04-02
> Config: `.claude/projects/foot-stock.json`
> Stack: Next.js + Prisma + Supabase/pgBouncer + Upstash Redis + Vercel

---

## Comandos de busca usados

```bash
grep -rn "Promise.all\|Promise.allSettled" output/workspace/foot-stock --include="*.ts" --include="*.tsx"
grep -rn "executeRaw" output/workspace/foot-stock --include="*.ts" --include="*.tsx"
grep -rn "new Map()\|new Set()" output/workspace/foot-stock/app output/workspace/foot-stock/lib --include="*.ts"
grep -rn "fs\.writeFile\|writeFile\|fs\.readFile" output/workspace/foot-stock --include="*.ts"
grep -rn "circuit\|CircuitBreaker\|withRetry\|retry" output/workspace/foot-stock --include="*.ts" -i
grep -rn "await fetch(" output/workspace/foot-stock --include="*.ts" | grep -v "AbortSignal\|signal\|timeout"
grep -rn "skip:\|offset:" output/workspace/foot-stock/app/api output/workspace/foot-stock/lib --include="*.ts"
grep -rn "console\.log\|console\.error\|console\.warn" output/workspace/foot-stock --include="*.ts"
```

---

## Resumo Executivo

| Categoria | Status |
|-----------|--------|
| Multi-tenancy | N/A — app single-tenant |
| Resiliência (circuit breaker) | ✅ Domínio (market engine) |
| Resiliência (fetch timeout) | ⚠️ 1 gateway sem timeout (corrigido) |
| Resiliência (retry/backoff) | ℹ️ Não implementado — aceitável para escala atual |
| Horizontal Scaling (stateless) | ⚠️ DataExport usa tmpdir efêmero |
| Connection Pooling | ✅ pg.Pool(max:10) + pgBouncer |
| Bulk Operations | ⚠️ 2 jobs sem BATCH_SIZE (corrigido) |
| Background Jobs / Cron | ✅ 12 crons configurados no vercel.json |
| API Pagination | ⚠️ Offset-based (aceitável na escala atual) |
| Observability | ✅ Health checks + Sentry; sem OpenTelemetry |
| Structured Logging | ⚠️ 165 console.* nos jobs |
| Cache Distribuído | ✅ Upstash Redis (ratelimit, pub/sub, banners) |

---

## Achados Detalhados

### ✅ O que está bem

**Connection Pooling**
- `lib/prisma.ts` usa `pg.Pool({ max: 10 })` + `PrismaPg` adapter
- `DATABASE_URL` usa endpoint de pooling Supabase (`pooler.supabase.com:6543?pgbouncer=true`)
- `DIRECT_URL` disponível para migrations (`5432`)

**Health Checks**
- `/api/v1/health` — básico (db + redis + motor) com latência
- `/api/v1/health/detailed` — com `DetailedStatus` e `ALERT_RULES`
- Timeouts individuais por serviço via env vars

**Resiliência nos Gateways de Pagamento**
- PayPal: `AbortSignal.timeout(GATEWAY_TIMEOUT_MS)` em todas as chamadas
- MercadoPago: `AbortController` com `GATEWAY_TIMEOUT_MS`
- PagSeguro: `AbortSignal.timeout(GATEWAY_TIMEOUT_MS)`
- PIX checkout: `AbortSignal.timeout(8000)`
- Constante `GATEWAY_TIMEOUT_MS = 5_000` centralizada em `lib/constants/payment-security.ts`

**Cron Jobs**
- 12 crons no `vercel.json` com schedule correto
- Todos autenticados por `CRON_SECRET` via header `Authorization: Bearer`
- `maxDuration: 30s` para crons

**Circuit Breaker (domínio)**
- `CIRCUIT_BREAKER_THRESHOLD = 0.08` e `CIRCUIT_BREAKER_HALT_DURATION = 300_000` definidos
- Captura Sentry de ativações via `captureCircuitBreakerAlert()`

**Idempotency**
- PIX checkout usa `X-Idempotency-Key: subscriptionId`
- Jobs verificam estado antes de processar (e.g. `bonusCreditedAt IS NULL`)

---

### ⚠️ Achados e Ações

#### [CORRIGIDO] T001 — `flagcheck.ts` sem timeout
**Arquivo:** `lib/age-verification/flagcheck.ts:26`
**Risco:** ALTO — sem timeout, um hang na API FlagCheck bloqueia o fluxo de verificação de idade indefinidamente (ECA Digital compliance)
**Fix:** Adicionado `signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS)` importando de `@/lib/constants/payment-security`

#### [CORRIGIDO] T002 — `credit-dividends`: `Promise.allSettled` sem BATCH_SIZE
**Arquivo:** `lib/jobs/credit-dividends.ts:33`
**Risco:** ALTO — N dividendos em `Promise.allSettled`, cada um abrindo `$transaction` Prisma. Com pgBouncer transaction mode (~20-25 conns) e `pg.Pool(max:10)`, um batch de 30+ itens pode saturar conexões e causar updates parciais ou timeouts
**Fix:** Processamento em lotes de `BATCH_SIZE = 10` via `for` com `Promise.allSettled` por batch

#### [CORRIGIDO] T003 — `interest-accrual`: loop sequencial sem batching
**Arquivo:** `lib/jobs/interest-accrual.ts:31`
**Risco:** MÉDIO — `for...of` sequencial em todas as posições SHORT abertas. Com crescimento da plataforma, pode atingir `maxDuration: 30s` do Vercel Cron
**Fix:** Processamento em batches de 10 com `Promise.allSettled` por batch

#### [CORRIGIDO] T006 — `vitals`: 6 comandos Redis sequenciais (via `.then()`)
**Arquivo:** `app/api/v1/vitals/route.ts:55`
**Risco:** BAIXO — 6 round-trips Redis em vez de 1 pipeline por requisição de vital
**Fix:** Substituído por `redis.pipeline()` com todos os 6 comandos

#### [PENDENTE] T004 — `DataExportService`: filesystem local em ambiente serverless
**Arquivo:** `lib/services/DataExportService.ts:114`, `app/api/v1/users/me/export/download/route.ts:58`
**Risco:** MÉDIO — `os.tmpdir()` é efêmero e isolado por instância no Vercel. Download pode bater em instância diferente da que gerou o arquivo e retornar 404
**Ação:** Migrar para Supabase Storage ou S3/R2 com URL assinada. Requer decisão de infra.

#### [PENDENTE] T005 — 165 `console.*` nos jobs (sem logger estruturado)
**Risco:** BAIXO — logs não agregáveis, dificulta troubleshooting em produção
**Ação:** Criar `lib/logger.ts` (pino ou similar) e substituir nos jobs

#### [INFO] Paginação offset-based
**Arquivos:** `lib/repositories/order.repository.ts`, `lib/repositories/transaction.repository.ts`, `app/api/v1/news/route.ts`, `app/api/v1/affiliate/me/route.ts`
**Risco:** BAIXO agora, MÉDIO a longo prazo — `skip: (page-1)*pageSize` degrada em tabelas com milhões de rows
**Ação:** Monitorar. Migrar para cursor-based pagination quando tabelas orders/transactions crescerem.

---

## Métricas

| Métrica | Valor |
|---------|-------|
| Arquivos analisados | ~80 |
| Achados críticos | 1 (T001 — flagcheck sem timeout) |
| Achados de pool saturation | 2 (T002, T003 — sem BATCH_SIZE) |
| Achados de estado local | 1 (T004 — DataExport tmpdir) |
| Fixes aplicados | 4 (T001, T002, T003, T006) |
| console.* não estruturados | 165 |
| $executeRawUnsafe encontrados | 0 |
| fetch sem timeout | 1 → corrigido |
| cron jobs configurados | 12 |
