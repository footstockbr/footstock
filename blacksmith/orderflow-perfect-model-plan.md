# FootStock — Plano: Modelo Perfeito do Fluxo de Ordens (debit-on-execute)

Decisões fechadas (usuário + Codex controversial):
- **Modelo de saldo: debit-on-execute.** O MOTOR é a única autoridade de settlement financeiro. O Next valida e cria a ordem; dinheiro só muda no fill (motor) ou em ações explícitas (short open/close, juros). Sem `reservedAmount` no schema.
- **Taxa de juros leverage: 0,3%/dia**, fonte única configurável, provisória (LLD Q2). Short rental segue 0,5%/dia (documentado).
- **Escopo: manter tudo** — BUY/SELL MARKET+LIMIT, alavancagem 2x, short, OCO — todos corrigidos.

Princípio invariável: **dinheiro só muda no fill**. Criação não debita; cancelamento/expiração de ordem OPEN não reembolsa (não há nada debitado).

---

## A. footstock-next `OrderService.createOrder` — parar de debitar
- REMOVER o débito de `fsBalance` na criação (`_debitRequiredBalance` deixa de mexer no saldo).
- MANTER validação de **capacidade** (não débito): para BUY, `saldoDisponível >= custoEstimado`, onde `saldoDisponível = fsBalance − Σ(custoEstimado de ordens BUY OPEN do usuário)`. Isso impede over-commit de várias LIMIT abertas sem reservar de fato (capacidade derivada, não hold).
- SELL: validar `(posição LONG − Σ SELLs OPEN/PARTIAL)` em transação serializável (já corrigido).
- Criar ordem `OPEN`; publicar `orders:pending` best-effort (motor varre o DB de qualquer forma — não é a garantia de execução).

## B. footstock-next `cancelOrder`
- Ordem OPEN não-executada → **sem refund de saldo** (nada foi debitado). Remover toda a lógica de `fsBalance.increment` no cancel.
- Remover liberação de `marginBlocked` no cancel de SELL comum (SELL de /orders é venda de LONG, não short; margin pertence só ao ShortService).
- OCO: cancelar o **grupo inteiro** (`groupId`), não uma perna.

## C. motor `OrderExecutor` + `OrderMatcher` — settlement único
- Fonte única de débito/crédito (já é). Confirmar fórmula BUY = `operationValue/leverageDiv + fee`; SELL credita `operationValue − fee`.
- **CORRIGIR `OrderMatcher` (LIMIT/OCO): aplicar `leverageDiv`** (hoje cobra 100% no LIMIT alavancado) — alinhar à fórmula do `OrderExecutor` MARKET.
- **Idempotência uniforme**: CAS no status (só FILLED se ainda OPEN) + unique `(orderId, financialType)` para TRADE e FEE em MARKET, LIMIT e OCO.
- **OCO**: ao executar uma perna, cancelar a outra do mesmo `groupId` atomicamente. Validar que OCO é só SELL protetivo de LONG (remover BUY OCO do validator).

## D. Taxa de juros / leverage — fonte única
- Sincronizar `0.003` (0,3%/dia) em ambos: `footstock-next/src/lib/constants/leverage.ts` e `motor` (LeverageInterestRunner + OrderExecutor). Comentar como provisória (LLD Q2).
- **Um único cobrador de juros**: Next cron (`leverage-interest.ts`) idempotente por `(positionId, dateBRT)`. **Motor para de cobrar** (desabilitar `LeverageInterestRunner.chargeDaily` no MarketEngine). Garante zero double-charge.

## E. forceCloseLeveraged / liquidação
- Ao fechar, zerar `leverageAmount`, `leverageMultiplier=1`, `dailyInterestRate=0` (evita rejuros/reliquidação sobre estado obsoleto).

## F. SHORT concurrency
- `ShortService.openShort`: transação **Serializable** + CAS no `fsBalance`/`marginBlocked` (hoje lê saldo fora da tx e faz update absoluto → corrompe sob concorrência).

## G. Expiração (`order-expiry` job, T+30d)
- Como não há débito na criação, expirar ordem OPEN → **sem refund** (remover o `increment` de saldo na expiração).

## H. PARTIAL
- Motor dá **fill total** para cotas (não parcial). Manter o enum mas garantir que o motor nunca sinaliza PARTIAL. Não implementar partial-fill (YAGNI).

## I. TransactionService (código morto)
- Deletar (settlement é exclusivo do motor) OU rebaixar a lib pura de fórmulas compartilhadas — nunca um 2º executor.

