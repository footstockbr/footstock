# Phase A - Classificacao das 23 cron routes por porting status (post-Railway)

**Data:** 2026-05-14
**Loop:** `05-14-foot-stock-motor-action-plan` (Task 010, Iteracao 3.3)
**Workspace:** `output/workspace/foot-stock/`
**Hosting:** Railway (NAO ha `vercel.json`; servicos `motor` e `footstock-next` em `*/railway.toml`)

## 1. Contexto

O plano original (Iteracao 3.3) assumia 12 crons "ativos no Vercel" + 11 routes "orfaos" sem entrada em `vercel.json`. Verificacao 2026-05-14 derrubou a premissa:

- **NAO existe `vercel.json`** em parte alguma do repo (`output/workspace/foot-stock`).
- Existem **23 routes** em `footstock-next/src/app/api/cron/` (kebab-case).
- Existem **23 stubs** em `motor/src/scheduler/jobs/` (camelCase), todos com `TODO: migrar logica`, 13-14 LOC cada.
- Os 23 estao registrados em `motor/src/scheduler/index.ts > registerAllJobs()`.
- Flag opt-in `MOTOR_SCHEDULER_ENABLED` em `motor/src/index.ts:171` (default OFF em prod).

Conclusao: a Fase A nao classifica "orfaos" — classifica **porting status** de 23 pares (route, stub) em quatro categorias:

- `stub-only` — motor stub vazio, logica viva so no next.
- `partially-ported` — motor stub com alguma logica real (acima de ~15 LOC nao-boilerplate), next ainda funcional.
- `fully-ported-pending-cutover` — motor job completo, next route ainda existe mas desligamento pendente.
- `deprecated` — legacy nao usado por ninguem, alvo de remocao.

## 2. Pre-acao gate (operador) - PENDENTE

Itens a confirmar com o operador antes de iniciar Task 011:

| # | Gate | Status |
|---|------|--------|
| a | Trigger atual dos 23 endpoints `/api/cron/{name}` em prod (Railway scheduled job? GitHub Actions cron? external scheduler? desligados aguardando motor scheduler ligar?) | PENDENTE |
| b | Existe `pending-actions/foot-stock.md` ou runbook documentando o trigger atual? | PENDENTE |
| c | Este loop e redundante com o workstream `railway-remediate` (commit `2d37587` — `feat(railway-remediate): item 026 P1-01 - 4 cron jobs faltantes no motor scheduler`)? Manter, descartar ou subordinar Tasks 011/012/013? | PENDENTE |

Sem (a) e (c) confirmados, Task 011 nao pode iniciar. Esta task NAO migra nada — apenas classifica.

## 3. Metodo

- LOC: `wc -l` per arquivo.
- Stub vs ported: presenca do comentario literal `TODO: migrar logica` (todos os 23 motor stubs matcham; nenhum tem logica real portada).
- Ultima mudanca: `git log -1 --format=%ad --date=short` per arquivo.
- Callers internos no next: `grep -rln "/api/cron/{kebab}" footstock-next/src` excluindo o proprio `route.ts`.
- Acao recomendada: derivada de `porting_status` + wave assignment do plano original (Tasks 011/012/013).

## 4. Tabela canonica (23 routes)

Legenda: `port-logic` (Wave assignment ja existe) | `port-logic*` (sem wave — operador deve atribuir Wave 4 ou marcar deprecated) | `disable-route` (cutover Railway) | `delete-route` | `nothing`.

