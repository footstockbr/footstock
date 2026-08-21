# Motor — Architecture Decision Records

**Projeto:** FootStock Motor (Serviço Standalone Railway)
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

## ADR-004: Long Leverage 2x para LENDA

**Status:** Accepted (2026-05-14)

**Contexto:**
O legacy do cliente (4 monolitos JSX em `legacy-old/` e `legacy-new/`) era short-only com margin — não previa operação long alavancada. A produção (Railway) introduziu long leverage 2x como evolução de produto, exclusivo do plano LENDA, e já existem posições abertas em prod consumindo o feature. Reverter o feature inviabilizaria as posições vigentes e quebraria contratos de produto com usuários LENDA.

**Decisão:**
Manter long leverage 2x apenas para o plano LENDA, com os seguintes parâmetros canônicos:

- **Juros:** 0.3% ao dia, cobrados via `motor/src/scheduler/jobs/leverageInterest.ts` (job registrado em `motor/src/scheduler/index.ts` com schedule `30 7 * * *`, 07:30 UTC diariamente).
- **Margin call (alerta):** 50% — emite notificação ao holder sem ação automática.
- **Liquidação:** 20% — fechamento forçado da posição alavancada.
- **Gating de plano:** verificado em `motor/src/lib/auth.ts` (`PlanType = 'JOGADOR' | 'CRAQUE' | 'LENDA'`); apenas `LENDA` aceita abertura de posição long 2x.

**Implementação:**
- `motor/src/engine/LeverageInterestRunner.ts` — runner que aplica o débito de juros nas posições long alavancadas LENDA.
- `motor/src/engine/MarginCallChecker.ts` — checagem dos thresholds 50% (alerta) e 20% (liquidação) em proximidade ao tick.
- `motor/src/engine/OrderExecutor.ts` — execução de ordens com lógica short pré-existente extendida para long 2x condicional ao plano.
- `motor/src/scheduler/jobs/leverageInterest.ts` — job camelCase agendado em `motor/src/scheduler/index.ts:66` via `registerJob('leverage-interest', '30 7 * * *', leverageInterestJob)`. Lógica real ainda parcialmente em `footstock-next/src/app/api/cron/leverage-interest/route.ts` (migração para o motor pendente fora desta ADR).
- `motor/src/lib/auth.ts` — fonte canônica do `PlanType` que gateia o feature.

**Justificativa:**
- Diferencial competitivo do plano LENDA: long leverage 2x é o principal sell-point do tier premium.
- Fonte de receita recorrente via juros diários (0.3%/dia compostos), independente de spread de mercado.
- Posições abertas em produção tornam a reversão tecnicamente custosa (migração de estado) e contratualmente arriscada (expectativa do usuário LENDA).
- Gating centralizado em `motor/src/lib/auth.ts` mantém a regra de plano em um único ponto canônico.

**Consequências:**
- (Positivas) Diferencial claro do plano LENDA; receita via juros desacoplada de volume de trading; checagem de plano centralizada em `auth.ts`.
- (Negativas) Complexidade adicional em `motor/src/engine/OrderExecutor.ts` (caminho long 2x condicional ao plano); risco de cascata de liquidações em alta volatilidade caso o `MarginCallChecker` não rode próximo ao tick; dependência operacional do scheduler `30 7 * * *` (falha no job atrasa cobrança de juros e desalinha P&L do dia).

**Referências:**
- `forged-goods/research/foot-stock-motor-legacy-vs-deployed.md` — estudo comparativo legacy vs deployed (seção margin/leverage).
- Apêndice técnico H6/H7 do plano `blacksmith/foot-stock-motor-action-plan.md` (decisão original e thresholds).
- `motor/src/engine/LeverageInterestRunner.ts`, `motor/src/engine/MarginCallChecker.ts`, `motor/src/engine/OrderExecutor.ts`.
- `motor/src/scheduler/jobs/leverageInterest.ts`, `motor/src/scheduler/index.ts:66`.
- `motor/src/lib/auth.ts` (definição de `PlanType`).

---

## ADR-005: Fallback Determinístico Mono-Time (Decisão T-24)

**Contexto:**
O `NewsClassifier.withTickerFallback()` (linha 1025 de `src/news/NewsClassifier.ts`) é acionado em todos os caminhos onde o LLM não devolve time válido (5 call sites: linhas 639, 652, 744, 786, 800). O fallback resolve pelo título via `resolveFromIndex` e emite exatamente um time com `confidence: 0` e `origin: 'classifier_fallback'`.

Com a feature multi-time (M067, `NEWS_MULTI_TEAM_ENABLED`), surgiu a questão: o fallback deve emitir múltiplos times quando o título contém aliases de mais de um clube, ou deve permanecer mono-time?

**Decisão:**
Manter o fallback estritamente mono-time. Não estender para múltiplos aliases.

