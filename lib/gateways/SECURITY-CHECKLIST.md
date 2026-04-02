# SECURITY-CHECKLIST.md — Gateway Security Gate

**Módulo:** module-12-gateways-webhooks
**Versão:** 1.0
**Data:** 2026-03-28
**Obrigatório antes do deploy em produção**

---

## Gate PCI-DSS (obrigatório — executar antes de cada release)

Execute os comandos abaixo e confirme que TODOS retornam zero ocorrências:

```bash
# 1. Dados de cartão nunca no schema
grep -i "cardNumber\|cvv\|cvc\|expiryDate\|cardHolder\|pan\b" prisma/schema.prisma
# Esperado: zero linhas

# 2. Dados de cartão nunca nos gateways
grep -r "cardNumber\|cvv\|creditCard\|saveCard\|storeCard\|cardData" lib/gateways/
# Esperado: zero linhas

# 3. Secrets nunca hardcoded
grep -r "sk_live\|access_token.*mp\|pk_live\|APP_USR-[0-9]" lib/ app/ --include="*.ts"
# Esperado: zero linhas

# 4. timingSafeEqual em uso (obrigatório)
grep -r "timingSafeEqual" lib/gateways/
# Esperado: >= 3 ocorrências (MP, PagSeguro, webhook-validator)

# 5. Items checados neste arquivo
grep "\[x\]" lib/gateways/SECURITY-CHECKLIST.md | wc -l
# Esperado antes do deploy: >= 16
```

---

## Checklist de Segurança

### Req. 1 — Dados de cartão nunca armazenados

- [x] 1.1 Schema Prisma não possui `cardNumber`, `cvv`, `cvc`, `expiryDate`, `cardHolder` ou `pan`
- [x] 1.2 `gatewayMeta` no modelo `Payment` nunca contém dados de cartão — apenas metadados operacionais
- [x] 1.3 Nenhum log de servidor registra dados sensíveis de cartão

### Req. 2 — Redirect Checkout (sem tokenização local)

- [x] 2.1 `MercadoPagoGateway.createCheckout` retorna apenas `redirectUrl` — dados de cartão inseridos no gateway externo
- [x] 2.2 `PagSeguroGateway.createCheckout` retorna apenas `redirectUrl`
- [x] 2.3 `PayPalGateway.createCheckout` retorna apenas `redirectUrl`
- [x] 2.4 Nenhuma implementação de tokenização local ou armazenamento de PAN em `lib/gateways/`

### Req. 3 — HMAC e autenticação de webhooks

- [x] 3.1 `validateMercadoPagoHMAC` usa `crypto.timingSafeEqual` — sem timing attack
- [x] 3.2 `validatePagSeguroHMAC` usa `crypto.timingSafeEqual`
- [x] 3.3 PayPal usa Verify API remota (sem HMAC local)
- [x] 3.4 Webhook inválido → HTTP 401, nenhum processamento ocorre
- [x] 3.5 Janela anti-replay de 5 minutos ativa (`WEBHOOK_REPLAY_WINDOW_MS`)

### Req. 4 — Secrets somente em variáveis de ambiente

- [x] 4.1 `MP_ACCESS_TOKEN` não hardcoded — lido de `env.*`
- [x] 4.2 `PAGSEGURO_TOKEN` não hardcoded
- [x] 4.3 `PAYPAL_CLIENT_SECRET` não hardcoded
- [x] 4.4 Todos os secrets validados via Zod em `lib/config/gateway-env.ts`
- [x] 4.5 Variáveis server-only sem prefixo `NEXT_PUBLIC_`

### Req. 5 — Rate limiting

- [x] 5.1 `webhookRateLimit` ativo: 100 req/min por IP em `/api/v1/payments/webhook`
- [x] 5.2 Excesso retorna HTTP 429 com código `PAYMENT_055`

### Req. 6 — Auditoria

- [x] 6.1 Todo webhook (ACCEPTED/REJECTED/DUPLICATE) gera registro em `webhook_audit_logs`
- [x] 6.2 Registros REJECTED incluem `hmacValid=false`
- [x] 6.3 Política de retenção de 90 dias implementada em `WebhookAuditService.pruneOldLogs()`

### Req. 7 — Idempotência

- [x] 7.1 `gatewayTransactionId` é `@unique` no modelo `Payment`
- [x] 7.2 Webhook duplicado retorna HTTP 200 `{ status: "already_processed" }` sem reprocessar
- [x] 7.3 Audit log registra status `DUPLICATE` para eventos repetidos

---

## Assinatura de Aprovação (pré-deploy)

| Responsável | Data | Resultado |
|-------------|------|-----------|
| _(dev responsável)_ | _(data)_ | ☐ APROVADO / ☐ REPROVADO |

**Condição de aprovação:** todos os itens marcados com [x] e todos os greps retornando zero ocorrências.
