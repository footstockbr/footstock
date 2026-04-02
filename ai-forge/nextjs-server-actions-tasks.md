# Server Actions — Task List
_Gerado por `/nextjs:server-actions` em 2026-04-01_

## Contexto
Projeto foot-stock (Next.js 15 + React 19). Nenhuma Server Action implementada.
12 formulários client-side via fetch/apiClient. Escopo: implementação seletiva
para forms admin (alto risco, sem clientes externos), preservando API routes
para endpoints consumidos pelo mobile/footstock-next.

---

### T001 - Criar `lib/action-utils.ts` (fundação de tipos)

**Tipo:** SEQUENTIAL
**Dependências:** none
**Status:** COMPLETED

**Arquivos:**
- criar: `lib/action-utils.ts`

**Descrição:**
Tipo ActionResult<T>, helpers actionSuccess/actionError/getErrorMessage
e estado inicial para useActionState.

**Critérios de Aceite:**
- [x] ActionResult<T> exportado
- [x] actionSuccess / actionError / getErrorMessage exportados
- [x] initialActionState exportado
- [x] Compatível com assinatura de useActionState (prevState primeiro argumento)

---

### T002 - Criar `lib/auth/action-auth.ts` (auth helper para Server Actions)

**Tipo:** SEQUENTIAL
**Dependências:** T001
**Status:** COMPLETED

**Arquivos:**
- criar: `lib/auth/action-auth.ts`

**Descrição:**
Helper `getAdminActionUser(resource)` que verifica sessão e permissão RBAC,
retornando `ActionResult` em caso de falha em vez de `redirect()`.
Reutiliza `getAuthUser()` de `lib/auth/server.ts` e `canAccess()`.

**Critérios de Aceite:**
- [x] Usa createServerClient com cookies() — compatível com Server Actions
- [x] Retorna { user } em sucesso ou ActionResult de erro
- [x] Checagem de adminRole via db (nunca via JWT claims)
- [x] Suporte a fs_dev_auth cookie em dev

---

### T003 - Criar `app/actions/admin/news.ts` (injectNews Server Action)

**Tipo:** SEQUENTIAL
**Dependências:** T001, T002
**Status:** COMPLETED

**Arquivos:**
- criar: `app/actions/admin/news.ts`

**Descrição:**
Server Action `injectNewsAction` compatível com useActionState.
Valida input com `adminNewsInjectSchema`, checa RBAC `motor:control`,
chama `newsInjectionService.inject()` e revalida path.

**Critérios de Aceite:**
- [x] Assinatura (prevState, formData) compatível com useActionState
- [x] Validação Zod com fieldErrors
- [x] Auth verificada via action-auth.ts
- [x] try/catch sem capturar redirect
- [x] revalidatePath após mutation
- [x] Retorno ActionResult tipado

---

### T004 - Criar `components/ui/SubmitButton.tsx`

**Tipo:** SEQUENTIAL
**Dependências:** none
**Status:** COMPLETED

**Arquivos:**
- criar: `components/ui/SubmitButton.tsx`

**Descrição:**
Wrapper em torno do `Btn` existente que usa `useFormStatus` para
desabilitar e exibir loading automaticamente durante submissão de Server Action.

**Critérios de Aceite:**
- [x] Usa useFormStatus de react-dom
- [x] Passa isLoading={pending} para Btn
- [x] Props customizáveis (variant, size, loadingText, fullWidth)
- [x] Exportado em components/ui/index.ts

---

### T005 - Atualizar `components/admin/NewsInjector.tsx`

**Tipo:** SEQUENTIAL
**Dependências:** T001, T003, T004
**Status:** COMPLETED

**Arquivos:**
- modificar: `components/admin/NewsInjector.tsx`

**Descrição:**
Migrar de fetch manual para Server Action via useActionState.
Remover isSubmitting manual, usar SubmitButton com useFormStatus.
Preservar visual e lógica de sentimento slider.

**Critérios de Aceite:**
- [x] useActionState substituindo useState(successMsg/errorMsg)
- [x] SubmitButton substituindo button manual
- [x] form action={formAction} em vez de onSubmit={handleSubmit}
- [x] Feedback de erro/sucesso via state.error / state.message
- [x] fieldErrors exibidos por campo
- [x] Progressive enhancement: form funciona sem JS (hidden inputs para dados não-FormData)
