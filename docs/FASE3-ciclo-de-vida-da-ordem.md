# Fase 3 — Ciclo de vida da ordem

Data: 2026-09-02. Escopo: persistir tentativa/erro/proxima tentativa na ordem, cancelar por
esgotamento, trocar a varredura de lote fixo por elegibilidade em query, rotear todo evento
terminal de ordem por notificacao duravel, declarar a regra do MARKET na expiracao e expor o
motivo no historico.

Insumos: brainstorm `blacksmith/brainstorm-mcp/09-02-foot-stock-sessao-ordens-abertas-noticias-multi-time.md`,
advisory Kimi (`kimi-4b3f93a1379`), investigacao multi-dimensao do codigo (tick-loop,
escritores de status, notificacoes, migrations, testes, settlement).

---

## 1. Estado da base antes desta fase

- O tick roda a cada 10s com anti-reentrancia (`tickInFlight` **pula**, nao enfileira).
- O lote e relido do zero a cada tick: `OrderExecutor` `take: 50`, `OrderMatcher` `take: 100`,
  ambos `orderBy: createdAt asc`. Ordem que falha para sempre fica na cabeca da fila e come
  slot de lote em todos os ticks — starvation das ordens novas.
- `settleOrderFill` so produz dois desfechos nao liquidados: `ALREADY_SETTLED` (no-op de
  corrida) e `INSUFFICIENT_BALANCE` (a propria transaction ja grava `CANCELLED`).
- Excecoes da transaction Serializable (P2034, deadlock 40P01, P2002) **nao sao classificadas**
  por nenhum caller.
- Notificacao duravel: os tres caminhos do motor (`OrderExecutor`, `OrderMatcher`,
  `ScheduledOrderRunner`) **ja** passam por `persistOrderNotification` desde a correcao de
  Zero Silencio de 02/09. Continuam **sem** notificacao duravel: `OrderService.cancelOrder`
  (cancelamento pelo usuario, o mais comum de todos), o force-cancel do admin e o
  `closeAllOpenPositions` do `cancellation-expiry` (T+7).
- Nenhuma ordem guarda **por que** foi cancelada. O vocabulario existe espalhado no codigo
  (`INSUFFICIENT_BALANCE`, `ASSET_HALTED`, `expiry`, `USER_REQUEST`), so nao esta persistido.

---

## 2. Modelagem: colunas na propria ordem

Decisao: colunas em `orders`, nao tabela filha. A query quente decide elegibilidade a cada
10s e o `updateMany` com CAS precisa tocar atomicamente a mesma linha que decide; um join
por lote a cada tick paga custo continuo para comprar auditoria que ninguem pediu.

| Coluna | Tipo | Semantica |
|---|---|---|
| `attemptCount` | `Int @default(0)` | tentativas de execucao **falhas** que contaram (§3) |
| `lastAttemptAt` | `DateTime?` | quando foi a ultima falha contada |
| `lastErrorCode` | `String?` | codigo curto e estavel (`P2034`, `40P01`, `UNKNOWN`) |
| `nextAttemptAt` | `DateTime?` | usado pelo filtro de elegibilidade (§4) |
| `cancelReason` | `String?` | motivo terminal, vocabulario fechado (§6) |

**Nunca gravar mensagem de erro crua.** `describeError` existe porque a mensagem do
Prisma muda de formato entre versoes, quebra dump de log e pode carregar dado sensivel. O
stack fica no log estruturado, indexado por `orderId`.

**Escrita rara por desenho.** O caso feliz (MARKET que executa no primeiro tick) nunca toca
essas colunas. So ha escrita quando o estado de retentativa muda: primeira falha, incremento,
agendamento, cancelamento por esgotamento. Isso e o que impede o `updatedAt` de virar ruido —
consequencia registrada aqui porque o front exibe e ordena por datas.

**Indice.** `@@index([status, type, nextAttemptAt])` — igualdade em `status`, igualdade em
`type`, range em `nextAttemptAt`, exatamente a forma do WHERE quente.

