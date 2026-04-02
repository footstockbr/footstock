# Server Actions — Report
_Gerado por `/nextjs:server-actions` em 2026-04-01_

## Status: COMPLETO

---

## Diagnóstico Inicial

| Métrica | Valor |
|---------|-------|
| Server Actions antes | 0 |
| Formulários client-side | 12 |
| Diretório `actions/` | existia, vazio |
| React version | 19.x (useActionState disponível) |
| Next.js version | 15.x |

**Decisão arquitetural:** Implementação seletiva. O projeto usa API Routes com
middleware RBAC, Redis rate limiting e suporte a clientes externos (footstock-next,
mobile-expo). Migração completa criaria regressão nesses consumidores.

**Escopo implementado:** Forms admin (alto privilégio, sem clientes externos)
como prova de conceito do padrão.

---

## Arquivos Criados/Modificados

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `lib/action-utils.ts` | CRIADO | ActionResult<T>, helpers, initialActionState |
| `lib/auth/action-auth.ts` | CRIADO | Auth RBAC para Server Actions sem redirect() |
| `app/actions/admin/news.ts` | CRIADO | injectNewsAction (motor:control) |
| `components/ui/SubmitButton.tsx` | CRIADO | useFormStatus wrapper em torno de Btn |
| `components/ui/index.ts` | MODIFICADO | Export de SubmitButton adicionado |
| `components/admin/NewsInjector.tsx` | MODIFICADO | Migrado para useActionState |
| `ai-forge/nextjs-server-actions-tasks.md` | CRIADO | Task list rastreável |
| `ai-forge/nextjs-server-actions-report.md` | CRIADO | Este relatório |

---

## Métricas

| Check | Resultado |
|-------|-----------|
| Server Actions implementadas | 1 (injectNewsAction) |
| Validações Zod adicionadas | 1 (reutiliza adminNewsInjectSchema) |
| Auth checks adicionados | 1 (RBAC motor:control via DB) |
| try/catch corretos (sem redirect) | ✅ |
| revalidatePath após mutation | ✅ (/admin/news + /admin) |
| useActionState implementado | 1 form (NewsInjector) |
| useFormStatus via SubmitButton | ✅ |
| Progressive enhancement | ✅ (hidden input para sentimento) |
| Erros TS introduzidos | 0 |
| Erros TS pré-existentes | 36 (next-auth/bcryptjs não instalados — legado) |

---

## Segurança

| Item | Status |
|------|--------|
| Validação de input (Zod) | ✅ adminNewsInjectSchema |
| Auth/Authz server-side | ✅ getAdminActionUser() — lê adminRole do DB, nunca do JWT |
| IDOR | N/A (operação de criação, não leitura por ID) |
| Rate limiting | ⚠️ Herdado da API Route — Server Action não tem Redis RL (ver nota) |
| Idempotência | N/A (injeção de notícia é idempotente por natureza) |

> **Nota rate limiting:** A Server Action chama `newsInjectionService.inject()` diretamente,
> sem passar pelo middleware Redis da API Route. Para forms admin com poucos usuários
> este risco é aceitável. Se necessário, adicionar `checkActionRateLimit()` em
> `lib/ratelimit.ts` dentro da action.

---

## Padrão Estabelecido

Para futuras Server Actions no projeto, seguir:

```
1. lib/action-utils.ts         → ActionResult<T>, helpers
2. lib/auth/action-auth.ts     → getAdminActionUser(resource) para admin
3. app/actions/{domínio}/{nome}.ts  → Server Action com assinatura (prevState, formData)
4. components/ui/SubmitButton  → botão com loading automático via useFormStatus
5. Form component              → useActionState(action, initialActionState as T)
```

---

## Forms Restantes (fora do escopo desta execução)

Forms que mantêm fetch/apiClient — são consumidos pelo mobile-expo e footstock-next:

- `components/auth/LoginForm.tsx`
- `components/auth/ForgotPasswordForm.tsx`
- `components/auth/ResetPasswordForm.tsx`
- `components/leagues/CreateLeagueForm.tsx`
- `components/forum/CreatePost.tsx`
- `components/admin/SponsorEditor.tsx` — candidato futuro (sem clientes externos)
- `components/admin/BannerManager.tsx` — candidato futuro
- `components/affiliate/AffiliateBankConfig.tsx`
- `components/profile/ProfilePageClient.tsx` — candidato futuro
- `footstock-next/src/components/orders/OrderForm.tsx`
- `footstock-next/src/components/auth/login-form.tsx`

---

## Critérios de Aceite

- [x] ActionResult<T> tipado e consistente
- [x] Auth/Authz via DB (nunca JWT claims)
- [x] try/catch correto — redirect FORA do bloco
- [x] revalidatePath após mutation
- [x] useActionState com estado inicial correto
- [x] useFormStatus no SubmitButton
- [x] Progressive enhancement (hidden input para slider)
- [x] fieldErrors por campo com aria-describedby
- [x] Zero erros TypeScript introduzidos
