# Auditoria End-to-End — Subsistema Financeiro e de Planos do FootStock

Data: 2026-06-22
Escopo: `output/workspace/foot-stock/footstock-next` — fluxo cliente paga -> webhook identifica -> plano migra; refund/cancel; gating; admin financeiro; crons de ciclo de vida.
Metodo: leitura manual do caminho critico + workflow multi-agente (12 fatias de leitura profunda, verificacao adversarial por finding, critico de completude, sintese). 125 agentes, 100 findings confirmados (4 P0, 12 P1, 30 P2, 27 P3, 27 robustez-OK).

---

## 0. Veredito executivo (com calibracao independente)

**A pergunta central tem resposta SIM para o caminho normal.** Quando o cliente paga um plano (cartao via preference ou PIX), o webhook identifica o pagamento corretamente e o plano e migrado de forma correta, atomica e idempotente. O nucleo esta genuinamente bem construido e bem defendido contra forja de payload, replay, corrida e divergencia de valor/gateway.

As falhas estao **nas bordas**, nao no happy-path. Duas calibracoes minhas (que o workflow nao tinha contexto para pesar) reordenam o risco real:

1. **Recorrencia do Mercado Pago e STUB.** `MercadoPagoGateway.cancelAutoRenewal` e `reactivateAutoRenewal` sao stubs ("integracao pendente"); PIX e explicitamente nao-recorrente. Ou seja, **hoje nao ha cobranca automatica de renovacao**. Isso torna LATENTES (nao ativos) os findings que dependem de um evento `PAYMENT_FAILED` de renovacao: P0-2 (PAST_DUE trap) e parte do P0-4 (dunning). Eles sao bugs reais que detonam no minuto em que a recorrencia for ligada, mas nao estao sangrando dinheiro hoje.

2. **FS$ e play-money (saldo ficticio, sem dinheiro real).** `reset-balance` comenta explicitamente "saldo ficticio". Logo, os findings de "vazamento de dinheiro" que mexem em FS$ (P0-1 comissao de afiliado, P1-4 double-credit de bonus, P1-5 saldo inicial) sao problemas de **integridade da economia interna / paridade do programa**, nao perda de caixa real.

**O unico finding que envolve DINHEIRO REAL (BRL capturado no MP sem contrapartida) e o P0-4 / P1-2** — a familia "captura sem ativacao" no ramo `NOT_ACTIVATABLE`. E e o que merece a primeira correcao.

Resumo da prioridade real:
- Dinheiro real em risco: **P0-4 / P1-2** (capturado no MP, plano nao ativa, sem Payment, sem refund). Gated em condicoes de borda.
- Integridade estrutural admin: **P0-3** (PATCH cru diverge `User.planType` da Subscription; endpoint seguro `promote-plan` e codigo morto). Ativo hoje.
- Integridade da economia FS$ (play-money): **P0-1, P1-4, P1-5**. Ativo, mas sem caixa real.
- State-machine latente (gated em recorrencia stub): **P0-2**.

---

## 1. Verificacao independente do caminho critico (lido manualmente)

Confirmei por leitura direta do codigo:

