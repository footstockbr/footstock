# FootStock — Scalability Tasks

> Gerado por `/nextjs:scalability` em 2026-04-02
> Workspace: `output/workspace/foot-stock`
> Config: `.claude/projects/foot-stock.json`

---

## T001 — Adicionar timeout em `flagcheck.ts`

**Tipo:** SEQUENTIAL
**Dependências:** none
**Prioridade:** ALTA
**Status:** PENDING

**Arquivos:**
- modificar: `lib/age-verification/flagcheck.ts`

**Descrição:**
`checkAge()` chama `fetch()` sem `signal`, sem `AbortController` e sem timeout. Se a API FlagCheck ficar lenta ou cair, a função trava indefinidamente bloqueando o fluxo de verificação de idade. Adicionar `AbortSignal.timeout(GATEWAY_TIMEOUT_MS)` igual ao padrão dos outros gateways.

**Evidência:**
```bash
# lib/age-verification/flagcheck.ts:26
const response = await fetch(`${apiUrl}/verify`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
  body: JSON.stringify({ cpfHash }),
  // ← sem signal/timeout
})
```

**Critérios de Aceite:**
- [ ] `fetch` inclui `signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS)`
- [ ] Import `GATEWAY_TIMEOUT_MS` de `@/lib/constants/payment-security`
- [ ] Build sem erros

**Estimativa:** 15min

---

## T002 — Adicionar BATCH_SIZE em `credit-dividends` job

**Tipo:** SEQUENTIAL
**Dependências:** none
**Prioridade:** ALTA
**Status:** PENDING

**Arquivos:**
- modificar: `lib/jobs/credit-dividends.ts`

**Descrição:**
`creditReadyDividends()` usa `Promise.allSettled(readyDividends.map(...))` sem limite de concorrência. Cada item abre uma `$transaction` Prisma que ocupa uma conexão do pool. Com Supabase pgBouncer (transaction mode, ~20-25 conns) e `pg.Pool(max:10)`, um batch grande pode saturar o pool e causar updates parciais ou timeouts.

Implementar processamento em lotes com `BATCH_SIZE = 10`.

**Evidência:**
```bash
# lib/jobs/credit-dividends.ts:33
const results = await Promise.allSettled(
  readyDividends.map(async (dividend) => {
    await prisma.$transaction(async (tx) => { ... }) // N conexões simultâneas
  })
)
```

**Critérios de Aceite:**
- [ ] Constante `BATCH_SIZE = 10` definida
- [ ] Loop processa em lotes: `for (let i = 0; i < readyDividends.length; i += BATCH_SIZE)`
- [ ] `Promise.allSettled` aplicado apenas ao lote atual
- [ ] Comportamento de `credited`/`failed` preservado
- [ ] Build sem erros

**Estimativa:** 30min

---

## T003 — Adicionar BATCH_SIZE em `interest-accrual` job

**Tipo:** SEQUENTIAL
**Dependências:** none
**Prioridade:** MÉDIA
**Status:** PENDING

**Arquivos:**
- modificar: `lib/jobs/interest-accrual.ts`

**Descrição:**
`processInterestAccrual()` usa `for...of` sequencial sem limite de tamanho do batch. Com muitas posições SHORT abertas, o loop pode atingir o `maxDuration: 30s` do Vercel Cron. Adicionar processamento em batches paralelos controlados (BATCH_SIZE = 10) preservando o tratamento de erro por item.

**Evidência:**
```bash
# lib/jobs/interest-accrual.ts:28
for (const { id } of openShorts) {  // ilimitado, sequencial
  const interest = await shortService.accrueInterest(id)  // ~1 conexão por vez
}
```

**Critérios de Aceite:**
- [ ] Processamento em batches paralelos de tamanho 10
- [ ] Contadores `processed`/`errors` preservados
- [ ] Build sem erros

**Estimativa:** 30min

---

## T004 — Corrigir `DataExportService`: armazenar export em S3/storage externo

**Tipo:** SEQUENTIAL
**Dependências:** none
**Prioridade:** MÉDIA
**Status:** PENDING

**Arquivos:**
- modificar: `lib/services/DataExportService.ts`
- modificar: `app/api/v1/users/me/export/download/route.ts`