| # | route (kebab) | stub (camelCase) | next LOC | motor LOC | next ult. mud. | motor ult. mud. | callers no next | porting_status | acao | wave |
|---|---|---|---:|---:|---|---|---:|---|---|---|
|  1 | affiliate-commission | affiliateCommission | 137 | 13 | 2026-04-16 | 2026-05-07 | 0 | stub-only | port-logic* | sem wave |
|  2 | age-verification-retry | ageVerificationRetry |  31 | 13 | 2026-04-15 | 2026-05-07 | 0 | stub-only | port-logic* | sem wave |
|  3 | bonus-credit | bonusCredit |  26 | 13 | 2026-04-16 | 2026-05-07 | 0 | stub-only | port-logic | Wave 1 |
|  4 | cancellation-expiry | cancellationExpiry |  27 | 14 | 2026-04-16 | 2026-05-10 | 0 | stub-only | port-logic* | sem wave |
|  5 | cancellation-lock | cancellationLock |  28 | 13 | 2026-04-16 | 2026-05-07 | 0 | stub-only | port-logic | Wave 2 |
|  6 | card-updater | cardUpdater |  59 | 14 | 2026-04-05 | 2026-05-10 | 0 | stub-only | port-logic* | sem wave |
|  7 | credit-dividends | creditDividends |  28 | 13 | 2026-04-16 | 2026-05-07 | 0 | stub-only | port-logic | Wave 1 |
|  8 | data-retention | dataRetention |  30 | 13 | 2026-04-16 | 2026-05-07 | 0 | stub-only | port-logic | Wave 2 |
|  9 | dunning | dunning |  43 | 14 | 2026-04-16 | 2026-05-07 | 0 | stub-only | port-logic | Wave 1 |
| 10 | expire-dividends | expireDividends |  29 | 13 | 2026-04-16 | 2026-05-07 | 0 | stub-only | port-logic | Wave 1 |
| 11 | financial-dividend | financialDividend |  31 | 14 | 2026-04-16 | 2026-05-10 | 0 | stub-only | port-logic* | sem wave |
| 12 | interest-accrual | interestAccrual |  37 | 13 | 2026-04-16 | 2026-05-07 | 0 | stub-only | port-logic | Wave 1 |
| 13 | leverage-interest | leverageInterest |  38 | 13 | 2026-04-16 | 2026-05-07 | 0 | stub-only | port-logic* | sem wave |
| 14 | moderation-cleanup | moderationCleanup |  73 | 13 | 2026-04-16 | 2026-05-07 | 0 | stub-only | port-logic* | sem wave |
| 15 | monthly-dividends | monthlyDividends |  28 | 13 | 2026-04-16 | 2026-05-07 | 0 | stub-only | port-logic | Wave 1 |
| 16 | notification-digest | notificationDigest |  87 | 13 | 2026-04-16 | 2026-05-07 | 0 | stub-only | port-logic* | sem wave |
| 17 | notification-queue | notificationQueue |  42 | 13 | 2026-04-15 | 2026-05-07 | 0 | stub-only | port-logic* | sem wave |
| 18 | notification-ttl-cleanup | notificationTtlCleanup |  21 | 13 | 2026-04-15 | 2026-05-07 | 0 | stub-only | port-logic* | sem wave |
| 19 | nsm | nsm |  93 | 13 | 2026-04-16 | 2026-05-07 | 0 | stub-only | port-logic | Wave 3 |
| 20 | order-expiry | orderExpiry |  36 | 13 | 2026-04-16 | 2026-05-07 | 0 | stub-only | port-logic | Wave 2 |
| 21 | scoring | scoring |  30 | 14 | 2026-04-02 | 2026-05-07 | 0 (1 test ref) | stub-only | port-logic | Wave 3 |
| 22 | session-transition | sessionTransition |  64 | 14 | 2026-04-16 | 2026-05-10 | 0 | stub-only | port-logic* | sem wave |
| 23 | subscription-expiry | subscriptionExpiry |  47 | 13 | 2026-04-16 | 2026-05-07 | 0 | stub-only | port-logic | Wave 1 |

**Observacoes:**

- Coluna `callers no next` filtra apenas refs nao-route (route.ts proprio sempre excluido). Match espurio em `cancellation-expiry` (referenciado pelo `cancellation-lock/route.ts`) descartado apos inspecao manual. Match em `scoring` e teste unitario (`ScoringJobService.test.ts`), nao caller real.
- Coluna `motor ult. mud.` reflete commit de criacao do stub + registro em `registerAllJobs()` (workstream `railway-remediate`, commits 2026-05-07 e 2026-05-10). Nenhum stub teve logica real portada ate 2026-05-14.

## 5. Distribuicao por porting_status

| porting_status | quantidade |
|---|---:|
| stub-only | 23 |
| partially-ported | 0 |
| fully-ported-pending-cutover | 0 |
| deprecated | 0 |

**Todos os 23 sao `stub-only`.** Premissa "11 orfaos" foi eliminada: nao ha `vercel.json` e todos os pares (route, stub) existem.

## 6. Stub-only — Wave assignment

### Wave 1 (financial, 7) — Task 011

| route | stub |
|---|---|
| subscription-expiry | subscriptionExpiry |
| dunning | dunning |
| monthly-dividends | monthlyDividends |
| interest-accrual | interestAccrual |
| credit-dividends | creditDividends |
| expire-dividends | expireDividends |
| bonus-credit | bonusCredit |

### Wave 2 (operational, 3) — Task 012

| route | stub |
|---|---|
| cancellation-lock | cancellationLock |
| order-expiry | orderExpiry |
| data-retention | dataRetention |

### Wave 3 (observability, 2) — Task 013

| route | stub |
|---|---|
| scoring | scoring |
| nsm | nsm |

### Sem wave (11) — DECISAO PENDENTE DO OPERADOR