- **Identificacao do pagamento (webhook):** robusta. Manifesto HMAC do MP correto (`id:{data.id};request-id:{x-request-id};ts:{ts};`, com o fix do bug historico de `request-id` que rejeitava 100% dos webhooks). `parseWebhookEvent` NUNCA confia em `status`/`amount`/`external_reference` do payload — sempre faz `GET /v1/payments/{id}` (mercadopago.ts:278-364) e bloqueia `live_mode=false`. `timingSafeEqual` com pad de tempo constante. Janela de replay +-5min. Fail-closed em `CONFIG_MISSING`.
- **Match antes de ativar:** gateway-match (route.ts:207) + amount-match +-1 centavo (route.ts:222), replicados identicos no caminho de reconciliacao (PlanService.reconcileApprovedPayment) — recuperacao nao e porta lateral mais fraca.
- **Migracao do plano (`upgradeUser`, PlanService.ts:197-404):** atomica. `updateMany` com guard CAS (`status notIn [terminais, ACTIVE]`, `count!==1` aborta com `PAYMENT_ACTIVATION_RACE`) + `user.update planType` na MESMA transacao. Encerra ACTIVE/CANCELLATION_LOCK anteriores rolando bonus pendente. Guards: ownership (subscription.userId === userId), AUTH-009 admin terminal, ALREADY_ACTIVE idempotente, NON_ACTIVATABLE para estados terminais, downgrade-obsoleto.
- **Recuperacao:** cron `reconcile-payments` (varre PENDING -> `searchApprovedPaymentByExternalReference` -> `reconcileApprovedPayment`) + replay admin (`withAdmin admin:audit`) reusam o mesmo caminho idempotente. Fecha o gap do bug HMAC.
- **bonus-credit (lib/jobs/bonus-credit.ts):** transacao atomica com extrato `Transaction(financialType=BONUS)` e notificacao real. Bem construido (a ressalva e a corrida TOCTOU do P1-4).
- **Dinheiro em centavos Int ponta a ponta** (Subscription.amount / Payment.amount, nunca Float), idempotencia por `gatewayTransactionId @unique`.

### P0 verificados manualmente por mim
- **P0-3 confirmado:** `UserActions.handleChangePlan` (UserActions.tsx:168-182) faz `PATCH {planType}` -> `admin/users/[id]/route.ts:95-98` faz `prisma.user.update({ data: parsed.data })` com apenas guard de hierarquia admin; sem criar Subscription, sem bonus, sem guard de downgrade/staff-plan. `grep promote-plan` em `src/` retorna zero callers -> o endpoint seguro e codigo morto.
- **P0-4 confirmado:** `DunningService.processDunning` (DunningService.ts:91-100) chama `gateway.createCheckout({ subscriptionId: sub.id })` numa sub `status:'EXPIRED'` -> checkout MP pagavel cujo `external_reference` aponta para sub nao-ativavel -> ao pagar, `upgradeUser` retorna `NOT_ACTIVATABLE` -> webhook (route.ts:243-260) grava ACCEPTED 200 sem Payment, sem ativar, sem refund.

### Achados operacionais fora das 12 fatias (meus)
- **Agendamento dos crons ausente do repo:** nenhum `vercel.json`/`on: schedule:`/chamada a `/api/cron` em workflows; `railway.toml` nao agenda. Toda a camada de recuperacao/dunning/lifecycle/bonus depende de um scheduler EXTERNO nao versionado. Confirmar no painel Railway que `reconcile-payments` e os ~25 crons de fato rodam. (Memoria de incidente 2026-06-18 indica que crons do motor eram disparados mas davam 401 por CRON_SECRET stale — sugere que existe scheduler, mas o de footstock-next nao esta confirmado.)
- **Drift de nomes de env MP:** `env.ts` declara AMBOS `MP_ACCESS_TOKEN`/`MP_WEBHOOK_SECRET` (l.65-66) e `MERCADO_PAGO_ACCESS_TOKEN`/`MERCADO_PAGO_WEBHOOK_SECRET` (l.67-68), todos `.optional()`. O codigo consome SO `MERCADO_PAGO_*` (12 refs); o `.env` commitado define SO `MP_*` (nomes legados). Como ambos sao opcionais, a validacao Zod passa mas em runtime `env.MERCADO_PAGO_ACCESS_TOKEN` ficaria `undefined` -> checkout lanca PAYMENT_010 e webhook cai em CONFIG_MISSING. O historico de prod (ativacao do Rodrigo via replay pos-fix-HMAC) prova que o Railway usa os nomes corretos `MERCADO_PAGO_*` -> e mina de template/dev, nao P0 ativo. Recomendo: remover os aliases `MP_*` mortos do schema OU adicionar fallback, e atualizar `.env.example` + a string de erro enganosa em mercadopago.ts:47.

