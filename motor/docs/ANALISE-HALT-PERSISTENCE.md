# Analise de causa raiz: halts persistentes apos restart do motor (FootStock)

> Documento de analise tecnica. Objetivo: explicar por que ate 37 de 40 ativos
> permaneceram com `isHalted=true` no DB de producao apos restarts do motor,
> separar causa confirmada de hipoteses sobre producao, avaliar o fix aplicado
> e recomendar um contrato robusto entre motor, DB e frontend.

## Sumario executivo

A causa mecanicamente confirmada e que o circuit breaker persiste `isHalted=true`
no DB e agenda a retomada em um `setTimeout(300_000)` mantido apenas em memoria.
Se o processo Node.js termina antes do callback, o timer deixa de existir e nenhum
codigo futuro daquele processo executa `persistHaltState(assetId, false, null)`.
O DB, por outro lado, sobrevive ao processo e conserva `isHalted=true`.

O que ainda e `hipotese` e a explicacao completa do ambiente de producao:
deploy, crash, perda de lideranca ou overlap de containers podem interromper o
processo antes da retomada, mas o evento exato que produziu os 37 halts nao foi
observado diretamente no DB/Redis no instante do boot.

O fix de startup cleanup incondicional reduz o sintoma operacional, mas nao e o
contrato mais robusto. A recomendacao tecnica, sob a premissa de que o DB deve
carregar a semantica duravel do halt, e combinar:

1. `haltedUntil` persistido no DB como expiracao canonica do halt automatico.
2. Motor e frontend derivando "halt ativo" de `isHalted && haltedUntil > now`
   para CB automatico, com limpeza idempotente de expirados.
3. Timers em memoria armazenados em `Map` e cancelados no `engine.stop()` para
   evitar callbacks tardios e writes depois da perda de lideranca.
4. `loadAssets()` reconciliando o DB com o estado em memoria, em vez de ignorar
   `isHalted`.

Essa recomendacao nao deve ser lida como mudanca trivial. `haltedUntil` exige
migration Prisma coordenada com o frontend Next.js, e `loadAssets()` reconciliando
o DB altera o comportamento de startup: hoje o motor volta com todos os ativos
operacionalmente ativos, mesmo quando o DB ficou com halts stale. Persistir halts
atraves de restart pode ser desejavel para halts administrativos, mas pode ser
indesejavel para operacao que privilegia retomada automatica apos deploy.

## Contexto observado no codigo

Motor Node.js/TypeScript, deploy Railway:

- `MarketEngine.ts`: engine singleton, ticks via `setInterval`, leader election
  via Redis.
- `LeaderElection.ts`: `motor:leader` com TTL de 30s, heartbeat de 10s e
  `motor:fencing-token`.
- Circuit breaker: quando a camada de preco retorna `halted=true`, o motor seta
  estado local, chama `notifyCircuitBreaker()`, persiste `isHalted=true` e agenda
  `setTimeout(PAUSE_RESUME_MS)`.
- `engine.stop()`: cancela `tickTimer`, dispoe agentes e opcionalmente desconecta
  Prisma. No codigo atual verificado nesta revisao, tambem cancela timers de CB
  mantidos em `Map`; em versoes anteriores auditadas, essa protecao nao existia.
- `engine.start()`: antes de `loadAssets()`, executa cleanup incondicional:

```typescript
const cleared = await this.prisma.asset.updateMany({
  where: { isHalted: true },
  data: { isHalted: false, haltReason: null },
})
```

- `loadAssets()`: carrega ativos ativos do DB, mas inicializa
  `isPaused: false`, `haltReason: null` e `haltResumeAt: null` para todos.
- Schema Prisma atual de `Asset`: tem `isHalted` e `haltReason`, mas nao tem
  `haltedUntil`.
- Frontend e APIs leem `isHalted` do DB para badges, bloqueios e paineis.

Fluxo relevante do CB:

```typescript
state.isPaused = true
state.haltReason = 'CIRCUIT_BREAKER'
state.haltResumeAt = Date.now() + PAUSE_RESUME_MS

this.notifyCircuitBreaker(assetId, state.ticker, variationPct, resumeAt, sessionType)
  .catch(console.error)

setTimeout(() => {
  state.isPaused = false
  state.haltReason = null
  state.haltResumeAt = null
  this.persistHaltState(assetId, false, null).catch(console.error)
}, PAUSE_RESUME_MS)
```

