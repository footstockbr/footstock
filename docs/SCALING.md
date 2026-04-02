# Análise de Escalabilidade — Foot Stock

**Rastreabilidade INTAKE:** INT-123
**Data:** 2026-03-31
**Versão:** v1.0

---

## Visão Geral

O Foot Stock é um mercado de ativos de futebol com componentes intensivos de tempo real (WebSocket para preços e ordens). As projeções abaixo cobrem 3 fases de crescimento com estimativas baseadas nos pricing oficiais dos serviços (Vercel, Railway, Supabase, Redis — 2026).

---

## Fase 1 — MVP (500 DAU, Meses 1–3)

### Infraestrutura

| Serviço | Plano | Especificações | Custo estimado |
|---------|-------|---------------|----------------|
| Vercel | Pro | 1 região (GRU1), serverless 15s timeout, 4.5MB body | ~R$100/mês |
| Railway (Motor) | Hobby | 1 instância, 512MB RAM, 0.5 vCPU, restart automático | ~R$30/mês |
| Supabase | Free | 500MB DB, 50MB storage, 50k MAU auth, connection pool 50 | R$0 |
| Redis (Railway) | Hobby | 256MB, sem persistência | ~R$20/mês |
| CDN | Vercel Edge | Edge Network incluso no Vercel Pro | Incluso |
| **Total** | | | **~R$150/mês** |

### Capacidade Esperada

- WebSocket simultâneos: até 500 (dentro do limite de 1 instância Railway 512MB)
- Throughput Redis pub/sub: ~500 × 1 msg/2s = 250 msgs/s (ok no Hobby)
- Conexões Prisma: `connection_limit=5` para serverless (Supabase free limit)
- Build Next.js: ~3–5min no CI (Node.js 22, cache npm)

### Gargalos Esperados

Nenhum significativo nesta escala. O motor tem headroom de 4× em RAM para 500 usuários simultâneos.

---

## Fase 2 — Crescimento (5.000 DAU, Meses 3–9)

### Infraestrutura

| Serviço | Plano | Especificações | Custo estimado |
|---------|-------|---------------|----------------|
| Vercel | Pro | 1 região GRU1 + Instant Rollback, 30s timeout admin | ~R$200/mês |
| Railway (Motor) | Pro | 1 instância, 2GB RAM, 2 vCPU | ~R$250/mês |
| Supabase | Pro | 8GB DB, read replica, PgBouncer, 100k MAU | ~R$150/mês |
| Redis | Pro 1GB | 1GB, persistência, backup automático | ~R$200/mês |
| CDN | Vercel + Cloudflare | Assets estáticos via Cloudflare (Free) | ~R$0 |
| **Total** | | | **~R$800/mês** |

### Capacidade Esperada

- WebSocket simultâneos: até 3.000 com 2GB RAM (1 instância)
- Throughput Redis pub/sub: 5k × 1 msg/2s = 2.500 msgs/s (ok no Pro 1GB)
- Conexões Prisma: `connection_limit=10`, read replica para queries pesadas

### Gargalos Identificados

| Gargalo | Cálculo | Solução |
|---------|---------|---------|
| Redis pub/sub com 5k WebSockets | 5k × 0.5 msg/s = 2.500 msgs/s | Manter Pro 1GB, monitorar com module-27 |
| Motor: memória por conexão WS | ~500KB × 3k conn = 1.5GB | Escalar para 2GB RAM (já no plano) |
| Supabase free limit connection | 50 conexões | Migrar para Pro (connection_limit=10 por serverless) |

---

## Fase 3 — Escala (50.000 DAU, Meses 9+)

### Infraestrutura

| Serviço | Plano | Especificações | Custo estimado |
|---------|-------|---------------|----------------|
| Vercel | Enterprise | Multi-região SA + US, Edge middleware prioritário | ~R$1.500/mês |
| Railway (Motor) | Pro Multi | 3 instâncias, sticky sessions, 4GB RAM cada | ~R$1.500/mês |
| Supabase | Dedicated | PgBouncer dedicado, 2 read replicas, 100GB DB | ~R$800/mês |
| Redis Cluster | Pro 4GB | Redis Cluster mode, 3 shards, 4GB total | ~R$500/mês |
| CDN | Cloudflare Pro | API edge caching, DDoS protection | ~R$200/mês |
| **Total** | | | **~R$4.500/mês** |