---

## 2. Relatorio consolidado (workflow multi-agente)

> Sintese produzida pela auditoria multi-agente, validada contra minha leitura manual. Severidades ja revisadas adversarialmente.

### Mapa do fluxo end-to-end

```
Checkout (cria/reusa Subscription PENDING)
  Cartao:  POST /api/v1/payments/checkout      -> PlanService.createCheckout -> MercadoPagoGateway.createCheckout (preference, init_point)
  PIX:     POST /api/v1/payments/pix-checkout  -> PlanService.createCheckout -> MP POST /v1/payments (qr_code)
        amount em centavos Int = calcSubscriptionAmount (plan-logic.ts)
        idempotencia: reuso de PENDING (userId+planType+period) dos ultimos 5min (sem unique constraint)
        |
        v
Webhook  POST /api/v1/payments/webhook
  1. IP (x-forwarded-for) + raw body
  2. detecta gateway por header (GatewayFactory)
  3. HMAC (webhook-validator) ANTES do rate-limit; fail-closed se secret ausente
  4. rate-limit 1000/60s por IP (FAIL-OPEN se Redis offline)
  5. enrichment: parseWebhookEvent SEMPRE GET /v1/payments/{id}; ignora payload; bloqueia live_mode=false
  5b. dedup por audit log ACCEPTED (so DUPLICATE se ja houve ACCEPTED)
  6. match: gateway + amount +-1 centavo
        |
        v
upgradeUser (TX ATOMICA): guards + encerra anteriores + ativa via updateMany CAS (count!=1 aborta) + user.planType
        |
        v
applyPaymentConfirmedEffects (TX SEPARADA): payment.upsert PAID idempotente + efeitos best-effort (liga, mixpanel, comissao)
        |
        v
ACCEPTED gravado SO no final

Recovery (mesmo caminho idempotente): cron reconcile-payments + admin replay -> reconcileApprovedPayment
```

### P0 (4)

**P0-1. Comissao de afiliado de subscription inflada ~100x (centavos tratados como FS$)** — `PlanService.ts:591-610`
`processAffiliateCommission` recebe `subscriptionAmount = amountCents` e calcula `commissionAmount = amountCents * pct`; o cron `affiliate-commission` credita direto em `fsBalance`. Base errada (centavos em vez de reais/FS$). [Calibracao: FS$ e play-money -> integridade de paridade do programa, nao caixa real. Fix: dividir `amountCents/100` antes do pct + teste de regressao.]

**P0-2. PAST_DUE e estado-armadilha: nenhum job o consome** — `webhook/route.ts:303-308` + `DunningService.ts:36-38` + `subscription-expiry.ts`
PAYMENT_FAILED seta PAST_DUE "para acionar dunning", mas DunningService busca so EXPIRED, expiry busca so ACTIVE, downgrade busca EXPIRED/SUSPENDED. Ninguem consome PAST_DUE. [Calibracao: recorrencia MP e stub hoje -> evento de renovacao-falha pode nem ocorrer; LATENTE. Detona quando recorrencia for ligada. Fix: incluir PAST_DUE no DunningService OU webhook setar EXPIRED OU job de downgrade pos-N-dias.]

**P0-3. Troca de plano do admin usa PATCH cru — diverge User.planType vs Subscription; promote-plan e codigo morto** — `UserActions.tsx:168-182` + `admin/users/[id]/route.ts:95-98` + `promote-plan/route.ts`
A UI "Trocar plano" faz `PATCH {planType}` -> `prisma.user.update` cru, sem Subscription/bonus/guard de downgrade/staff-plan/audit. O `promote-plan` (com todos os guards + Subscription + audit) nao tem callers. [Ativo hoje. Fix: apontar `handleChangePlan` para `promote-plan` ou consolidar a logica no PATCH.]