Observacao tecnica: `notifyCircuitBreaker()` persiste `isHalted=true` antes de
publicar notificacao Redis. O timer que desfaz o halt fica fora do DB e fora do
Redis.

## Sintoma observado

Apos restarts do motor em producao:

- DB: 37 de 40 ativos com `isHalted=true`.
- Motor em memoria: 0 pausados, porque `loadAssets()` ignora `isHalted`.
- Frontend: 37 cards exibindo badge "Pausado", pois le o DB.
- Health do motor: OK, ticks rodando.

`hipotese`: a contagem 37 de 40 pode refletir uma janela de mercado em que muitos
ativos acionaram CB. Essa correlacao nao foi confirmada com uma serie temporal de
ticks, logs de CB e snapshots do DB.

## Causa raiz confirmada vs hipotese

### Estabelecido mecanicamente

Em Node.js, `setTimeout()` registra um callback no event loop do processo. Ele nao
e duravel. Se o processo termina, o heap, os handles e a fila de callbacks deixam
de existir. Portanto, qualquer retomada cujo unico mecanismo seja esse timer nao
executa depois de deploy, crash, `SIGKILL`, perda de container ou shutdown que
encerre o processo antes de `PAUSE_RESUME_MS`.

No codigo auditado, o CB faz duas coisas com durabilidades diferentes:

- Duravel: grava `Asset.isHalted=true` no Postgres.
- Nao duravel: agenda retomada por `setTimeout()` em memoria.

Essa assimetria e suficiente para produzir halts persistentes. Nao depende de
Railway especificamente.

Tambem e estabelecido pelo codigo atual que `engine.stop()` cancela timers de CB
mantidos em `Map`. Isso reduz writes tardias em shutdown gracioso e perda de
lideranca, mas nao muda a causa raiz: se o processo cair por crash, `SIGKILL`,
OOM ou encerramento abrupto antes do callback, `engine.stop()` nao executa. Logo,
o problema primario continua sendo a ausencia de uma expiracao duravel para o halt
automatico.

### Hipoteses sobre producao

`hipotese`: os 37 halts persistentes foram produzidos por um ou mais processos
que morreram, reiniciaram ou perderam lideranca antes de os respectivos timers de
300s executarem.

`hipotese`: em deploy Railway com overlap de containers, um container antigo pode
continuar vivo por alguns segundos depois de o novo iniciar. Isso depende da
semantica real de deploy do servico, nao verificada neste documento por fonte
externa nem por log de plataforma completo.

`afirmacao nao verificada`: "ao adquirir lideranca, nenhuma outra instancia esta
ativa" e forte demais como proposicao operacional. O Redis pode garantir que uma
instancia tenha a chave de lideranca em certo instante, mas isso nao implica que
outro processo ja tenha morrido nem que ele nao consiga executar callbacks locais
ou writes Prisma que nao consultem o lease antes de escrever.

## Resposta 1: por que `cleared.count=0` no boot do fix incondicional?

Com `where: { isHalted: true }`, `updateMany()` deveria retornar `count > 0` se,
naquele DB e naquele instante, ainda houvesse rows com `isHalted=true` alcançadas
pelo Prisma. Portanto, `cleared.count=0` e evidencia de que a query nao encontrou
rows halted no momento em que executou, ou de que o log observado nao correspondeu
ao boot/query que se queria observar.

As duas hipoteses registradas sao plausiveis, mas nao equivalentes.

### Hipotese A: deploy anterior com guard limpou antes

`hipotese A`: o deploy anterior, ainda com guard `updatedAt < now - 330s`, rodou
por tempo suficiente para limpar halts antigos. Quando o fix incondicional iniciou,
o DB ja estava em `isHalted=false`.

Forca da hipotese:

- Compatível com um intervalo de aproximadamente 30min entre deploys.
- Compatível com o fato de os halts persistentes provavelmente terem `updatedAt`
  antigo em relacao ao boot seguinte.
- Compatível com os checks pos-fix mostrando 0 pausados.

Fragilidade:

- O documento nao registra o `updatedAt` das 37 rows antes da limpeza.
- O `updateMany()` de cleanup altera `updatedAt` por causa do campo Prisma
  `@updatedAt`, apagando parte da evidencia temporal anterior.
