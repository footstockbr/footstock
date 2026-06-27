# Veredito de Regressao - Item 010 (loop 06-26-foot-stock-pagamentos-recorrencia-pagseguro)

Consolidado de regressao + QA UI para consumo pela finalizacao (Item 011).
Gerado pela execucao da task-010-regressao-qa-ui via `/execute-task`.

## Escopo de dependencias (precedencia)

Todas as precondicoes da task estao entregues (`[x]` em PROGRESS.md), portanto
todos os fluxos dependentes foram incluidos na regressao:

- Item 003 (preapproval MP planless) -> entregue -> fluxo recorrencia incluido
- Item 005 (politica de cancelamento recorrente) -> entregue -> fluxo cancelamento incluido
- Item 008 (detector/validador PagSeguro) -> entregue -> fluxo webhook invalido/gateway incluido
- Item 009 (gate de env PagSeguro) -> entregue -> fluxo exposicao de gateway incluido

Nenhum skip por dependencia nao habilitada. Nenhum item parcial/inconsistente (sem bloqueio FAILED).

## Matriz de cenarios - resultado por fluxo

| Fluxo | Cobertura (teste) | Resultado |
|-------|-------------------|-----------|
| checkout (happy/sad) | `checkout-gateways`, `enabled-checkout-gateways`, `planos-staff-policy` + estados do `CheckoutButton.tsx` | VERDE |
| webhook (happy) | `webhook-status-matrix-fix15` | VERDE |
| webhook (duplicado/idempotente) | `higiene-p3-webhook-hardening` ST003 (dedup por `payment.id`, 2o evento => DUPLICATE sem reprocessar) | VERDE |
| webhook (invalido) | `mercadopago-hmac-validator`, `webhook-not-activatable`, `higiene-p3-webhook-hardening` | VERDE |
| recorrencia (preapproval planless authorized) | `mercadopago-subscription` | VERDE |
| pending (sem lockout orfao) | `subscription-past-due-not-stuck` | VERDE |
| cancelamento | `subscription-cancel-recurring` | VERDE |
| revert | `subscription-cancel-recurring` + `tier2-cancellation-lock` (e2e) | VERDE |
| exposicao de gateway (sem vazar segredo) | `enabled-checkout-gateways`, `pagseguro-gate-states` | VERDE |
| H-A nao altera CSP | `planos-csp-ha-invariant` (NOVO, este loop) | VERDE |

## Estados de UI em /planos - evidencia por data-testid (7/7)

| Estado | data-testid | Local |
|--------|-------------|-------|
| loading | `checkout-gateway-loading` | CheckoutButton.tsx:229 |
| no-gateway | `checkout-no-gateway` | CheckoutButton.tsx:236 |
| select | `checkout-gateway-select` | CheckoutButton.tsx:250 |
| confirm | `plan-checkout-modal-checkout-confirm` | CheckoutButton.tsx:256 |
| pending | `checkout-pending-notice` + `planos-payment-banner-pending` | CheckoutButton.tsx:279 / planos/page.tsx:171 |
| error | `checkout-block-reason` + `planos-payment-banner-failed` | CheckoutButton.tsx:269 / planos/page.tsx:171 |
| success | `planos-payment-banner-success` + `success-back-to-market` | planos/page.tsx:171 / planos/sucesso/page.tsx:74 |

Feedback observavel (Zero Silencio) presente em cada transicao critica:
loading (skeleton/disable do CTA), pending (label ambar `role=status`), error
(`role=alert` vermelho), success (banner verde + revalidacao).

## H-A (preapproval planless) x CSP - verificacao objetiva

- CSP definido estaticamente em `next.config.ts` (`securityHeaders` aplicado a `source: '/:path*'`, cobre `/planos`).
- `script-src` e `connect-src` NAO contem nenhuma origem de gateway (mercadopago/mercadolibre/mlstatic/pagseguro/pagbank/paypal). Confirmado por grep no source e pelo guard `planos-csp-ha-invariant`.
- Nao existe SDK client-side de pagamento no `src/`/`public/` (matches de grep foram falsos-positivos de `generateSecureToken`).
- H-A e redirect top-level (`window.open`/`location.href` para `init_point`), nao fetch/XHR ao gateway -> nao requer entrada em `connect-src`.
- Conclusao: CSP de /planos antes == depois do fluxo H-A. Diff esperado = nenhum. O guard falha automaticamente se algum dia uma origem de gateway entrar no CSP (regressao de H-A).

## Execucao de testes (baseline)

- Unitarios de pagamento (14 suites): **129 passed / 0 failed** (7.3s)
- Guard H-A CSP (NOVO): **4 passed / 0 failed**
- Integracao `billing-audit` + `concurrency` (idempotencia): **50 passed / 0 failed**
- Integracao `route-audit` + `api-contract-audit`: **self-skip** (DB-backed, gated por ambiente)
- E2E (Playwright): testids dos 7 estados verificados estaticamente; execucao completa do runner gated por servidor + DB (mesma classe dos integration DB-backed). Skip justificado; logica coberta nas camadas unit/integration.

## Artefato criado nesta task (Zero Assumido)

- `tests/unit/planos-csp-ha-invariant.test.ts` - guard executavel do criterio H-A x CSP (unica lacuna real: o criterio era exigido pela task mas nao tinha teste). Demais fluxos da matriz ja tinham cobertura.

## Veredito final

**APROVADO** - regressao verde em todos os fluxos da matriz; 7/7 estados de UI com
evidencia de testid + feedback; H-A confirmado nao alterar CSP por evidencia estatica
+ guard executavel. Nenhuma regressao critica detectada; deploy nao bloqueado por esta task.
Skips (route-audit, api-contract-audit, E2E) sao gated por ambiente (DB/servidor), nao falhas.