Desvio deliberado do advisory: o indice **nao** e parcial. Um `WHERE status IN
('OPEN','PARTIAL')` seria menor, mas o Prisma nao declara predicado de indice no schema, entao
o indice parcial teria de nascer em SQL cru na migration e o proximo `prisma migrate dev`
geraria um `DROP INDEX` para reconciliar com o schema — trocariamos alguns megabytes por drift
silencioso entre schema e banco, que e justamente o defeito de classe que a §8.4 tenta evitar.
O indice cheio segue a mesma convencao dos `@@index([status])` e
`@@index([assetId, status, side, type, createdAt])` que a tabela ja carrega.

---

## 3. Semantica do backoff e do limite

Tres classes de desfecho, classificadas **por codigo**, nunca por substring de mensagem.

### 3.1 Nao-tentativa (skip: nao conta, nao toca coluna alguma)

1. **Ticker ausente de `currentPrices`.** Ja e skip com log. Causa raiz conhecida:
   `MarketEngine.loadAssets()` so roda no boot, entao ativo criado/reativado depois do boot
   do lider nunca entra em `currentPrices`.
2. **Ativo em halt.** Ja cancela terminal com motivo proprio (`ASSET_HALTED`).
3. **`ALREADY_SETTLED`** e **P2002 na liquidacao** — no-op de corrida.

Esta lista e o risco numero um da fase (§8.1): contar precondicao como falha de execucao
cancelaria ordem perfeitamente sa.

### 3.2 Tentativa que conta

Qualquer excecao lancada pela transaction de `settleOrderFill`: P2034, deadlock 40P01,
P2002 inesperado fora do caminho de liquidacao, erro desconhecido. `describeError` ja extrai
`errCode` de `PrismaClientKnownRequestError` — a classificacao usa esse campo estruturado.

`INSUFFICIENT_BALANCE` **nao e** retentativa: a settlement ja decidiu e ja gravou o terminal
dentro da tx. A Fase 3 so garante que esse caminho tambem grave `cancelReason`.

### 3.3 Parametros

- `MAX_ATTEMPTS = 5`.
- Backoff: **as duas primeiras ocorrencias transitorias** (`P2034`, `40P01`) reagendam para o
  proximo tick (`+10s`); a partir da terceira, exponencial com teto:
  `nextAttemptAt = now + min(2^(attempt-2) * 60s, 15min)`.
- Falha nao-transitoria usa o exponencial desde a primeira ocorrencia.

Racional: P2034/deadlock sao normais sob contencao (o proprio `MarginCallChecker` documenta
"o proximo tick re-liquida"). Se transitorias consumissem o orcamento com backoff longo, um
pico de volume viraria cancelamento em massa do que deveria ser so fila lenta. O backoff
curto nas duas primeiras protege o caso transitorio tipico; o exponencial tira da cabeca da
fila o que e persistente. Falha persistente atinge o teto em ~4 tentativas e e cancelada em
menos de uma hora — nao em dias.

Limite contado em **tentativas**, nao em ticks: contar tick puniria exatamente o caso
transitorio que nao se quer punir.

---

## 4. Fila justa: elegibilidade na query

Escolhida a opcao (b) do enunciado — excluir do `WHERE` as ordens com `nextAttemptAt` no
futuro — mantendo `take` e FIFO. Nenhum estado novo fora da linha.

```
where: { type, status, OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] }
orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }]
```

Duas sutilezas que o desenho trava:

1. A elegibilidade e decidida **na query**, nunca em memoria depois do `findMany` — filtrar
   depois gastaria o slot do lote com ordem em backoff, que e o defeito que a fase veio matar.
2. O `orderBy` composto evita que ordem recem-reativada fique atras de ordem antiga elegivel.
   Ganho pequeno, custo zero. Como o lote roda em `Promise.allSettled`, a ordem de
   processamento **dentro** do tick e irrelevante; o que importa e a composicao do lote.