- Se o deploy anterior tinha o mesmo log condicional `if (cleared.count > 0)`,
  a ausencia desse log em amostra limitada nao prova que a limpeza nao ocorreu.

### Hipotese B: logs do cleanup ficaram fora da janela consultada

`hipotese B`: o cleanup do fix pode ter retornado `count > 0`, mas a mensagem
correspondente ficou fora da janela curta de logs retornada pela API do Railway.

Forca da hipotese:

- Compatível com coleta baseada em janela limitada de logs.
- Compatível se houve muitos logs de tick, health, RSS ou startup depois do boot.

Fragilidade:

- O texto afirma que o deploy do fix "logou `cleared.count=0`". Se houve um log
  explicito ou metrica do valor zero, a hipotese B perde forca. Se apenas nao houve
  a mensagem `Startup: N halts stale limpos`, entao B continua possivel.
- O codigo atual so loga quando `cleared.count > 0`. Ausencia de log nao distingue
  `count=0` de log perdido.

### Como discriminar sem acesso direto ao DB no instante do boot

Evidencia obtivel depois do fato:

- Logs do deploy anterior: procurar mensagem de cleanup, horario de `engine.start()`
  e qualquer log de `CIRCUIT_BREAKER publicado`.
- Logs do fix: adicionar log incondicional de cleanup com `count`, timestamp,
  `DATABASE_URL` redigida por host/dbname, `RAILWAY_DEPLOYMENT_ID` e `motorId`.
- Health history ou snapshots externos: comparar quantidade de halted antes e
  depois de cada deploy, com timestamps absolutos.
- Auditoria via codigo: antes de limpar, emitir uma agregacao sem dados sensiveis:
  `count`, menor `updatedAt`, maior `updatedAt` e contagem por `haltReason`.
- Redis: correlacionar `motor:fencing-token`, aquisicao de lideranca e perda de
  heartbeat nos logs.

Proposta TypeScript para tornar a proxima ocorrencia verificavel:

```typescript
// Proposta: observabilidade antes/depois do cleanup, sem expor dados sensiveis.
const before = await this.prisma.asset.aggregate({
  where: { isHalted: true },
  _count: { _all: true },
  _min: { updatedAt: true },
  _max: { updatedAt: true },
})

const byReason = await this.prisma.asset.groupBy({
  by: ['haltReason'],
  where: { isHalted: true },
  _count: { _all: true },
})

const cleared = await this.prisma.asset.updateMany({
  where: { isHalted: true },
  data: { isHalted: false, haltReason: null },
})

logger.warn('[engine] Startup halt cleanup', {
  haltedBefore: before._count._all,
  oldestUpdatedAt: before._min.updatedAt?.toISOString() ?? null,
  newestUpdatedAt: before._max.updatedAt?.toISOString() ?? null,
  byReason,
  cleared: cleared.count,
  deploymentId: process.env.RAILWAY_DEPLOYMENT_ID ?? null,
})
```

Tensao operacional: essa proposta adiciona pelo menos duas leituras antes do
`updateMany()` (`aggregate` e `groupBy`) no caminho de startup. Em Railway, com
conexao interna lenta ou cold start de DB, `hipotese`: isso pode atrasar o primeiro
tick em producao. A observabilidade deve ser proporcional ao incidente: habilitada
por feature flag, limitada a ambiente de producao durante investigacao, ou
amostrada quando `RAILWAY_DEPLOYMENT_ID` muda. Se o objetivo for apenas remover
halts stale rapidamente, um log incondicional do `cleared.count` apos o cleanup
tem menor custo que agregacoes pre-cleanup.

## Resposta 2: existe race condition em `onBecameLeader -> engine.start()`?

No fluxo local, `onBecameLeader()` chama `engine.start()` depois de
`leader.tryAcquire()` retornar sucesso. A race relevante nao e uma race interna
entre `onBecameLeader` e `engine.start`; e uma race distribuida entre:

- lease Redis com TTL;
- heartbeat do lider antigo;
- callbacks/timers ja agendados no processo antigo;
- writes Prisma que nao verificam fencing token;
- startup cleanup do novo lider.

`hipotese`: o sistema tem fencing token, mas as writes de `persistHaltState()`
nao carregam esse token para o DB nem validam "ainda sou lider" antes de gravar.
Logo, o fencing existe para diagnostico/leader state, mas nao protege as writes
de halt contra um processo antigo ainda vivo.