As 11 rotas abaixo nao estao cobertas por Tasks 011/012/013. Sao candidatas a Wave 4 OU a marcacao `deprecated` (se nao usadas em prod). Aguarda decisao do operador para inclusao em wave nova ou remocao via PR separado:

| route | stub | next LOC | observacao |
|---|---|---:|---|
| affiliate-commission | affiliateCommission | 137 | logica densa (NotificationService + Prisma + enums) |
| age-verification-retry | ageVerificationRetry | 31 | usa `@/lib/jobs/retry-age-verification` |
| cancellation-expiry | cancellationExpiry | 27 | similar a cancellation-lock (Wave 2); candidato natural a Wave 2 |
| card-updater | cardUpdater | 59 | usa `@/lib/services/CardUpdaterService` (Stripe?) |
| financial-dividend | financialDividend | 31 | usa `@/lib/jobs/financialDividendCron`; candidato natural a Wave 1 |
| leverage-interest | leverageInterest | 38 | similar a interest-accrual (Wave 1); candidato natural a Wave 1 |
| moderation-cleanup | moderationCleanup | 73 | logica densa, Prisma direto |
| notification-digest | notificationDigest | 87 | DigestService + PushService + QuietHoursService + supabase |
| notification-queue | notificationQueue | 42 | NotificationQueueService + NotificationService |
| notification-ttl-cleanup | notificationTtlCleanup | 21 | NotificationRepository |
| session-transition | sessionTransition | 64 | session-manager + redis + Prisma |

**Sugestao (nao-vinculante):** subordinar `cancellation-expiry` -> Wave 2; `financial-dividend` + `leverage-interest` -> Wave 1; criar **Wave 4 (notifications, 4)** para `notification-digest`, `notification-queue`, `notification-ttl-cleanup` e `affiliate-commission`; **Wave 5 (misc, 4)** para `age-verification-retry`, `card-updater`, `moderation-cleanup`, `session-transition`. Operador decide.

## 7. Partially-ported (0)

Nenhum. Todos os 23 stubs sao TODOs literais.

## 8. Fully-ported-pending-cutover (0)

Nenhum. Nenhum motor job tem logica real ate 2026-05-14.

## 9. Deprecated (0)

Nenhum por classificacao automatica. As 11 routes "sem wave" sao candidatas potenciais, mas marcacao `deprecated` requer evidencia explicita de nao-uso em prod — confirmacao do operador (item (a) do gate Section 2).

## 10. Acoes Railway (template para cutover)

Para cada job migrado em Tasks 011/012/013 (e Wave 4/5 se criadas), apos staging 48h verde:

```bash
# Habilitar motor scheduler em prod
railway variables set MOTOR_SCHEDULER_ENABLED=true \
  --environment production --service motor

# Desativar route no next (preferido: gate 410)
railway variables set NEXT_PUBLIC_MOTOR_CRON_ACTIVE=true \
  --environment production --service footstock-next
```

No handler do next, gate inicial:

```ts
if (process.env.NEXT_PUBLIC_MOTOR_CRON_ACTIVE === 'true') {
  return NextResponse.json(
    { error: 'Migrated to motor scheduler' },
    { status: 410 }
  )
}
```

Alternativa: deletar `route.ts` (commit separado). Sequencia (motor on -> next off) sem janela complexa — ambos em Railway, sem race condition de Vercel cron.

## 11. Rollback (template)

```bash
# Reverter motor scheduler
railway variables set MOTOR_SCHEDULER_ENABLED=false \
  --environment production --service motor

# Reverter gate do next
railway variables set NEXT_PUBLIC_MOTOR_CRON_ACTIVE=false \
  --environment production --service footstock-next
```

Mais commit `revert` no codigo do stub portado se logica regrediu.

## 12. Saida desta task

- Relatorio: este arquivo.
- Codigo do motor: NAO mutado (apenas leitura + escrita do relatorio).
- Commit dedicado: `docs(scheduler-migration): classify 23 cron routes porting status (post-Railway)` (deferido para operador apos aprovacao deste relatorio).

## 13. Gates de saida (Task 010)

| # | Gate | Status |
|---|---|---|
| 1 | Trigger atual dos `/api/cron/*` em prod confirmado pelo operador | PENDENTE (item 2.a) |
| 2 | Redundancia com workstream `railway-remediate` esclarecida | PENDENTE (item 2.c) |
| 3 | Os 23 routes classificados em uma das 4 categorias | OK (Secao 4) |
| 4 | Operador aprovou o relatorio antes de Task 011 iniciar | PENDENTE |

Tasks 011/012/013 NAO devem iniciar ate Gates 1, 2 e 4 ficarem OK.