Rejeitadas: **cursor keyset persistido** (estado extra para lembrar posicao numa varredura
que e relida do zero; motor que reinicia com cursor travado e ponto de falha novo) e
**rotacao/randomizacao** (destroi FIFO para a fila saudavel, que e a maioria, e torna o
comportamento nao deterministico de inspecionar em producao).

---

## 5. MARKET na expiracao: fica, e a regra e declarada

MARKET **permanece** na varredura de expiracao de 30 dias. Nao sao alternativas: MARKET entra
**e** a regra e declarada.

| Motivo terminal | Quem grava | Quando | Significado |
|---|---|---|---|
| `EXECUTION_RETRY_EXHAUSTED` | motor, no tick | apos 5 tentativas falhas | o motor tentou e desistiu; ordem jovem; usuario avisado com motivo |
| `EXPIRED` | job de expiracao | 30 dias em `OPEN`/`PARTIAL` | rede de seguranca para o que escapou do mecanismo primario |

O backstop de 30 dias custa uma varredura diaria indexada de um conjunto vazio na pratica. O
que ele compra e protecao contra as classes de falha que a Fase 3 **nao** conhece: bug futuro,
caminho novo que deixa ordem OPEN, regressao que desliga o contador, e o caso conhecido do
ticker sem preco ate o reload de ativos (§3.1, que por desenho **nunca** conta tentativa e
portanto nunca chega ao cancelamento por esgotamento). Mecanismo de seguranca que so protege
contra as falhas previstas no momento do desenho nao e backstop.

Redundancia deliberada com semanticas distintas ja e padrao do repo (chave UNIQUE + P2002
como no-op; CAS + `updateMany`).

---

## 6. Vocabulario de `cancelReason` e exposicao no historico

Vocabulario fechado, persistido como **code**, nunca como texto humano:

| Code | Origem |
|---|---|
| `USER_REQUEST` | `OrderService.cancelOrder` (usuario) |
| `INSUFFICIENT_BALANCE` | `settleOrderFill` |
| `ASSET_HALTED` | `OrderExecutor` / `OrderMatcher` |
| `EXECUTION_RETRY_EXHAUSTED` | motor, esgotamento (§5) |
| `EXPIRED` | job de expiracao de 30 dias |
| `OCO_SIBLING` | perna OCO cancelada porque a irma executou |
| `PLAN_CANCELLED` | force-cancel do admin e `cancellation-expiry` T+7 |
| `RECONCILIATION` | script de reconciliacao com `--apply` (§7) |

Texto humano **nao** e persistido: o front ja tem o precedente exato em
`ORDER_ERROR_MESSAGES` de mapear code para mensagem amigavel, e assim a copy muda sem
migration.

**Contrato.** `OrderHistoryDto` ganha `cancelReason: string | null`, e o campo entra em
`ORDER_HISTORY_DTO_FIELDS` (sem isso os testes de contrato nao o cobrem). `lastErrorCode`
**nao** vai para o DTO: e vocabulario de operador, nao de usuario; quem precisa dele tem o log
estruturado e o script de reconciliacao.

**Zero Assumido na UI.** Ordem `CANCELLED`/`EXPIRED` com `cancelReason = null` — isto e, toda
a base historica — renderiza exatamente como hoje: sem nota nova, sem tooltip inventado, e
**sem** "motivo nao registrado". A presenca do campo e o sinal. Quando nao-nulo, o drill-down
ganha uma linha `Motivo: ...`, seguindo o padrao de proveniencia de `FINANCIAL_SOURCE_NOTES`.
O tooltip de badge segue reservado a PARTIAL.

**Cobertura obrigatoria do `USER_REQUEST`.** `OrderService.cancelOrder` hoje publica
`motivo: 'Cancelado pelo usuario'` num canal Redis sem assinante e nao grava nada na ordem. Se
a fase adiciona `cancelReason` sem cobrir esse caminho, a UI mostra motivo para cancelamento
do motor e silencio para o cancelamento **mais comum de todos** — quebrando a expectativa que
o proprio recurso cria. O mesmo vale para as tres lacunas de notificacao duravel listadas em
§1: cancelamento pelo usuario, force-cancel do admin e `cancellation-expiry` T+7 passam a
gravar `cancelReason` **e** notificacao duravel idempotente.

