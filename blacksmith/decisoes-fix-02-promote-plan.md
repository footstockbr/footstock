# Decisao FIX-02 / Task 04 - destino do endpoint promote-plan

Data: 2026-06-22
Loop: 06-22-footstock-financeiro-planos (item 004)

## Contexto

Existiam dois caminhos de troca de plano pelo admin:

1. UI `UserActions.tsx > handleChangePlan` -> `PATCH /api/v1/admin/users/[id]`
   com `{ planType }`. Este caminho fazia apenas `user.update({ planType })`,
   deixando `User.planType` divergente de Subscription (o usuario ficava LENDA
   sem nenhuma Subscription ACTIVE). Violava a invariante C2.

2. `POST /api/v1/admin/users/[id]/promote-plan` fazia o correto (transacao:
   cancela subs anteriores + cria Subscription ACTIVE + audit), mas era CODIGO
   MORTO: zero callers em todo o workspace (`grep -rn promote-plan src` so
   retornava a propria definicao). A UI nunca o chamou.

## Decisao

REMOVER o endpoint `promote-plan` e CONSOLIDAR sua logica no `PATCH` (o caminho
que a UI realmente usa). Motivos:

- Eliminar definitivamente a divergencia entre dois caminhos de troca de plano.
- O `PATCH` ja concentra o guard de hierarquia admin e os demais campos editaveis
  (name/adminRole/userType); plano coerente no mesmo lugar evita drift.
- A politica canonica (AUTH-009 staff + downgrade bloqueado + Subscription ACTIVE
  coerente + audit) foi extraida para `src/lib/admin/plan-change.ts` (pura,
  testavel) e e aplicada pelo `PATCH` quando `planType` muda.

Aceite atendido: "promote-plan deixa de ser codigo morto OU foi removido com
decisao registrada" -> removido, decisao registrada aqui.

## Diferencas vs implementacao antiga do promote-plan

- Guard AUTH-009 agora usa `user.adminRole` (alinhado a `PlanService.upgradeUser`)
  alem de `userType` institucional. A versao antiga checava apenas
  `userType === 'ADMIN' | 'CLUB_PARTNER'`, que nao casava com os valores reais de
  `userType` (NORMAL/TIME_PARCEIRO/INFLUENCIADOR) — CLUB_PARTNER e adminRole.
- `previousPlanType` passa a ser gravado na Subscription criada (G-02).
- Troca manual NAO credita bonus de upgrade: nenhum pagamento ocorreu, creditar
  FS$ aqui criaria dinheiro do nada. O audit (`adminMarketAction PROMOTE_PLAN`)
  registra a operacao.

## Arquivos

- `src/lib/admin/plan-change.ts` (novo) - politica pura.
- `src/app/api/v1/admin/users/[id]/route.ts` (PATCH) - consolida a troca coerente.
- `src/components/admin/UserActions.tsx` - leitura correta de `body.error.message`.
- `src/app/api/v1/admin/users/[id]/promote-plan/route.ts` - REMOVIDO.
- `tests/unit/admin/change-plan.test.ts` (novo) - regressao da politica.
