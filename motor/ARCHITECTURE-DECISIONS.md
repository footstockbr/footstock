# Motor — Architecture Decision Records

**Projeto:** Foot Stock Motor (Serviço Standalone Railway)
**Data:** 2026-03-28

---

## ADR-001: Leader Election via Redis SETNX

**Contexto:**
O motor roda como serviço standalone no Railway. Para escalar, pode haver múltiplas instâncias ativas simultaneamente. Sem coordenação, dois motores calculariam preços em paralelo, gerando ticks duplicados e inconsistência de mercado.

**Decisão:**
Implementar leader election com `SET motor:leader {instanceId} PX 30000 NX` (SETNX atômico com TTL). Heartbeat a cada 10s renova o TTL. Apenas o líder chama `engine.start()`.

**Implementação:** `src/leader/LeaderElection.ts`

**Justificativa:**
- SETNX é atômico por design no Redis — sem race condition entre instâncias
- TTL de 30s com heartbeat 10s = 3× margem de segurança
- Fencing token (INCR `motor:fencing-token`) previne publicação de ticks stale
- Sem dependência de ZooKeeper ou etcd (overhead desnecessário para este caso)

**Consequências:**
- Máximo de 1 instância calculando preços a qualquer momento
- Failover automático em até 30s se o líder morrer (TTL expira)
- Lua scripts garantem atomicidade na renovação e liberação (`renewLease`, `release`)

---

## ADR-002: SSE vs WebSocket para Streaming de Preços

**Contexto:**
Next.js rodando no Vercel (serverless) precisa entregar preços em tempo real para os clientes. WebSocket exigiria conexão persistente bidirecional — incompatível com a arquitetura serverless do Vercel.

**Decisão:**
Usar SSE (Server-Sent Events) unidirecional no endpoint `/api/v1/market/stream`. O servidor subscreve no canal Redis `market:tick` e faz stream para o cliente via `text/event-stream`.

**Implementação:** `app/api/v1/market/stream/route.ts`, `hooks/useMarketTick.ts`

**Justificativa:**
- SSE é simplex (servidor → cliente): adequado para feed de preços (sem necessidade de bidirecionalidade)
- Reconexão automática pelo browser (EventSource API)
- Compatível com Vercel Edge Functions e serverless
- Menor overhead que WebSocket para caso de uso unidirecional

**Consequências:**
- Sem estado bidirecional: ordens são enviadas via REST, não via stream
- Delay de 1h para plano JOGADOR aplicado no SSE endpoint (não no motor)
- Redis subscriber criado e fechado por request (sem memory leak)

### Revisão 2 (2026-05-06)

**Mudança:** SSE streaming movido do Vercel (Next.js serverless) para o motor Railway (Node.js standalone).

**Motivo:** Redução de custos — Vercel cobra por tempo de execução de funções serverless; SSE mantém conexões abertas por minutos, gerando custo escalonado. No Railway (container dedicado), o custo é fixo por réplica independente de conexões SSE.

**Detalhes técnicos:**
- Novos endpoints: `GET /stream/market` e `GET /stream/news` no motor (porta 3001)
- Headers SSE mantidos: `text/event-stream`, heartbeat 15s, CORS configurado
- Frontend atualizado para `NEXT_PUBLIC_STREAM_URL=https://stream.footstock.com.br`
- Endpoints antigos (`/api/v1/market/stream`, `/api/v1/news/stream`) marcados como DEPRECATED (410/301)

**Referência:** `scheduled-updates/footstock-cost/STACK-COST-ANALYSIS.md` §4.2

---

## ADR-003: Circuit Breaker 8% com Halt de 5 Minutos

**Contexto:**
Ativos ilíquidos (B_ILLIQ) com low spread podem ter variações extremas por design do motor quantitativo. Para evitar flash crashes e comportamento de mercado exploitável, é necessário um mecanismo de proteção.

**Decisão:**
L9_CircuitBreaker verifica se a variação percentual em relação ao `closePrice` do dia atingiu ou ultrapassou 8%. Se ativado, `state.isPaused = true` e o ativo é pausado por 150 ticks (~5 minutos a 2s/tick).

**Implementação:** `src/engine/layers/L9_CircuitBreaker.ts`, `src/engine/MarketEngine.ts`

**Justificativa:**
- 8% é o threshold mínimo escolhido para não disparar em volatilidade normal dos B_ILLIQ (max 5%/tick por VelocityCap)
- 5 minutos é tempo suficiente para o mercado "digerir" o evento sem frustrar usuários por muito tempo
- Notificação `CIRCUIT_BREAKER` publicada no Redis para os holders do ativo (via `notifications:circuit-breaker`)
- Erro `ASSET_001` retornado para qualquer operação no ativo durante o halt

**Consequências:**
- Notificação `CIRCUIT_BREAKER` deve ser processada pelo módulo module-19-inbox-notificacoes
- `ASSET_001` deve ser mapeado pelo Error Catalog em todas as APIs que consultam preço do ativo pausado
- Circuit breaker NÃO bloqueia o loop de ticks — o ativo é simplesmente pulado (`continue`) até retomar
- Estado `isPaused` é gerenciado em memória no motor (não persistido no banco — `circuitBreakerActive` não existe no schema atual)

---

## Referências

| Componente | Arquivo | ADR |
|------------|---------|-----|
| Leader Election | `src/leader/LeaderElection.ts` | ADR-001 |
| SSE Endpoint | `app/api/v1/market/stream/route.ts` | ADR-002 |
| SSE Hook | `hooks/useMarketTick.ts` | ADR-002 |
| Circuit Breaker | `src/engine/layers/L9_CircuitBreaker.ts` | ADR-003 |
| Market Engine | `src/engine/MarketEngine.ts` | ADR-001, ADR-003 |