Como confirmar sem acesso direto a Redis/DB:

- Logar `motorId`, `fencingToken`, `deploymentId` e resultado de `isCurrentLeader()`
  antes de cada write de halt.
- Logar no callback do `setTimeout()` se o motor ainda e lider antes de persistir
  retomada.
- Emitir evento estruturado em `onLeadershipLost`, `engine.stop`, `engine.start`,
  `persistHaltState(true)` e `persistHaltState(false)`.
- Procurar interleaving temporal: novo lider limpou halts, depois processo antigo
  persistiu `isHalted=true` ou `false`.

Sem esses logs, a race permanece `hipotese`, nao fato confirmado.

## Resposta 3: risco do fix atual em blue-green/rolling deploy Railway

O fix atual assume que, ao iniciar como lider, todo `isHalted=true` no DB e stale.
Essa suposicao e aceitavel apenas se estas condicoes forem verdadeiras ao mesmo
tempo:

- nao ha outro processo capaz de escrever `Asset.isHalted`;
- o lider antigo ja parou ticks e callbacks de CB;
- nao ha timer de CB pendente em processo antigo;
- writes Prisma so ocorrem a partir do lider atual.

No codigo auditado, essas condicoes nao sao garantidas pelo DB.

O container antigo pode re-setar `isHalted=true` depois de o novo lider limpar?
Sim, em condicoes especificas:

1. O antigo ainda esta vivo e executando ticks ou callbacks.
2. Ele aciona CB ou conclui `notifyCircuitBreaker()` depois do cleanup do novo.
3. A write `persistHaltState(assetId, true, 'CIRCUIT_BREAKER')` chega ao DB depois
   do `updateMany({ isHalted: true }, false)` do novo lider.
4. Essa write nao valida lease/fencing antes de gravar.

Janela possivel:

- Pelo lease: ate o antigo detectar perda de lideranca no proximo heartbeat, ou
  ate o TTL de 30s expirar e o novo adquirir lideranca. Com heartbeat de 10s e TTL
  de 30s, a janela operacional de incerteza pode ficar na ordem de segundos a
  dezenas de segundos.
- Pelo deploy: `hipotese`, se Railway enviar `SIGTERM` e aguardar um periodo de
  graceful shutdown, o antigo pode continuar executando ate o encerramento efetivo.
  A duracao exata depende da plataforma e configuracao do servico.
- Pelo codigo: se o processo antigo nao morre, timers de CB podem executar ate
  300s depois de agendados. No caso de re-setar `true`, o risco vem do tick/CB
  enquanto o antigo ainda roda; no caso de re-setar `false`, vem do callback de
  retomada pendente.

Conclusao: o cleanup incondicional e um mitigador operacional, nao uma garantia
de consistencia distribuida. Ele e vulneravel a last-writer-wins se uma instancia
antiga escrever depois do novo lider.

## Resposta 4: abordagem mais robusta

### Opcao 1: `Map` de timers e `clearTimeout()` no `engine.stop()`

Status no codigo atual: implementado.

Beneficio:

- Evita callbacks de retomada depois de `engine.stop()`.
- Reduz writes tardias de processo que perdeu lideranca.
- Melhora higiene do lifecycle Node.js.

Limite:

- Nao resolve crash, `SIGKILL`, OOM, queda de container ou fim abrupto do processo.
- Nao torna o estado auto-expiravel.
- Nao corrige divergencia se o DB ja esta `isHalted=true` e o motor reinicia sem
  reconciliar.

Conclusao: necessario, ja reduz superficie de race em shutdown gracioso, mas e
insuficiente como solucao de causa raiz. Ele corrige o caso "processo ainda vivo
depois de stop", nao o caso "processo desapareceu antes da retomada".

Proposta TypeScript:

```typescript
// Proposta: armazenar timers de CB por asset.
private circuitBreakerTimers = new Map<string, ReturnType<typeof setTimeout>>()

private scheduleCircuitBreakerResume(assetId: string, state: AssetState): void {
  const previous = this.circuitBreakerTimers.get(assetId)
  if (previous) clearTimeout(previous)

  const timer = setTimeout(() => {
    this.circuitBreakerTimers.delete(assetId)
    state.isPaused = false
    state.haltReason = null
    state.haltResumeAt = null
    this.persistHaltState(assetId, false, null).catch(console.error)
  }, PAUSE_RESUME_MS)

  this.circuitBreakerTimers.set(assetId, timer)
}

async stop(disconnectPrisma = false): Promise<void> {
  if (this.tickTimer) {
    clearInterval(this.tickTimer)
    this.tickTimer = null
  }

  for (const timer of this.circuitBreakerTimers.values()) {
    clearTimeout(timer)
  }
  this.circuitBreakerTimers.clear()

  agentOrchestrator.dispose()
  if (disconnectPrisma) await this.prisma.$disconnect()
  logger.info('[engine] Engine encerrado.')
}
```