### Capacidade Esperada

- WebSocket simultâneos: até 30.000 com 3 instâncias (sticky sessions obrigatório)
- Throughput Redis: 50k × 0.5 msg/s = 25.000 msgs/s → Redis Cluster mode obrigatório
- Prisma: `connection_limit=5` por serverless + PgBouncer dedicado (1.000 conexões)

### Gargalos Identificados

| Gargalo | Cálculo | Solução |
|---------|---------|---------|
| Redis pub/sub throughput | 50k × 0.5 msg/s = 25k msgs/s → próximo do limite single-node (50k/s) | Redis Cluster obrigatório (3 shards) |
| WebSocket por instância | Limite Railway: ~10k por instância com 4GB | Motor stateless + sticky sessions + `@socket.io/redis-adapter` |
| Supabase query p95 | Sem read replica: >100ms em 50k DAU | Dedicated + 2 read replicas |

---

## Métricas de Trigger por Fase

### Fase 1 → Fase 2 (migrar quando QUALQUER critério for atingido)

- DAU > 1.000 por 7 dias consecutivos (fonte: analytics/Plausible)
- p95 latência API > 300ms por 1h (fonte: Sentry/module-27)
- WebSocket connections simultâneas > 300 (fonte: Railway metrics)
- Railway memory > 80% por 24h (fonte: Railway dashboard)
- Redis memory > 70% do limite (>180MB de 256MB) (fonte: Railway Redis)

### Fase 2 → Fase 3 (migrar quando QUALQUER critério for atingido)

- DAU > 10.000 por 7 dias consecutivos
- WebSocket connections simultâneas > 3.000 por 6h
- Redis pub/sub throughput > 10.000 msgs/s
- Supabase query time médio > 200ms (fonte: `pg_stat_statements`)
- MRR > R$10.000/mês (justifica custo Fase 3 de R$4.500/mês)

---

## Análise de Gargalos Críticos Transversais

### 1. Redis Pub/Sub Throughput

```
Fórmula: DAU × frequência_msgs_por_usuário = msgs/s necessárias
Fase 1: 500 × 0.5 = 250 msgs/s       → Hobby ok (limite ~5k msgs/s)
Fase 2: 5.000 × 0.5 = 2.500 msgs/s  → Pro 1GB ok (limite ~20k msgs/s)
Fase 3: 50.000 × 0.5 = 25.000 msgs/s → Redis Cluster obrigatório
```

### 2. Prisma Connection Pooling (Serverless)

```
Risco: Serverless cria nova conexão por invocação
Solução: connection_limit=5 no DATABASE_URL + PgBouncer no Supabase
Fase 1: Free (50 conn total) / connection_limit=5 → ok para 10 req/s
Fase 2: Pro (100 conn total) / connection_limit=10 → ok para 10 req/s
Fase 3: Dedicated PgBouncer (1.000 conn) / connection_limit=5 → ok
```

### 3. WebSocket Multi-Instância (Fase 3)

```
Problema: Múltiplas instâncias do motor precisam compartilhar estado WS
Solução: @socket.io/redis-adapter (já no plano de Fase 3)
Requisito: Redis Cluster com suporte a pub/sub multi-shard
```

---

## Documentos Relacionados

- `docs/SLO-ALIGNMENT.md` — SLOs e error budgets derivados desta analise (input para module-27-monitoring `/slo-create`)
- `tests/load/basic-load.js` — Scripts k6 para validacao de capacidade

## Referências de Pricing (2026)

- Vercel: https://vercel.com/pricing
- Railway: https://railway.app/pricing
- Supabase: https://supabase.com/pricing
- Redis/Upstash: https://upstash.com/pricing