**P0-4. Dunning cobra sub EXPIRED -> NOT_ACTIVATABLE -> 200 sem ativar, sem Payment, sem refund** — `DunningService.ts:91-100` + `webhook/route.ts:243-260`
`processDunning` cria checkout com `external_reference` de sub EXPIRED; ao pagar, `upgradeUser` retorna NOT_ACTIVATABLE e o webhook responde ACCEPTED 200. **Dinheiro real (BRL) capturado no MP sem contrapartida e sem rastro.** [UNICO finding de caixa real. Gated em: cron dunning ativo + sub em EXPIRED involuntario. Fix: reativar a sub para PENDING antes de cobrar; no ramo NOT_ACTIVATABLE emitir Payment ORPHANED + refund/alerta + audit REJECTED em vez de ACCEPTED. Mesma raiz do P1-2 (downgrade-obsoleto / force-cancel de irmas / cancel+PIX aberto entre checkout e confirmacao).]

### P1 (12, condensados)

- **P1-1 / P1-9 / P1-10 / P1-11 (pricing sem fonte unica):** UI mostra R$19,90/R$39,90 (PixQRModal, plan-cards, admin) mas a cobranca real e R$1,00/R$1,20 (preco de teste em plan-logic.ts). 6+ definicoes divergentes de preco; MRR/ARR do admin hardcoded (inflado ~16-40x vs receita real de `payment.aggregate`); `yearly` cobra igual a `monthly` mas anuncia -25%. Hoje cobra a MENOS (sem lesao). **Fix: modulo unico `PLAN_AMOUNTS_CENTS`; UI e MRR derivam dele; decidir ativar precos reais.**
- **P1-2:** irmao do P0-4 (captura sem ativacao para subs que viraram terminais entre checkout e confirmacao).
- **P1-3:** `payment.upsert` PAID e comissao FORA da mesma transacao; se a comissao falhar apos o upsert, o gate `existing.status==='PAID'` bloqueia reprocesso para sempre -> comissao perdida em silencio. **Fix: $transaction OU job reconciliador + elevar console.error a sinal observavel.**
- **P1-4:** `bonus-credit` credita por `where:{id}` incondicional dentro da tx (filtro de idempotencia so no findMany externo) -> double-credit em corrida com rollover de upgrade. **Fix: claim condicional `updateMany({where:{id,bonusCreditedAt:null,status:'ACTIVE'}})` e abortar se count===0.**
- **P1-5:** `fsBalance` default 10000 no register, mas todo reset/downgrade usa 2000 (perde 8000); "LENDA inicial=25000" nunca materializa (base real 10000 -> 33000). [Play-money.] **Fix: decidir saldo canonico e alinhar 6+ caminhos.**
- **P1-6:** refund rebaixa a JOGADOR sem liquidar posicoes restritas (SHORT/LEVERAGED/OCO). Os DOIS caminhos (rota + webhook REFUND) precisam do fix.
- **P1-7:** durante a graca de 7 dias, sub vira EXPIRED + user SUSPENDED mas planType nao muda; gating le so planType e getAuthUser nao checa status -> usuario consome features pagas por ate 7 dias. Pode ser graca intencional. **Fix: revalidar status por request OU definir politica explicita.**
- **P1-8:** liquidacao forcada T+48h e codigo morto — todos os produtores de CANCELLATION_LOCK gravam `forcedLiquidationAt:null`; cron T+48h nunca seleciona linhas; 5 funcoes plan-logic orfas. **Fix: decidir intencao (wire ou remover).**
- **P1-12:** logs de webhook REJECTED sem consumidor frontend — a confirmacao perdida e invisivel na UI (so via console.error `[ALERT]`). O incidente HMAC so foi descoberto fora da UI. **Fix: sub-aba admin de webhooks REJECTED + badge 24h + link para replay.**

### P2 (30, agrupados)

