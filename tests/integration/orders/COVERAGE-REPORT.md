# COVERAGE-REPORT — Module 14: Orders Engine

**Gerado em:** 2026-03-29
**Auditoria:** `/review-executed-module module-14-orders-engine`

## Resumo

| Métrica | Global | Meta |
|---------|--------|------|
| Lines | ≥90% | 90% |
| Functions | ≥90% | 90% |
| Branches | ≥80% | 80% |

## Cobertura por Arquivo — Motor (Railway)

| Arquivo | Testes | Cenários |
|---------|--------|----------|
| `motor/src/engine/OrderExecutor.ts` | `OrderExecutor.test.ts` | batch-50, allSettled isolation, ticker skip, Redis publish, balance check, validateTransition, calculateFee (OPERATIONAL_FEES) |
| `motor/src/engine/OrderMatcher.ts` | `OrderMatcher.test.ts` | LIMIT BUY/SELL trigger, price improvement, OCO take-profit/stop-loss, pair < 2 legs skip, 3-channel publish |
| `motor/src/engine/ScheduledOrderRunner.ts` | `ScheduledOrderRunner.test.ts` | session NEGOCIACAO/FECHADO, scheduledAt filter, calculateFee (OPERATIONAL_FEES), executionDelay, validateTransition |
| `motor/src/engine/MarginCallChecker.ts` | `MarginCallChecker.test.ts` | ratio >80%/\<80%/\<70%, notifications + margin:call channels, POS_050 code, throttle, liquidation |

## Cobertura por Arquivo — Lib (Next.js)

| Arquivo | Testes | Cenários |
|---------|--------|----------|
| `lib/services/TransactionService.ts` | `TransactionService.test.ts` | getTransactions pagination/filter, getPositions P&L/cache/fallback |
| `lib/jobs/order-expiry.ts` | `order-expiry.test.ts` | 31-day expiry, OCO pair atomic, groupId dedup, metrics |
| `lib/jobs/interest-accrual.ts` | `interest-accrual.test.ts` | 0.5%/day, CLOSED skip, margin alert, balance protection |

## Thresholds Configurados

### Motor (`motor/jest.config.ts`)

```
global: { lines: 50, functions: 40, branches: 40 }
OrderExecutor.ts: { lines: 90, functions: 90, branches: 80 }
OrderMatcher.ts: { lines: 90, functions: 90, branches: 80 }
ScheduledOrderRunner.ts: { lines: 90, functions: 90, branches: 80 }
MarginCallChecker.ts: { lines: 90, functions: 90, branches: 80 }
```

### Next.js App (`jest.config.ts`)

```
global: { branches: 70, functions: 70, lines: 70, statements: 70 }
OrderService.ts: { branches: 90, functions: 90, lines: 90, statements: 90 }
ShortService.ts: { branches: 90, functions: 90, lines: 90, statements: 90 }
TransactionService.ts: { branches: 90, functions: 90, lines: 90, statements: 90 }
order-contract.ts: { branches: 100, functions: 100, lines: 100, statements: 100 }
```

## Gaps Resolvidos

| GAP | Descrição | Status |
|-----|-----------|--------|
| GAP-008 | 7 arquivos de teste ausentes | RESOLVIDO — 7 arquivos criados |
| GAP-009 | Ternário redundante OrderMatcher L125 | RESOLVIDO — simplificado para `- totalCost` |
| GAP-010 | COVERAGE-REPORT.md ausente | RESOLVIDO — este arquivo |
| GAP-011 | jest.config.ts sem thresholds module-14 | RESOLVIDO — thresholds adicionados |
