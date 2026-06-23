# Invariante de saldo inicial FS$ por plano

Decisao de produto registrada em 2026-06-22 (via /tools:auq-interview; ver
blacksmith/decisoes-produto-footstock-financeiro.md no repo systemForge).

## Decisao

O saldo inicial em FS$ (moeda ficticia de jogo, sem dinheiro real) permanece
ASSIMETRICO de forma INTENCIONAL:

- Cadastro de novo usuario JOGADOR: FS$ 10.000 (bonus de boas-vindas, via
  `@default(10000)` no campo `fsBalance` do model User em prisma/schema.prisma).
- Reset / downgrade para JOGADOR: FS$ 2.000 (valor canonico de reset por plano,
  definido em src/app/api/v1/admin/users/[id]/reset-balance/route.ts ->
  `PLAN_DEFAULT_BALANCE = { JOGADOR: 2000, CRAQUE: 5000, LENDA: 25000 }`).

Ou seja: um jogador novo comeca com 10.000, mas se cancelar/expirar/for resetado
volta a 2.000. A diferenca (8.000) e o bonus de boas-vindas, que NAO e devolvido
em resets posteriores. Isso e intencional e nao deve ser "corrigido" como bug.

## O que NAO mudar

- NAO padronizar tudo em 2.000 (reduziria o bonus de onboarding de novos jogadores).
- NAO padronizar tudo em 10.000 (inflaria a economia interna e mudaria 6+ caminhos
  de reset: refund, webhook REFUND_COMPLETED, subscription-expiry, cancellation-expiry,
  reset-balance).
- NAO alterar saldos de jogadores existentes.

## Consequencia para o modelo de bonus

O modelo de bonus diferencial de upgrade (plan-logic.ts: calcBonusAmount /
calcUpgradeBonusAmount) assume base 2.000 para JOGADOR (ex: LENDA "inicial 25.000"
= 2.000 base + 23.000 diferencial). Como a base REAL de cadastro e 10.000, um
JOGADOR novo que faz upgrade para LENDA termina com 10.000 + 23.000 = 33.000, e
nao 25.000. Isso e esperado e coerente com a assimetria acima: o "inicial 25.000"
e o saldo apos um reset+upgrade, nao apos um cadastro novo.

## Caminhos de codigo relacionados (referencia)

- prisma/schema.prisma -> model User, campo `fsBalance` (@default(10000)).
- src/app/api/v1/auth/register/route.ts -> cria JOGADOR sem setar fsBalance (herda default).
- src/app/api/v1/admin/users/[id]/reset-balance/route.ts -> PLAN_DEFAULT_BALANCE.
- src/app/api/v1/subscriptions/me/refund/route.ts, src/app/api/v1/payments/webhook/route.ts
  (REFUND_COMPLETED), src/lib/jobs/subscription-expiry.ts, src/lib/jobs/cancellation-expiry.ts
  -> resets para JOGADOR/2000.

Revisao futura: se PRODUTO decidir padronizar o valor canonico, atualizar este doc
e alinhar register + os 6+ caminhos de reset numa unica fonte.