### Opcao 2: `loadAssets()` respeitar/reconciliar `isHalted` do DB

Beneficio:

- Remove a divergencia imediata "motor ativo, DB pausado".
- Permite que o motor carregue ativos pausados de forma explicita.
- Torna restart menos surpreendente para quem espera que o DB seja duravel.

Limite:

- Sem `haltedUntil`, o motor nao sabe se um halt de CB ainda e valido ou stale.
- Se tratar todo `isHalted=true` como ativo, perpetua halts antigos.
- Se tratar todo `isHalted=true` como stale, pode liberar halt administrativo ou
  um CB legitimo durante deploy.
- Muda uma propriedade operacional atual: hoje o motor arranca 100% dos ativos
  como operacionalmente ativos. Isso e incoerente com o frontend quando o DB esta
  stale, mas tambem evita que um halt administrativo esquecido bloqueie ticks apos
  restart. Reconciliar o DB torna o halt persistente de verdade, o que pode ser
  requisito de produto ou surpresa operacional, dependendo do uso real.

Conclusao: deve existir, mas precisa de uma coluna de expiracao e semantica por
motivo do halt.

Proposta TypeScript apos introduzir `haltedUntil`:

```typescript
// Proposta: reconciliar estado persistido no carregamento.
const now = new Date()
const assets = await this.prisma.asset.findMany({ where: { isActive: true } })

for (const asset of assets) {
  const haltedUntilMs = asset.haltedUntil?.getTime() ?? null
  const cbStillActive =
    asset.isHalted &&
    asset.haltReason === 'CIRCUIT_BREAKER' &&
    haltedUntilMs !== null &&
    haltedUntilMs > now.getTime()

  const adminHaltActive =
    asset.isHalted &&
    asset.haltReason !== 'CIRCUIT_BREAKER'

  const isPaused = cbStillActive || adminHaltActive

  const state: AssetState = {
    // demais campos omitidos
    id: asset.id,
    ticker: asset.ticker,
    isPaused,
    haltReason: isPaused ? asset.haltReason : null,
    haltResumeAt: cbStillActive ? haltedUntilMs : null,
  } as AssetState
}
```

### Opcao 3: TTL/expiry persistido no registro de halt

Beneficio:

- Torna o halt automatico auto-expiravel.
- Remove dependencia de processo vivo para o significado do estado.
- Permite ao frontend mostrar countdown com base em dado canonico.
- Permite ao motor limpar expirados de forma idempotente.
- Distingue CB automatico de halt administrativo sem expiracao.

Trade-off:

- Exige migration Prisma/DB e ajuste das APIs.
- Exige contrato claro para `haltReason`.
- Exige cuidado para que queries antigas que filtram apenas `isHalted` passem a
  considerar expiracao.
- Para um time pequeno sem infra dedicada, em Railway, essa nao e uma operacao
  neutra: migration Prisma precisa ser coordenada com o frontend Next.js, com
  compatibilidade entre versoes durante deploy. Se o frontend antigo ler apenas
  `isHalted`, ele pode continuar exibindo pausa mesmo quando `haltedUntil` expirou.
- Exige plano de rollout: adicionar coluna nullable, publicar codigo que escreve
  e le o novo campo, atualizar APIs/frontend, e so depois endurecer invariantes.

Conclusao: e a opcao mais robusta se o projeto aceitar o custo de contrato e
rollout, porque move a invariavel principal para uma camada duravel. Nao deve ser
tratada como hotfix trivial.

Proposta de schema:

```prisma
model Asset {
  // campos existentes
  isHalted    Boolean   @default(false) @map("is_halted")
  haltReason  String?   @map("halt_reason")
  haltedUntil DateTime? @map("halted_until")
}
```

Proposta TypeScript para persistir CB com expiracao:

