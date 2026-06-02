# Server Actions Tasks — FootStock

> Gerado por `/nextjs:server-actions` em 2026-04-02
> Comando shell: `grep -rn '"use server"' src/ --include="*.ts" --include="*.tsx"` → 0 resultados

---

## Diagnóstico Arquitetural

**Decisão:** O projeto usa `fetch → /api/v1/*` para TODAS as mutações.
Esta é uma escolha CORRETA para um app financeiro com:
- Futuros clientes mobile (API pública)
- Rate limiting por IP no middleware
- Integração com WebSocket/real-time (OrderBook, MarketTick)
- Auditoria centralizada por endpoint

**NÃO converter para Server Actions:**
- `OrderForm` → depende de `useMarketTick`, `useMotorStatus`, `useMarketSession` (real-time)
- `CreateLeagueForm` → usa TanStack Query `useMutation` + `invalidateQueries`
- `LoginForm` → auth com cookies gerenciados pelo middleware Supabase
- `RecuperarSenhaPage` → rate limiting por IP + `supabaseAdmin` service role
- `DeleteAccountModal` → operação destrutiva, deve ter auditoria por API route

---

## Tasks

### T001 – Criar `action-utils.ts` com ActionResult type
**Tipo:** SEQUENTIAL
**Dependências:** none
**Status:** COMPLETED

**Arquivos:**
- criar: `src/lib/action-utils.ts`

**Descrição:**
Criar padrão `ActionResult<T>` compatível com `useActionState` para ser usado
nas Server Actions presentes e futuras do projeto.

**Critérios de aceite:**
- `ActionResult<T>` exportado com union `success: true | false`
- Helpers `actionSuccess`, `actionError`, `getErrorMessage`, `initialActionState`
- Importável sem erros de TypeScript

---

### T002 – Server Action para verificar-idade
**Tipo:** SEQUENTIAL
**Dependências:** T001
**Status:** COMPLETED

**Arquivos:**
- criar: `src/actions/age-verification.ts`

**Descrição:**
`verificar-idade/page.tsx` tem input + button SEM handler — a página não faz nada
ao submeter. Criar Server Action que:
1. Valida `birthDate` via Zod
2. Chama `calcAge()` para checar >= 18 anos
3. Retorna `ActionResult` com erro descritivo ou success
4. Compatible com `useActionState`

**Critérios de aceite:**
- `"use server"` no topo do arquivo
- Zod validate de `birthDate` (date string ISO ou YYYY-MM-DD)
- `calcAge(birthDate) >= 18` para aprovar
- Retorno tipado `ActionResult`
- Sem `try/catch` capturando `redirect()`

---

### T003 – Conectar verificar-idade/page.tsx com useActionState
**Tipo:** SEQUENTIAL
**Dependências:** T002
**Status:** COMPLETED

**Arquivos:**
- modificar: `src/app/(app)/verificar-idade/page.tsx`

**Descrição:**
Converter a página estática (atualmente não-funcional) em form com:
- `"use client"` (precisa de `useActionState`)
- `useActionState(verifyAgeAction, initialActionState)`
- Feedback de erro inline (`role="alert"`)
- Botão com estado `isPending` (disabled durante processamento)
- Redirect para `/mercado` em caso de sucesso (via `useEffect` no estado)

**Critérios de aceite:**
- Formulário funciona sem JS degrado (progressive enhancement via `action={formAction}`)
- Erro exibido inline quando < 18 anos
- Redirect para `/mercado` no sucesso
- Build sem erros

---

## Formulários documentados — arquitetura fetch → API route (mantida)

| Formulário | Arquivo | Razão para manter fetch |
|---|---|---|
| LoginForm | `components/auth/login-form.tsx` | Cookies de sessão gerenciados pelo middleware Supabase |
| RecuperarSenhaPage | `app/(auth)/recuperar-senha/page.tsx` | Rate limit por IP + supabaseAdmin service role |
| ResetPasswordForm | `components/auth/reset-password-form.tsx` | Token-based, lógica de revogação no API route |
| OrderForm | `components/orders/OrderForm.tsx` | Real-time: useMarketTick, useMotorStatus, useMarketSession |
| CreateLeagueForm | `components/leagues/CreateLeagueForm.tsx` | TanStack Query: useMutation + invalidateQueries |
| DeleteAccountModal | `components/profile/delete-account-modal.tsx` | Operação destrutiva: auditoria + anonimização via service |
| LGPDActions (export) | `components/profile/lgpd-actions.tsx` | Export assíncrono de dados → resposta streaming API |