**Justificativa:**
1. **Precision-first:** o fallback resolve pelo primeiro alias encontrado no título (match mais à esquerda, desempate por alias mais longo). Emitir múltiplos times a partir de aliases soltos no título aumentaria falso-positivo — um título como "Flamengo x Palmeiras: bastidores da final" poderia gerar dois times com confidence zero, mas a notícia pode ser sobre apenas um deles.
2. **Confidence zero é sinal explícito:** o time emitido já carrega `confidence: 0` e `origin: 'classifier_fallback'`, deixando claro para o gate editorial e para a UI que se trata de classificação degradada, não de veredito do LLM.
3. **Coerência com M067:** a feature multi-time expande o grupo quando o LLM devolve `teams[]` com múltiplos candidatos válidos (confidence > 0). O fallback é um caminho fundamentalmente diferente (heurística sem LLM) — misturar os dois caminhos diluiria a semântica de `origin`.
4. **Estado degradado visível no card alcancavel:** o admin em `footstock-next/src/app/admin/noticias/page.tsx` (badge `admin-noticias-fallback-badge-*`, T-24b) exibe o rótulo "Fallback" com `title` do `fallbackReason` quando `origin === 'classifier_fallback'`. A coluna `fallback_reason` persistida (T-23) permite auditoria em SQL. A evidencia antiga `NewsManager.tsx:272-273` era morta: o arquivo era orfao; no pai de `e4f12d1` essas linhas eram `NewsStatusToggle`; T-26 removeu o arquivo.
5. **Custo/benefício:** estender o fallback para multi-time exigiria reescrever `resolveFromIndex` para retornar N hits, adicionar lógica de dedup por título, e criar testes de fixtures com dois clubes — todo esse esforço para um caminho que já é sinalizado como degradado e que o operador humano deve revisar.

**Consequências:**
- (Positivas) Sem complexidade adicional; sem risco de falso-positivo multi-time no fallback; sem mudança no gate editorial; decisão documentada para o cliente.
- (Negativas) Notícias degradadas com dois clubes no título continuam recebendo apenas um time (o primeiro match). O operador humano deve revisar essas notícias no card admin de `/admin/noticias`, onde o rótulo "Fallback" as identifica.

**Comunicação ao cliente:**
> "Quando o classificador de IA não consegue identificar o time com segurança (fallback), o sistema atribui o primeiro time encontrado no título da notícia com confiança zero. Esse comportamento é intencional: evita atribuir múltiplos times incorretamente quando a notícia menciona mais de um clube. Todas as notícias classificadas por fallback são identificadas com o rótulo 'Fallback' no painel admin, permitindo revisão manual."

**Divergência de linhas (2026-08-21):** as referências originais do inventário M3 (linhas 946-948, 961, 979-987, 564/577/669/711/725) migraram para (1025, 1040, 1055-1062, 639/652/744/786/800) devido a ~375 linhas de código adicionadas entre a data do inventário e esta decisão. O comportamento é idêntico ao descrito no inventário.

**Referências:**
- `src/news/NewsClassifier.ts:1025-1063` — `withTickerFallback()`
- `src/news/types.ts:60,68` — `TeamSignalOrigin`, `ClassifierFallbackReason`
- `src/news/editorial-gate.ts:155-180` — gate que consome `fallbackReason`
- `src/news/NewsPublisher.ts:250-291` — persistência de `fallbackReason` e `sentimentDegraded`
- `footstock-next/src/app/admin/noticias/page.tsx` — rótulo "Fallback" no card (`admin-noticias-fallback-badge-*`, T-24b)
- Task T-24 (item 025 do loop 08-18-foot-stock-motor-noticias-analise)
- ADR-004 (feature multi-time, `NEWS_MULTI_TEAM_ENABLED`)

---

## Referências

| Componente | Arquivo | ADR |
|------------|---------|-----|
| Leader Election | `src/leader/LeaderElection.ts` | ADR-001 |
| SSE Endpoint | `app/api/v1/market/stream/route.ts` | ADR-002 |
| SSE Hook | `hooks/useMarketTick.ts` | ADR-002 |
| Circuit Breaker | `src/engine/layers/L9_CircuitBreaker.ts` | ADR-003 |
| Market Engine | `src/engine/MarketEngine.ts` | ADR-001, ADR-003 |
| Leverage Interest Runner | `src/engine/LeverageInterestRunner.ts` | ADR-004 |
| Margin Call Checker | `src/engine/MarginCallChecker.ts` | ADR-004 |
| Order Executor | `src/engine/OrderExecutor.ts` | ADR-004 |
| Leverage Interest Job | `src/scheduler/jobs/leverageInterest.ts` | ADR-004 |
| Plan Gating | `src/lib/auth.ts` | ADR-004 |
| News Fallback Mono-Time | `src/news/NewsClassifier.ts` | ADR-005 |