```typescript
private async persistCircuitBreakerHalt(
  assetId: string,
  haltedUntil: Date
): Promise<void> {
  await this.prisma.asset.update({
    where: { id: assetId },
    data: {
      isHalted: true,
      haltReason: 'CIRCUIT_BREAKER',
      haltedUntil,
    },
  })
}

private async clearExpiredCircuitBreakerHalts(now = new Date()): Promise<number> {
  const result = await this.prisma.asset.updateMany({
    where: {
      isHalted: true,
      haltReason: 'CIRCUIT_BREAKER',
      haltedUntil: { lte: now },
    },
    data: {
      isHalted: false,
      haltReason: null,
      haltedUntil: null,
    },
  })

  return result.count
}
```

Proposta para leitura no frontend/API:

```typescript
// Proposta: derivar status efetivo. Para halt admin sem expiry, continua halted.
function isEffectivelyHalted(asset: {
  isHalted: boolean
  haltReason: string | null
  haltedUntil: Date | null
}, now = new Date()): boolean {
  if (!asset.isHalted) return false
  if (asset.haltReason === 'CIRCUIT_BREAKER') {
    return asset.haltedUntil !== null && asset.haltedUntil > now
  }
  return true
}
```

### Recomendacao final

A combinacao mais robusta e:

1. Implementar `haltedUntil` e fazer CB automatico expirar por contrato de dados.
2. Ajustar motor, APIs e frontend para calcular halt efetivo com base em
   `haltReason` e `haltedUntil`.
3. Manter startup cleanup apenas para halts de CB expirados, nao para todo
   `isHalted=true`.
4. Manter `Map` de timers e `clearTimeout()` no `engine.stop()`.
5. Fazer `loadAssets()` reconciliar o DB, preservando halts ainda validos e
   limpando expirados.

Isso troca uma dependencia fragil de processo vivo por um contrato persistido.
O timer passa a ser otimizacao de latencia, nao fonte da verdade.

Leitura adversarial: essa recomendacao e robusta do ponto de vista de consistencia
duravel, mas aumenta acoplamento entre motor, Prisma schema, API e frontend. Se a
prioridade do time for manter operacao simples e evitar migrations coordenadas, o
contrato alternativo "motor como fonte operacional, DB como espelho para UI" pode
ser defensavel, desde que o espelho seja corrigido no startup e nao usado como
bloqueio canonico sem reconciliacao.

## Resposta 5: contrato correto entre memoria do motor e DB

O contrato recomendado abaixo nao e o unico defensavel. Ele privilegia consistencia
duravel e previsibilidade entre processos. Existe um contrato alternativo, tambem
coerente, em que o motor e a fonte operacional e o DB e um espelho de comunicacao
para frontend. Esse contrato alternativo descreve melhor o comportamento observado:
o motor carregava `isPaused=false`, continuava tickando, e o problema visivel foi
unidirecional, com DB/frontend dizendo "pausado" enquanto o motor dizia "ativo".
O incidente nao demonstrou, por si so, que o motor deva obedecer ao DB em todo
restart.

O contrato recomendado:

- DB e a fonte da verdade duravel para bloqueio de ordens e representacao
  cross-process: `isHalted`, `haltReason`, `haltedUntil`.
- Memoria do motor e cache operacional para ticks e pipeline quantitativo.
- Redis/SSE e canal de propagacao em tempo real, nao fonte duravel.
- Frontend deve renderizar o status efetivo derivado do DB no SSR/API e aceitar
  ticks Redis/SSE como atualizacao mais recente, desde que a semantica de expiry
  seja a mesma.

Anti-pattern atual:

- DB diz "pausado".
- Motor carrega "ativo" por default.
- Frontend mostra "pausado".
- Ordem e UI podem divergir de tick e health.

Contrato alternativo defensavel:

1. Motor e fonte operacional para ticks e bloqueio de ordens.
2. DB e espelho para UI, auditoria leve e comunicacao cross-process.
3. No startup, motor limpa ou reescreve o espelho do DB para refletir seu estado
   operacional inicial.
4. Halts administrativos, se existirem, precisam de canal explicito diferente de
   `isHalted` automatico, ou deixam de ser garantidos atraves de restart.

Esse contrato reduz migrations e acoplamento com frontend, mas aceita que o DB
nao seja fonte canonica de bloqueio. Ele tambem exige honestidade no produto: UI
nao pode vender `isHalted` como verdade duravel se o motor tem autoridade para
ignora-lo no boot.

