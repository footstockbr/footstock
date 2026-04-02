# SLO Alignment — DevOps → Monitoring

**Gerado por:** module-26-devops/TASK-3/ST003
**Input para:** module-27-monitoring (`/slo-create`)
**Rastreabilidade:** INT-123
**Data:** 2026-03-31

---

## Propósito

Este documento define os SLOs iniciais do Foot Stock, derivados dos:
- Thresholds k6 definidos em `tests/load/basic-load.js` (TASK-3/ST002)
- Projeções de escala documentadas em `docs/SCALING.md` (TASK-3/ST001)

Deve ser usado como input ao executar `/slo-create` no module-27-monitoring.

---

## SLOs Propostos — Fase 1 (MVP)

| Serviço | Métrica | Target | Janela | Fonte de Dados |
|---------|---------|--------|--------|----------------|
| API Next.js | Disponibilidade | 99.5% | 30 dias rolling | Vercel Analytics / Sentry |
| API Next.js | Latência p95 | < 500ms | Rolling 5min | Sentry Tracing |
| API Next.js | Latência p99 | < 2.000ms | Rolling 5min | Sentry Tracing |
| API Next.js | Taxa de erro | < 1% | Rolling 5min | Sentry Issues |
| Motor Railway | Disponibilidade | 99% | 30 dias rolling | Railway Health Check |
| Motor Railway | Health check resposta | < 30s | 60s interval | Railway Monitoring |
| Motor Railway | Reconexão WebSocket | < 3 tentativas | Por sessão | Client-side metrics |
| Supabase | Query p95 | < 100ms | Rolling 5min | `pg_stat_statements` |
| Redis | Latência PING | < 5ms | Rolling 1min | Railway Redis Metrics |

---

## Error Budget (Fase 1)

| Serviço | SLO | Downtime Permitido/Mês |
|---------|-----|------------------------|
| API Next.js | 99.5% | 3.6h/mês |
| Motor Railway | 99.0% | 7.2h/mês |

Cálculo: `(1 - SLO) × 30 dias × 24h = horas de downtime permitidas`

---

## Alertas Recomendados (configurar em module-27)

| Condição | Severidade | Ação |
|----------|-----------|------|
| API p95 > 400ms por 5min | Warning | Notificar canal #devops |
| API p95 > 500ms por 5min | Critical | PagerDuty on-call |
| API error rate > 0.5% por 5min | Warning | Notificar canal #devops |
| API error rate > 1% por 5min | Critical | PagerDuty on-call |
| Motor health check fail 3× consecutivos | Critical | Railway reinicia automaticamente; alertar #devops |
| Redis latência > 10ms por 2min | Warning | Investigar throughput |
| Supabase p95 > 200ms por 5min | Warning | Investigar queries lentas com `pg_stat_statements` |
| Railway memory > 80% por 24h | Warning | Avaliar upgrade para Fase 2 |

---

## Alinhamento com Thresholds k6

Os thresholds do load test `tests/load/basic-load.js` são consistentes com os SLOs acima:

| Threshold k6 | SLO correspondente |
|-------------|-------------------|
| `p(95)<500` | API p95 < 500ms |
| `p(99)<2000` | API p99 < 2.000ms |
| `rate<0.01` | Taxa de erro < 1% |
| `rate>0.95` (checks) | Disponibilidade operacional > 95% |

---

## Referências

- `docs/SCALING.md` — Projeções e métricas de trigger por fase
- `tests/load/basic-load.js` — Scripts k6 de validação
- module-27-monitoring — Implementação dos alertas e dashboards
