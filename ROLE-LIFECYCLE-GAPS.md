# ROLE LIFECYCLE GAPS — foot-stock
> Gerado por auditoria Passo 2.4 (update-task-user-stories)
> Data: 31/03/2026 | Passes: 2 | Roles auditados: 8

---

## TASKS

### CRÍTICO

- [x] **T01** — Adicionar botão e fluxo "Excluir conta" no `/perfil` (LGPD Art. 18)
  - Arquivo: `components/profile/ProfilePageClient.tsx`
  - A seção LGPD existe mas só tem link para política de privacidade. Falta botão "Solicitar exclusão de dados" que chame `DELETE /api/v1/users/me` (com confirmação modal + exigência de cancelar assinatura antes).
  - Roles afetados: JOGADOR, CRAQUE, LENDA

- [x] **T02** — Criar rota admin `DELETE /api/v1/admin/users/[id]` para exclusão LGPD via painel
  - Arquivo novo: `app/api/v1/admin/users/[id]/route.ts` (handler DELETE)
  - Deve: verificar se usuário tem assinatura ativa → cancelar antes de deletar → chamar `deleteAccount()` → registrar em `AdminMarketAction`
  - Roles que executam: SUPER_ADMIN, ADMINISTRADOR
  - Roles afetados: qualquer usuário

- [x] **T03** — Adicionar botão "Excluir usuário" no painel admin `/admin/usuarios`
  - Arquivo: `app/(admin)/admin/usuarios/page.tsx`
  - Conectar ao endpoint T02. Mostrar apenas para SUPER_ADMIN e ADMINISTRADOR.

- [x] **T04** — Implementar status BANNED (rota ban + rota unban + UI admin)
  - Arquivos: `app/api/v1/admin/users/[id]/ban/route.ts` (novo), `app/(admin)/admin/usuarios/page.tsx`
  - BANNED = bloqueio permanente, diferente de SUSPENDED (temporário)
  - Adicionar botão "Banir" e "Remover banimento" no painel admin

---

### ALTO

- [x] **T05** — Criar página de histórico de pagamentos/assinaturas para o usuário
  - Arquivo novo: `app/(app)/planos/historico/page.tsx`
  - Rota nova: `app/api/v1/subscriptions/history/route.ts` (GET — lista pagamentos do usuário autenticado)
  - Exibir: data, plano, valor, status, período

- [x] **T06** — Verificar e corrigir uso do `canAccess.ts` nas rotas admin
  - Ler todos os handlers em `app/api/v1/admin/` e verificar se usam `canAccess()` ou apenas `isAdmin`
  - Se não usarem: adicionar guard `canAccess(adminRole, resource)` em cada rota com o recurso correto
  - Garantir que MONITOR não consiga chamar rotas de escrita, EDITOR não acesse dados financeiros, etc.

- [x] **T07** — Implementar guard anti-self-promotion no backend
  - Arquivo: `app/api/v1/admin/admins/route.ts` (POST handler)
  - Adicionar: se `requester.id === target.id` e `target.adminRole === 'SUPER_ADMIN'` → bloquear com 403

---

### MÉDIO

- [x] **T08** — Corrigir mensagem de downgrade em `/planos` — explicar o caminho real
  - Arquivo: `app/(app)/planos/PlansPageClient.tsx`
  - Substituir "Downgrade não está disponível" por mensagem que orienta: cancelar assinatura → plano expira na data de renovação → retorna automaticamente ao JOGADOR

- [x] **T09** — Exibir elegibilidade de reembolso de 7 dias no fluxo de cancelamento
  - Arquivo: `app/(app)/planos/PlansPageClient.tsx`
  - Se assinatura foi criada há menos de 7 dias: mostrar aviso "Você tem direito a reembolso total — arrependimento em 7 dias (CDC Art. 49)"

- [x] **T10** — Adicionar fluxo de reativação pós-cancelamento
  - Arquivo: `app/(app)/planos/PlansPageClient.tsx`
  - Se status da assinatura for CANCELLED ou EXPIRED: mostrar botão "Reativar plano" em vez de "Fazer upgrade" para o mesmo plano anterior

- [x] **T11** — Remover ou implementar status TRIAL (dead code)
  - Arquivo: `lib/enums/index.ts`
  - Decisão: se não há plano de implementar trial → remover do enum e do schema Prisma para evitar confusão
  - Se houver plano de trial: criar rota `POST /api/v1/subscriptions/trial` e lógica de expiração

---

### BAIXO

- [x] **T12** — Adicionar modal de boas-vindas pós-upgrade (JOGADOR→CRAQUE/LENDA)
  - Arquivo: `app/(app)/planos/PlansPageClient.tsx` (no callback de sucesso do checkout)
  - Exibir: "Bem-vindo ao CRAQUE/LENDA! Agora você tem acesso a [features novas]"

- [x] **T13** — Melhorar modal CANCELLATION_LOCK com detalhes de liquidação forçada
  - Arquivo: `components/plans/CancellationLockWarning.tsx`
  - Adicionar: aviso sobre risco de slippage na liquidação automática, instruções de como liquidar manualmente

- [x] **T14** — Informar no painel admin que ao promover usuário, planType vira JOGADOR
  - Arquivo: `app/(admin)/admin/usuarios/page.tsx`
  - Adicionar tooltip ou nota no formulário de promoção: "Ao tornar admin, o plano do usuário será alterado para JOGADOR"

---

## PROGRESSO

| Task | Status | Arquivo(s) alterado(s) |
|------|--------|------------------------|
| T01 | ✅ concluído | `components/profile/ProfilePageClient.tsx` |
| T02 | ✅ concluído | `app/api/v1/admin/users/[id]/route.ts` (novo) |
| T03 | ✅ concluído | `app/(admin)/admin/usuarios/page.tsx` |
| T04 | ✅ concluído | `app/api/v1/admin/users/[id]/ban/route.ts` (novo), `app/(admin)/admin/usuarios/page.tsx` |
| T05 | ✅ concluído | `app/(app)/planos/historico/page.tsx` (novo), `app/api/v1/subscriptions/history/route.ts` (novo), `PlansPageClient.tsx` |
| T06 | ✅ concluído | `engagement/route.ts`, `engagement/history/route.ts`, `engagement/cohort/route.ts`, `news/route.ts`, `news/inject/route.ts` |
| T07 | ✅ concluído | `app/api/v1/admin/admins/route.ts` |
| T08 | ✅ concluído | `app/(app)/planos/PlansPageClient.tsx` |
| T09 | ✅ concluído | `app/(app)/planos/PlansPageClient.tsx` |
| T10 | ✅ concluído | `app/(app)/planos/PlansPageClient.tsx` |
| T11 | ✅ concluído | `lib/enums/index.ts` (marcado como @deprecated dead code) |
| T12 | ✅ concluído | `app/(app)/planos/PlansPageClient.tsx` |
| T13 | ✅ concluído | `components/plans/CancellationLockWarning.tsx` |
| T14 | ✅ concluído | `app/(admin)/admin/usuarios/page.tsx` |