- **Checkout/PIX:** idempotencia de PENDING via query de 5min sem unique constraint -> corrida pode gerar 2+ PENDING e dupla cobranca (cartao+PIX); PIX descarta `mpData.id` (recuperacao 100% dependente de webhook/cron); pix-checkout sem try/catch para ORDER_081/PAYMENT_054 (500 cru).
- **Webhook/HMAC:** rate-limiter FAIL-OPEN silencioso quando Redis offline; `live_mode` ausente (undefined) nao bloqueia (gate so rejeita `=== false`); CONFIG_MISSING indistinguivel de ataque no painel; falta teste da ROTA do webhook (so HMAC unit).
- **Ativacao/efeitos:** janela plano-ATIVO-sem-Payment-PAID se applyPaymentConfirmedEffects falhar; docstring afirma unique constraint composta inexistente (idempotencia da comissao depende so de gatewayTransactionId); gate best-effort read-then-upsert sem tx (corrida webhook x reconcile -> analytics/liga duplicaveis); refund nao reverte comissao ja PAID nem decrementa fsBalance.
- **Ciclo de vida:** requireActiveSubscription nao bloqueia nada em cancelamento simples; cancelSubscription nao encerra posicoes; PAST_DUE/PENDING orfaos nunca rebaixam (sem garbage-collector).
- **Gating:** PLAN_FEATURES/planHasFeature sao codigo orfao (nenhum enforcement consome); gating de realtime no STREAM ao vivo nao verificavel neste repo (motor externo) — a confirmar.
- **Dinheiro/constantes:** preco exibido vs cobrado no onboarding; decisao "LENDA=1,20 difere de CRAQUE" so em comentario; listas de features divergentes (5/2 vs 20/5 ordens/dia) — risco CDC.
- **Admin:** promote-plan nao credita bonus; force-cancel reseta saldo sem estorno nem Payment REFUNDED; payments/metrics soma so PAID (nunca desconta REFUNDED -> receita liquida superestimada); bucket TRIAL_PERIOD nunca casa o enum.
- **Cobertura de teste:** sem testes para applyPaymentConfirmedEffects/comissao; reconcile/cron/replay sem testes; creditBonus.test.ts em describe.skip.
- **Completude (gateways):** seletor mostra PagSeguro/PayPal e zod aceita, mas createCheckout lanca PAYMENT_053 -> 500 + PENDING orfa. Desabilitar na UI ate configurados.

### P3 (selecao)

PIX reusa PENDING sem revalidar metodo/valor; cron reconcile so varre PENDING (PAST_DUE escapa); replay admin sem rate-limit; cron seleciona so um candidato approved (ignora multiplos PIX); janela do cron (days max 120) pode nao cobrir backlog; NOT_ACTIVATABLE conta como failure inflando success=false; IP do rate-limit falsificavel via XFF; `.env.example` sem MERCADO_PAGO_WEBHOOK_SECRET (var aceita-mas-ignorada MP_WEBHOOK_SECRET); PagSeguro/PayPal parseWebhookEvent leem amount do payload sem GET autoritativo (latente).

---

## 3. O que esta solido (NAO quebrar)

