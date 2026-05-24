# PCI-DSS Checklist — Foot Stock (Nível 4 — Gateway Tokenizado)

**Versão:** 1.0 | **Data:** 2026-03-28 | **Scope:** lib/gateways/, app/api/v1/payments/

## Requisito 1 — Dados de cartão nunca armazenados

- [ ] 1.1 Nenhum campo `cardNumber`, `cvv`, `cvc`, `expiryDate` ou `cardHolder` no banco
- [ ] 1.2 `grep -r "cardNumber\|cvv\|cvc\|expiryDate\|cardHolder" prisma/schema.prisma` retorna zero
- [ ] 1.3 `grep -r "cardNumber\|cvv\|creditCard" lib/gateways/` retorna zero
- [ ] 1.4 Modelo `Payment` armazena apenas `gatewayTransactionId`, `amount`, `status`, `gateway`, `gatewayMeta`

## Requisito 2 — Redirect Checkout (sem tokenização local)

- [ ] 2.1 Todos os gateways usam redirect checkout (usuário inseriu dados no gateway externo)
- [ ] 2.2 Nenhuma implementação de tokenização local ou armazenamento de PAN
- [ ] 2.3 Dados de pagamento nunca passam pelo servidor da aplicação

## Requisito 3 — Autenticação e validação de webhooks

- [ ] 3.1 HMAC validado antes de qualquer processamento em 100% dos webhooks
- [ ] 3.2 `crypto.timingSafeEqual()` usado em todas as comparações HMAC
- [ ] 3.3 Webhooks inválidos rejeitados com HTTP 401 (PAYMENT_001)
- [ ] 3.4 Timestamps validados — replay attack bloqueado > 5 minutos (PAYMENT_002)

## Requisito 4 — Secrets de gateway apenas em variáveis de ambiente

- [ ] 4.1 Nenhum secret hardcoded em arquivo de código (`grep -r "sk_live\|mp_access_token" lib/`)
- [ ] 4.2 Todos os secrets validados via Zod no startup (PAYMENT_010 se ausente)
- [ ] 4.3 Variáveis server-only sem prefixo `NEXT_PUBLIC_`
- [ ] 4.4 `.env.example` com valores placeholder para todos os gateways

## Requisito 5 — Rate limiting

- [ ] 5.1 Rate limit de 100 req/min por IP no endpoint `/api/v1/payments/webhook`
- [ ] 5.2 Excesso retorna HTTP 429 com código PAYMENT_055
- [ ] 5.3 Rate limit implementado com Upstash Redis (sliding window)

## Requisito 6 — Logs de auditoria

- [ ] 6.1 Todo webhook (aceito, rejeitado, duplicado) gera registro em `webhook_audit_logs`
- [ ] 6.2 Registros REJECTED incluem `hmacValid=false` para detecção de ataques
- [ ] 6.3 Política de retenção de 90 dias aplicada
- [ ] 6.4 Endpoint admin paginado protegido por `withAdmin`

## Requisito 7 — Idempotência

- [ ] 7.1 `gatewayTransactionId` é UNIQUE no banco
- [ ] 7.2 Webhook duplicado retorna HTTP 200 `{ status: "already_processed" }`
- [ ] 7.3 `PlanService.upgradeUser()` não executa upgrade duplo

## Requisito 8 — HTTPS e comunicação segura

- [ ] 8.1 HTTPS obrigatório em produção (configurado no Railway)
- [ ] 8.2 Timeout de 5s para chamadas ao gateway externo
- [ ] 8.3 Retry com backoff exponencial para falhas de rede

## Verificação final (pré-deploy)

```bash
# Verificar ausência de campos proibidos
grep -i "cardNumber\|cvv\|cvc\|expiryDate\|cardHolder\|pan" prisma/schema.prisma

# Verificar ausência nos gateways
grep -r "cardNumber\|cvv\|creditCard" lib/gateways/

# Verificar secrets hardcoded
grep -r "sk_live\|access_token.*mp\|pk_live" lib/ app/ --include="*.ts"

# Verificar HMAC timingSafeEqual em uso
grep -r "timingSafeEqual" lib/gateways/

# Contar itens marcados como concluídos neste arquivo
grep "\[x\]" docs/pci-dss-checklist.md | wc -l
# Esperado antes do deploy: >= 20
```