**Descrição:**
`saveExportFile()` grava o ZIP em `os.tmpdir()` (filesystem local). No Vercel serverless, `/tmp` é efêmero e isolado por instância — a rota de download pode cair em uma instância diferente e retornar 404. Migrar para Supabase Storage ou S3/R2 com URL assinada de download.

**Evidência:**
```bash
# lib/services/DataExportService.ts:110-114
const dir = path.join(os.tmpdir(), 'footstock-exports')
await fs.writeFile(filePath, buffer)  // ← efêmero, instance-local

# app/api/v1/users/me/export/download/route.ts:58
const buffer = await fs.readFile(filePath)  // ← falha se instância diferente
```

**Critérios de Aceite:**
- [ ] Upload do ZIP para storage externo (Supabase Storage ou S3/R2)
- [ ] `downloadUrl` retorna URL assinada (pre-signed) com TTL de 7 dias
- [ ] Rota de download redireciona para URL assinada ou streama do storage
- [ ] `fs.writeFile`/`fs.readFile` removidos do fluxo de produção
- [ ] Build sem erros

**Estimativa:** 2h

---

## T005 — Trocar `console.*` por logger estruturado nos jobs

**Tipo:** PARALLEL-GROUP-1
**Dependências:** none
**Prioridade:** BAIXA
**Status:** PENDING

**Arquivos:**
- criar: `lib/logger.ts`
- modificar: `lib/jobs/credit-dividends.ts`
- modificar: `lib/jobs/bonus-credit.ts`
- modificar: `lib/jobs/interest-accrual.ts`
- modificar: `lib/jobs/expire-dividends.ts`
- modificar: `lib/jobs/data-retention.ts`
- modificar: `lib/jobs/monthly-dividends.ts`
- modificar: `lib/jobs/cancellation-lock.ts`
- modificar: `lib/jobs/news-favorite-club-notifier.ts`

**Descrição:**
165 ocorrências de `console.log/error/warn` no codebase. Os jobs financeiros registram eventos críticos via `console.*` não estruturado. Criar um logger simples com prefixo estruturado JSON-compatível usando Pino ou similar, e substituir nos jobs.

**Critérios de Aceite:**
- [ ] `lib/logger.ts` exporta `logger.info()`, `logger.error()`, `logger.warn()`
- [ ] Saída em JSON em produção, pretty em desenvolvimento
- [ ] Todos os jobs importam e usam o logger
- [ ] Build sem erros

**Estimativa:** 1h

---

## T006 — Otimizar Redis pipeline em `/api/v1/vitals`

**Tipo:** PARALLEL-GROUP-1
**Dependências:** none
**Prioridade:** BAIXA
**Status:** PENDING

**Arquivos:**
- modificar: `app/api/v1/vitals/route.ts`

**Descrição:**
O endpoint de vitals executa 6 comandos Redis em sequência via `.then()` encadeados (incr → expire × 3). Consolidar em um único pipeline Redis para reduzir round-trips.

**Evidência:**
```bash
# app/api/v1/vitals/route.ts:55
await Promise.all([
  redis.incr(counterKey).then(() => redis.expire(counterKey, TTL)),  // 2 round-trips
  redis.incrbyfloat(sumKey, value).then(() => redis.expire(sumKey, TTL)),  // 2 round-trips
  redis.incr(countKey).then(() => redis.expire(countKey, TTL)),  // 2 round-trips
])
// Total: 6 comandos sequenciais por par
```

**Critérios de Aceite:**
- [ ] Substituído por `redis.pipeline()` com todos os 6 comandos em uma única chamada
- [ ] Comportamento de TTL preservado
- [ ] Build sem erros

**Estimativa:** 20min

---

## Resumo

| ID | Descrição | Prioridade | Status |
|----|-----------|------------|--------|
| T001 | Timeout em flagcheck.ts | ALTA | ✅ COMPLETED |
| T002 | BATCH_SIZE em credit-dividends | ALTA | ✅ COMPLETED |
| T003 | BATCH_SIZE em interest-accrual | MÉDIA | ✅ COMPLETED |
| T004 | DataExport → storage externo | MÉDIA | PENDING (requer decisão de infra: Supabase Storage vs S3/R2) |
| T005 | Logger estruturado nos jobs | BAIXA | PENDING |
| T006 | Redis pipeline em vitals | BAIXA | ✅ COMPLETED |