---

## 7. Reconciliacao

Nao vira no-op: vira teste de fumaca que hoje passa de graca. O valor do script nao e o estado
atual (a Fase 2 zerou a fila) e sim o invariante que ele verifica **depois** que a Fase 3
introduzir maquina nova — cada peca nova e um modo novo de deixar ordem presa.

`scripts/reconcile-stuck-orders.ts`, idempotente, **read-only por default**:

- Reporta `status IN ('OPEN','PARTIAL')` com `attemptCount`, `lastErrorCode`, `lastAttemptAt`,
  `nextAttemptAt` e idade.
- Com `--apply`: para ordem mais velha que **24h** (limiar operacional, nao backstop) e fora de
  backoff ativo, cancela via CAS (`updateMany` com guarda de status, mesmo padrao do expiry),
  grava `cancelReason = 'RECONCILIATION'`, emite notificacao duravel `ORDER_CANCELLED` com
  chave `reconciliation:order:{id}` e corpo honesto, e cancela a perna irma de par OCO na
  mesma transaction — replicando a logica ja correta de `order-expiry.ts`.
- Criterio de aceite: rodar duas vezes seguidas; a segunda tem que ser no-op total.

Invocacao (de `footstock-next/`):

```
DATABASE_URL=... npm run reconcile:orders                      # dry-run
DATABASE_URL=... npm run reconcile:orders -- --apply --min-age-hours 48
```

O `npm run` carrega `--conditions=react-server`, sem o qual o script nao sobe: `src/lib/prisma`
e `NotificationRepository` comecam com `import 'server-only'`, que so resolve para modulo vazio
sob essa condicao. Chamar `npx tsx scripts/reconcile-stuck-orders.ts` direto morre antes da
primeira linha. O script precedente `reconcile-public-league-memberships.ts` documenta a forma
que nao funciona — defeito preexistente, fora do escopo desta fase.

---

## 8. Riscos assumidos por escrito

### 8.1 A causa raiz do ticker-sem-preco — CORRIGIDA depois da Fase 3

Registro original: `loadAssets()` so rodava no boot do lider, entao um ativo ativado (ou
reativado) depois disso nunca entrava em `assetStates`; como `runTick()` monta `currentPrices`
iterando `assetStates`, o ticker nunca aparecia e toda ordem daquele ativo virava
skip-para-sempre ate o cron de expiry. A Fase 3 **mitigou** o sintoma sem tocar na causa.

A causa foi fechada por `MarketEngine.syncAssetRoster()`:

- Roda **dentro** de `runTick()`, no topo do ciclo, nao num `setInterval` proprio — o guard
  `tickInFlight` ja serializa o tick, entao mutar `assetStates` ali nao corre contra os
  `for..of` do proprio ciclo. Um timer paralelo criaria exatamente essa corrida.
- Cadencia por wall-clock: `MOTOR_ROSTER_SYNC_MS`, default **60s**, floor 5s. Essa e a janela
  maxima em que uma ordem de ativo recem-ativado fica sem preco.
- Custo em regime: **uma** query indexada so de ids. A leitura completa da linha so acontece
  quando ha delta.
- Falha de reconciliacao **nao** derruba o tick: log de erro e o ciclo segue com o roster
  anterior, que e literalmente o comportamento de antes desta correcao.
- Simetria: o ativo **desativado** tambem sai (`forgetAsset`) — estado, book, timer de CB,
  series por assetId, ultimo resultado de camada e agentes do orchestrator. Antes ele
  continuava tickando, publicando preco e casando ordem para sempre.
- A construcao de `AssetState` virou caminho unico (`ingestAssets`), usado pelo boot e pela
  reconciliacao. Duplicar aquele bloco faria auto-recovery, warm-start e reconciliacao de halt
  divergirem entre os dois caminhos.