Contrato proposto:

1. Toda ativacao de halt grava no DB o motivo e, se for automatico, a expiracao.
2. Toda leitura calcula `effectiveHalted`.
3. `loadAssets()` inicializa `state.isPaused` a partir de `effectiveHalted`.
4. Timers de retomada podem antecipar a limpeza, mas a expiracao no DB garante
   que restart nao perpetue halt.
5. Halts administrativos devem ter semantica separada: sem `haltedUntil`, ou com
   campo explicito de origem/tipo. Nao devem ser limpos por cleanup de CB.

Proposta de funcao compartilhavel entre motor e API:

```typescript
type HaltReason = 'CIRCUIT_BREAKER' | 'FORCE_CIRCUIT_BREAKER' | string

interface HaltFields {
  isHalted: boolean
  haltReason: HaltReason | null
  haltedUntil: Date | number | null
}

export function getEffectiveHalt(asset: HaltFields, nowMs = Date.now()) {
  if (!asset.isHalted) {
    return { halted: false, haltedUntil: null, reason: null }
  }

  if (asset.haltReason === 'CIRCUIT_BREAKER') {
    const untilMs =
      asset.haltedUntil instanceof Date
        ? asset.haltedUntil.getTime()
        : asset.haltedUntil

    if (untilMs && untilMs > nowMs) {
      return { halted: true, haltedUntil: untilMs, reason: asset.haltReason }
    }

    return { halted: false, haltedUntil: null, reason: null }
  }

  return { halted: true, haltedUntil: null, reason: asset.haltReason }
}
```

## Contra-argumentos e tensoes

- `haltedUntil` e tecnicamente limpo, mas operacionalmente caro. Em um time
  pequeno, rodando em Railway e sem infra dedicada, uma migration Prisma nao e
  apenas adicionar uma coluna. Ela cria uma janela de compatibilidade entre motor,
  API e Next.js. Se uma versao antiga do frontend continuar lendo apenas
  `isHalted`, o ganho semantico de `haltedUntil` nao aparece na UI.
- Reconciliar `loadAssets()` com o DB torna o restart menos divergente, mas tambem
  muda uma propriedade que hoje favorece retomada operacional: o motor volta com
  todos os ativos ativos. Se um operador esperava que restart limpasse halts
  acidentais, a nova semantica sera percebida como regressao. Se esperava que halt
  administrativo sobrevivesse a deploy, a semantica atual e que e perigosa.
- Observabilidade pre-cleanup ajuda a reconstruir incidente, mas nao deve entrar
  sem custo no caminho critico. `aggregate` e `groupBy` antes de `updateMany()`
  podem atrasar startup e primeiro tick. `hipotese`: esse atraso pode ser relevante
  em Railway quando DB interno esta lento ou em cold start.
- `Map` de timers no `engine.stop()` e uma melhoria real, ja presente no codigo
  atual, mas nao resolve o bug original em falha abrupta. O melhor contra-argumento
  contra trata-lo como fix raiz e simples: o caminho problematico e exatamente
  aquele em que nenhum callback local nem `stop()` executa.
- O cleanup com `updatedAt < staleCutoff` parece conservador, mas reintroduz a
  mesma fragilidade conceitual do guard original: usar tempo de ultima atualizacao
  como proxy de expiracao. Exemplo concreto: se o motor morreu 10 minutos atras e
  os CBs foram agendados 11 minutos atras, cleanup incondicional limpa. O cleanup
  conservador so limpa se `updatedAt` ainda representar aquele agendamento; se
  outro update tocou a row depois do CB, o guard temporal pode nao limpar. O
  threshold muda, mas a premissa fragil permanece.
- A frase "DB e fonte da verdade duravel" precisa ser uma decisao de arquitetura,
  nao uma conclusao automatica do incidente. O fato observado foi DB stale contra
  motor ativo. O documento deve escolher o contrato explicitamente e aceitar seus
  custos, em vez de tratar o contrato atual como indefensavel por definicao.

## Revisao do fix atual

O cleanup incondicional:

```typescript
await prisma.asset.updateMany({
  where: { isHalted: true },
  data: { isHalted: false, haltReason: null },
})
```

Vantagem:

- Remove rapidamente halts stale herdados de processo morto.

Riscos:

