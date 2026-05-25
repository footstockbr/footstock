# Reversão de Preços — Planos CRAQUE e LENDA

**Data da alteração:** 2026-05-23  
**Commit de redução:** `0810054`  
**Motivo:** Teste de pagamento real em produção (R$1,00 para validar fluxo MP/PIX)

---

## O que foi alterado

Três arquivos tiveram os preços reduzidos de R$19,90/R$39,90 para R$1,00:

| Arquivo | O que muda |
|---------|-----------|
| `footstock-next/src/lib/services/plan-logic.ts` | Valor real em centavos enviado ao gateway (Mercado Pago, PIX) |
| `footstock-next/src/lib/constants/plans.ts` | String de exibição usada por outros componentes via `PLAN_PRICES` |
| `footstock-next/src/app/(app)/planos/page.tsx` | String de exibição na página de planos (`/planos`) |

---

## Como reverter

### 1. `footstock-next/src/lib/services/plan-logic.ts` (linha ~61)

```typescript
// ATUAL (teste)
CRAQUE:  { monthly: 100, yearly: 100 }, // R$1,00 — preço temporário de teste
LENDA:   { monthly: 100, yearly: 100 }, // R$1,00 — preço temporário de teste

// REVERTER PARA
CRAQUE:  { monthly: 1990, yearly: 17904 }, // R$19,90 / R$179,04 anual (R$14,92/mês -25%)
LENDA:   { monthly: 3990, yearly: 35904 }, // R$39,90 / R$359,04 anual (R$29,92/mês -25%)
```

### 2. `footstock-next/src/lib/constants/plans.ts` (linha ~19)

```typescript
// ATUAL (teste)
[PlanType.CRAQUE]: "R$ 1,00/mês",
[PlanType.LENDA]: "R$ 1,00/mês",

// REVERTER PARA
[PlanType.CRAQUE]: "R$ 19,90/mês",
[PlanType.LENDA]: "R$ 39,90/mês",
```

### 3. `footstock-next/src/app/(app)/planos/page.tsx` (linhas ~53 e ~80)

```typescript
// ATUAL (teste) — dois trechos separados no array PLANS
{ price: "R$ 1,00", period: "/mês" }   // CRAQUE
{ price: "R$ 1,00", period: "/mês" }   // LENDA

// REVERTER PARA
{ price: "R$ 19,90", period: "/mês" }  // CRAQUE
{ price: "R$ 39,90", period: "/mês" }  // LENDA
```

---

## Contexto de cada arquivo

### `plan-logic.ts` — fonte da verdade financeira

Função `calcSubscriptionAmount(planType, period)` retorna o valor **em centavos** (Int, padrão PCI-DSS).

- Consumido por `pix-checkout/route.ts` para gerar o `transaction_amount` enviado à API do Mercado Pago (`amount / 100` converte para reais antes do POST).
- Consumido por `PlanService.createCheckout()` para registrar o valor na subscription no banco.
- Os valores anuais originais aplicam desconto de 25%: CRAQUE = R$14,92/mês × 12 = R$179,04; LENDA = R$29,92/mês × 12 = R$359,04.

### `plans.ts` — constante de display

`PLAN_PRICES` é importado por componentes que exibem o preço sem passar pela página de planos diretamente. Verificar se outros componentes além dos listados abaixo o importam antes de reverter:

```bash
grep -r "PLAN_PRICES" footstock-next/src --include="*.ts" --include="*.tsx"
```

### `planos/page.tsx` — display local

O array `PLANS` define preço como string diretamente (`price`, `period`) — independente de `PLAN_PRICES` da constante. Ambos precisam ser atualizados separadamente.

---

## Comando de reversão rápida (referência)

Após editar os três arquivos manualmente:

```bash
git add footstock-next/src/lib/services/plan-logic.ts \
        footstock-next/src/lib/constants/plans.ts \
        "footstock-next/src/app/(app)/planos/page.tsx"

git commit -m "chore(plans): restaura preços reais CRAQUE R\$19,90 e LENDA R\$39,90"

git push origin main
```

---

## Notas

- Não há preço hardcoded em banco ou no Mercado Pago — o valor é calculado em runtime a cada checkout, então a reversão é imediata após o deploy.
- Assinaturas já criadas durante o teste (R$1,00) ficam registradas com `amount = 100` na tabela `Subscription`. Isso não afeta usuários novos após a reversão.
- O fluxo de webhook do MP não depende do valor configurado aqui — ele lê o `amount` da própria notificação do gateway.