- A hidratacao do Redis e restrita ao lote ingerido. Re-hidratar o roster inteiro numa
  reconciliacao em pleno tick sobrescreveria variance/OFI vivos pelo ultimo snapshot
  persistido — um restart parcial silencioso a cada ativo novo.

**O que continua valendo da Fase 3:** preco ausente segue sendo **skip que nao conta** (§3.1).
A reconciliacao encurta a espera de "para sempre" para "ate uma janela", mas a precondicao
continua nao sendo falha de liquidacao e nao pode escorregar para o contador de tentativas.

**Riscos residuais aceitos:**

- Janela de ate `MOTOR_ROSTER_SYNC_MS` entre a ativacao no banco e o primeiro preco. Nao ha
  disparo reativo (o motor nao tem canal de comando para isso hoje); `syncAssetRoster()` e
  publico justamente para receber esse gancho depois.
- `forgetAsset` descarta atribuicoes de preco ainda nao persistidas do ativo removido (a
  persistencia so acontece no fechamento do candle). Perda de dado de auditoria, por isso vai
  em log com a contagem em vez de sumir em silencio.
- Ordem aberta de ativo desativado deixa de ter preco e passa a esperar o expiry. E a
  semantica pretendida (ativo inativo nao negocia), mas e mudanca de comportamento em relacao
  ao estado anterior, onde o ativo desativado continuava casando ordem.

### 8.2 Chaves de idempotencia disjuntas por caminho

Cancelamento por esgotamento usa `motor:order_cancelled:retry_exhausted:{id}`; o expiry usa
`expiry:order:{id}`; a reconciliacao usa `reconciliation:order:{id}`. Sao disjuntas por
origem, e devem continuar assim — o P2002 na chave UNICA e a rede de seguranca contra o aviso
duplicado, nao a regra.

### 8.3 OCO no cancelamento por esgotamento

MARKET nao tem par OCO, mas o mecanismo e compartilhado. Cancelar uma perna sem a irma
reproduz o bug de consistencia que o expiry ja teve de resolver lendo as pernas **dentro** da
transaction e com o mesmo filtro de status do update.

### 8.4 A migration dupla e o risco operacional mais provavel

Cinco colunas novas em **duas** linhagens de schema: `prisma/schema.prisma` (raiz, cliente do
motor) e `footstock-next/prisma/schema.prisma` (canonica, aplicada pelo CI). A divergencia do
campo `version` ja e exatamente esse bug tolerado em producao. Se `cancelReason` for lido pelo
front via schema canonico mas escrito pelo motor via schema raiz, drift vira campo nulo eterno
sem erro nenhum.

**Criterio de aceite da fase:** diff dos dois blocos `model Order` vazio, exceto pelo campo
`version` ja documentado como divergente.

### 8.5 `MarginCallChecker` continua silencioso — fora de escopo, declarado

`_sendMarginAlert` e `_forceLiquidation` so publicam em canal Redis sem assinante; nenhuma
linha duravel. Liquidacao forcada faz o usuario perder a posicao inteira sem aviso persistido,
e o `type: 'FORCED_LIQUIDATION'` publicado nem existe no enum `NotificationType`. E o gap mais
critico do sistema em consequencia financeira, mas e evento de **posicao**, nao de ciclo de
vida de **ordem** — fica registrado aqui como o primeiro item da proxima fase, nao silenciado.

### 8.6 Assimetria de rethrow no motor

`OrderExecutor._executeOrder` relanca a excecao inesperada e alimenta o log agregado
`BATCH_FAIL` do tick. `OrderMatcher._executeLimitOrder`, `_executeOcoLeg` e
`ScheduledOrderRunner._executeScheduled` engolem no `logger.error`. Com o contador de
tentativas isso deixa de ser invisivel (a falha passa a ficar gravada na propria ordem), mas a
simetria do sinal de operacao entra no escopo desta fase.