## J. Schema
- Sem novos campos (debit-on-execute dispensa `reservedAmount`).

## Sequência de implementação (ataque)
1. **Settlement BUY/cancel/expire** (exploding-now): A + B + G + C(leverageDiv LIMIT).
2. **OCO**: grupo no cancel/execute, remover BUY OCO. (B + C)
3. **Juros/taxa única**: D + E.
4. **Short concurrency**: F.
5. **Idempotência uniforme + limpeza**: C(idempotência) + I.

## Migração de dados em produção (downtime OK)
- Mercado foi relançado limpo (sem posições/ordens/transações). Logo, NÃO há saldo debitado em ordens abertas para reconciliar. A troca para debit-on-execute é segura no estado atual (zero ordens OPEN legadas).
- Validar: nenhuma ordem OPEN nem posição alavancada pendente antes do deploy.

## HARDENING (Codex gpt-5.5, deltas obrigatórios sobre o plano base)

1. **Falta de saldo no fill → status TERMINAL, nunca OPEN.** O settlement do motor, se BUY não cabe no saldo, marca a ordem CANCELLED + notifica (não deixa OPEN em retry infinito). Vale para MARKET/LIMIT/OCO/SCHEDULED.
2. **Settlement unificado no motor.** Hoje só MARKET cria/atualiza Position + aplica leverageDiv. LIMIT/OCO/SCHEDULED só mexem em saldo/transação (NÃO tocam posição, NÃO aplicam alavancagem). Extrair `motor/src/engine/settlement.ts > settleOrderFill(tx, ...)` com CAS de status (`updateMany where status IN (OPEN,PARTIAL)`), balance, position upsert/reduce, TRADE+FEE, leverageDiv — usado pelos 4 runners.
3. **Remover refund de halt** (`_cancelHaltedMarketOrder`): em debit-on-execute nada foi debitado → reembolsar = dinheiro grátis.
4. **OCO atômico + SELL-only.** Validator: remover BUY OCO; SELL OCO com relação corrigida `stopLossPrice < price < takeProfitPrice` (estava invertida). Matcher: lock por groupId, CAS, cancelar irmã `updateMany where groupId AND id != exec AND status=OPEN` na mesma tx. `_assertSellAvailable`: contar pernas OCO 1× por groupId (hoje conta 2×qty).
5. **Rota DELETE /orders/:id** chama `orderService.cancelOrder` (hoje é stub que faz update direto sem cancelar grupo OCO).
6. **Schema migration M054 (idempotente):** `positions.last_interest_charged_at` (idempotência de juros por dia) + índice único parcial `transactions(order_id, financial_type) WHERE order_id IS NOT NULL` (defense-in-depth 1 TRADE+1 FEE por ordem; NULLs distintos não afetam lançamentos sem ordem).
7. **Juros — 1 cobrador.** Next cron (`LeverageService.accrueInterest`) idempotente por `(positionId, dia BRT)` via CAS em `last_interest_charged_at`. Desabilitar o único cobrador real do motor (`MarketEngine:499-505`; o scheduler job já é stub). Rate único 0,3% (`LEVERAGE_DAILY_INTEREST_RATE=0.003`; posição já armazena 0.003 setado pelo motor).
8. **ShortService.openShort concurrency:** re-ler user dentro da tx + débito via CAS `updateMany where fsBalance>=totalRequired decrement` (hoje lê saldo fora da tx e faz set absoluto → corrompe sob concorrência).
9. **Deploy (downtime OK, mercado limpo):** `motor:global-halt` + pausar motor → verificar estado limpo (SQL) → migration M054 → **deploy motor PRIMEIRO** → deploy Next → habilitar cron juros → remover halt → smoke. Mercado relançado limpo = zero ordens OPEN/posições → transição segura.

## Invariantes pós-modelo (testes de aceitação)
- BUY MARKET 2x opVal=100 fee=0.45 → saldo cai exatamente 50.45 (uma vez), posição LONG criada, 1 TRADE + 1 FEE.
- BUY LIMIT 2x → no fill, cobra `operationValue/2 + fee` (não 100%).
- Cancelar ordem OPEN → saldo inalterado.
- OCO: executa 1 perna, cancela a outra; sem fee/saldo da perna cancelada.
- Juros cobrados 1×/dia por posição alavancada, taxa 0,3%.
- Short: 2 aberturas concorrentes não corrompem saldo/margem.