- Ativacao atomica com CAS anti-corrida (`PlanService.ts:291-366`): `updateMany notIn[terminais,ACTIVE]` + abort por `count!=1`, plano+planType na mesma tx. NAO trocar por `update({where:{id}})` cego.
- Webhook trust-the-API-not-the-payload (`mercadopago.ts:278-364`): SEMPRE GET, ignora payload nao coberto por HMAC, bloqueia live_mode=false, rejeita data.id nao-numerico.
- HMAC robusto (`webhook-validator.ts:189-264`): manifesto canonico com request-id, timingSafeEqual, janela de replay, fail-closed em CONFIG_MISSING.
- Defesa em camadas no match (gateway + amount +-1 centavo), replicada identica no reconcile.
- Dinheiro em centavos Int ponta a ponta + idempotencia por gatewayTransactionId @unique.
- planType SEMPRE fresco do DB em todo gating (middleware, auth, OrderService) — usuario rebaixado NAO mantem premium via JWT stale.
- Limite diario de ordens com reserva atomica em Redis + tipo de ordem por plano enforced server-side (JOGADOR nao cria LIMIT/OCO via API).
- Idempotencia/CAS dos crons de lifecycle (grace/downgrade/forced-liquidation/renewal-reminder) via updateMany com predicados repetidos.
- Rollover de bonus pendente preserva valor e data mais cedo dentro da tx.
- force-cancel fecha subs irmas PENDING/PAST_DUE/TRIALING (previne reativacao por webhook tardio).
- Estorno-antes-de-rebaixar no refund + idempotencia do refundPayment (X-Idempotency-Key); revert com optimistic lock vs cron.
- Auth de cron e replay fail-closed (Bearer CRON_SECRET; withAdmin admin:audit).

---

## 4. Checklist priorizado

**Caixa real / estrutural (primeiro):**
1. [P0-4 / P1-2] Tratar o ramo NOT_ACTIVATABLE: nunca silenciar dinheiro capturado — Payment ORPHANED + refund/alerta + audit REJECTED. Reativar sub para PENDING antes de cobrar no dunning.
2. [P0-3] Apontar a UI "Trocar plano" para `promote-plan` (ou consolidar no PATCH): Subscription consistente + audit + guards. Decidir destino do endpoint morto.

**Integridade da economia FS$ (play-money):**
3. [P0-1] Corrigir unidade da comissao de afiliado (`amountCents/100` antes do pct) + teste. Reconciliar fsBalance de afiliados que ja receberam credito inflado em prod.
4. [P1-4] Tornar o credito de bonus condicional (claim updateMany + abort count===0) — fix trivial, evita double-credit.
5. [P1-5] Decidir fsBalance inicial canonico de JOGADOR e alinhar os 6+ caminhos.

**Latentes (gated em recorrencia — fazer antes de ligar cobranca recorrente):**
6. [P0-2] Conectar PAST_DUE a um processador (dunning OU downgrade).

**Consistencia / observabilidade:**
7. [P1-3] Atomizar Payment.upsert + comissao OU job reconciliador; elevar console.error a sinal observavel.
8. [P1-12] Sub-aba admin de webhooks REJECTED + badge 24h (fecha a cegueira do incidente HMAC).
9. [P1-1/9/10/11] Consolidar pricing em fonte unica em centavos; UI e MRR derivam dela; decidir ativar precos reais e aposentar os de teste.
10. [P1-6] Liquidar posicoes restritas no refund (rota + webhook) OU bloquear refund com posicao aberta.
11. [P1-7] Revalidar user.status por request no gating OU politica explicita de graca de 7 dias.
12. [P1-8] Decidir intencao da liquidacao T+48h: wire forcedLiquidationAt OU remover codigo morto.

**Endurecimento (P2):** constraint unica parcial de PENDING; observabilidade de degradacao silenciosa (rate-limiter fail-open, live_mode undefined, CONFIG_MISSING, health-check do secret no boot); testes de rota do webhook/efeitos/reconcile; corrigir docstring + assert non-null da comissao; force-cancel/promote-plan politica de estorno; payments/metrics descontar REFUNDED; desabilitar PagSeguro/PayPal na UI.

**A confirmar (fora do repo):**
- Agendamento real dos ~25 crons (scheduler externo Railway nao versionado) — confirmar que `reconcile-payments` e os crons de lifecycle de fato rodam.
- Gating de realtime no repo do motor (`stream.footstock.com.br`) a partir do planType do JWT — sem isso, JOGADOR/CRAQUE pode receber cotacoes em tempo real contornando a feature paga.
- Nomes de env MP no painel Railway (`MERCADO_PAGO_*` vs `MP_*`).