- Limpa tambem halts administrativos ou halts legitimos ainda dentro da janela de
  300s.
- Assume single-writer real, mas as writes Prisma nao validam fencing.
- Pode ser sobrescrito por write tardia de container antigo.
- Apaga evidencia temporal via `updatedAt`.

Recomendacao de curto prazo, antes da migration:

- Logar cleanup de forma incondicional.
- Limitar cleanup automatico a `haltReason: 'CIRCUIT_BREAKER'`.
- Antes de limpar, registrar agregados por `haltReason` e faixa de `updatedAt`.
- Manter `Map` de timers e `clearTimeout()` no `engine.stop()`.
- Antes de persistir halt em callbacks/ticks, verificar se a instancia ainda e
  lider, quando essa dependencia puder ser injetada no `MarketEngine`.

Proposta conservadora sem `haltedUntil`:

```typescript
const staleCutoff = new Date(Date.now() - PAUSE_RESUME_MS - 30_000)

const cleared = await this.prisma.asset.updateMany({
  where: {
    isHalted: true,
    haltReason: 'CIRCUIT_BREAKER',
    updatedAt: { lt: staleCutoff },
  },
  data: { isHalted: false, haltReason: null },
})
```

Essa versao ainda e imperfeita, porque `updatedAt` nao e um campo de expiracao de
halt. E apenas menos destrutiva que limpar todo `isHalted=true`.

Pior: ela pode reintroduzir o bug original por outro nome. O guard temporal tenta
inferir validade do halt a partir de um timestamp que pode ter sido alterado por
outros updates. Se o processo morreu 10 minutos atras, mas a row recebeu update
posterior por outro fluxo, o cleanup conservador nao limpa mesmo que o CB ja tenha
expirado. Sem `haltedUntil`, nao ha como distinguir "halt ainda valido" de
"timestamp recente por motivo irrelevante" com seguranca.

## Verificacao empirica pos-fix

Monitoramento de producao via endpoint de health e agregador de status de ativos
em 2026-05-24:

- Check 1, 05:05:08 UTC: total 40, OK 40, pausados 0.
- Check 2, 05:06:39 UTC: total 40, OK 40, pausados 0.
- Check 3, 05:08:11 UTC: total 40, OK 40, pausados 0.

Interpretacao: o sintoma visivel estava normalizado nessa janela de cerca de 3
minutos. Isso valida o efeito operacional imediato do fix, mas nao prova ausencia
de race em deploys futuros nem corrige o contrato de estado.

## Hipoteses e pontos em disputa

- `hipotese`: os 37 de 40 halts vieram de uma janela com muitos CBs reais antes
  de restart. Falta correlacionar logs de `CIRCUIT_BREAKER publicado`, ticks e
  snapshots do DB.
- `hipotese`: o deploy anterior com guard limpou os 37 halts antes do fix
  incondicional. Falta log incondicional ou snapshot de `updatedAt` anterior.
- `hipotese`: a ausencia de mensagem de cleanup no fix se deve a janela limitada
  de logs. Essa hipotese so vale se nao houve log explicito de `cleared.count=0`.
- `afirmacao nao verificada`: a semantica exata de blue-green/rolling deploy do
  Railway para este servico. E necessario confirmar se ha overlap de containers,
  quanto tempo dura o graceful shutdown e se `SIGTERM` sempre chega ao processo.
- `hipotese`: o fencing token atual nao protege writes de halt, porque nao e
  persistido nem validado nas updates Prisma.
- Ponto aberto de produto: halts administrativos devem ser persistentes ate acao
  manual, enquanto CB automatico deve ser auto-expiravel. O schema atual mistura
  ambos em `isHalted`/`haltReason` sem `haltedUntil`.
- Ponto em disputa: DB deve ser fonte canonica de halt ou espelho de comunicacao
  do motor? A resposta determina se `loadAssets()` deve reconciliar halts ou
  sobrescrever o DB no startup.
- Ponto em disputa: o custo de migration Prisma coordenada com Next.js compensa
  agora, ou a prioridade de curto prazo deve ser um cleanup de espelho mais simples
  e observabilidade temporaria?
- Ponto aberto de observabilidade: falta log estruturado com `motorId`,
  `deploymentId`, `fencingToken`, `haltReason`, `haltedUntil` e resultado de
  limpeza para reconstruir uma linha do tempo sem acesso direto ao DB no instante
  do boot.
