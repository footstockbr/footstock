# Incidente — Webhook Mercado Pago rejeita 100% dos pagamentos (HMAC), plano não ativa

Data: 2026-06-16. Ambiente: produção (Railway `foot-stock`, DB `footstock` via tramway proxy).

## Sintoma observado (evidência primária)
- Compra LENDA mensal de **Rodrigo Castelo Branco Fortuna** (fortuna.rodrigo@gmail.com), 16/06 19:21 BRT.
- Mercado Pago: pagamento `164446423886` = **approved/accredited**, R$1,20, `account_money` (confirmado via `GET /v1/payments`).
- DB: subscription `cmqh7i208001i01lcuneak5dq` = **PENDING**; user.plan_type = **JOGADOR**; **nenhuma** linha em `payments`.
- `webhook_audit_logs`: 4 entradas 19:21:34–35 BRT, todas **REJECTED**, `hmac_valid=false`, "Assinatura HMAC inválida".
- Histórico total: **34 REJECTED × 1 ACCEPTED**. O único ACCEPTED (25/05) é a conta do dev (corgnati.pedro), anterior ao manifesto atual.

## Causa raiz
Manifesto HMAC do MP montado errado em `validateMercadoPagoHMACDetailed` (webhook-validator.ts).
- Manifesto canônico MP (doc oficial): `id:{data.id};request-id:{x-request-id};ts:{ts};`
- Código (commit 59bb34e, 02/06): `id:{data.id};ts:{ts};` — **segmento `request-id:` removido**.
- MP sempre envia `x-request-id` em pagamento real → hash nunca bate → BAD_SIGNATURE → handler retorna 200 silencioso e nunca chama `planService.upgradeUser`. `upgradeUser` só é chamado pelo webhook (sem fallback server-side) → ativação 0%.

## Fix aplicado (workspace, não deployado)
1. `src/lib/gateways/webhook-validator.ts`: manifesto agora `id:{dataId};request-id:{xRequestId};ts:{ts};` (omite `request-id` só quando header ausente, conforme regra MP). Lowercase de id alfanumérico (no-op p/ numérico).
2. `src/lib/gateways/mercadopago.ts`: método dead `validateWebhook` (sem callers) marcado `@deprecated` apontando p/ o validator real.
3. `tests/unit/mercadopago-hmac-validator.test.ts` (novo): trava o manifesto canônico + guarda de regressão (assinatura sem request-id é rejeitada). 19 testes verdes. tsc 0 erros, eslint limpo.

## Plano de remediação
- **Deploy** do fix no Railway web service.
- **Ativar Rodrigo** via replay de webhook ASSINADO VÁLIDO ao endpoint de prod (secret de prod em mãos): `POST /api/v1/payments/webhook` com `x-signature` (manifesto canônico), `x-request-id`, body `{"type":"payment","data":{"id":"164446423886"}}`. Idempotente (`upgradeUser→ALREADY_ACTIVE`, `payment.upsert` por gatewayTransactionId). Roda o caminho real de prod → ativa + cria Payment + agenda bônus, e PROVA o fix em produção.
- Verificar: sub→ACTIVE, user→LENDA, payment PAID, webhook_audit_log→ACCEPTED.

## Pontos para o revisor (Codex)
1. O manifesto canônico está 100% correto (ordem dos campos, `;` final, omissão condicional do request-id)?
2. A normalização lowercase de `data.id` introduz risco para algum tipo de notificação?
3. O replay de webhook auto-assinado contra prod é seguro/idempotente? Algum efeito colateral indesejado (comissão de afiliado, liga, mixpanel, dunning)?
4. Falta cobrir merchant_order / outros topics? O parser ignora não-payment — ok?
5. A janela de replay (5 min) afeta o replay manual?
