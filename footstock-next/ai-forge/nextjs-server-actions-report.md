# Server Actions Report — Foot Stock

> Gerado por `/nextjs:server-actions` em 2026-04-02

---

## Status: COMPLETO

## Métricas

| Métrica | Resultado |
|---|---|
| Server Actions criadas | 1 (`verifyAgeAction`) |
| ActionResult type | Criado em `src/lib/action-utils.ts` |
| Formulários analisados | 8 |
| Formulários convertidos | 1 (`verificar-idade`) |
| Formulários mantidos como fetch→API | 7 (decisão arquitetural documentada) |
| Erros TypeScript introduzidos | 0 |
| Revalidação adicionada | N/A (verificar-idade não tem cache RSC) |

---

## Decisão Arquitetural

O projeto usa deliberadamente `fetch → /api/v1/*` para todas as mutações.
Esta arquitetura é **correta e deve ser preservada** porque:

1. **API-first** — prepara para futuros clientes mobile/externa
2. **Rate limiting por IP** — middleware injeta `x-user-id`; limite por endpoint via `getForgotPasswordRateLimit()`
3. **Real-time** — `OrderForm` depende de hooks de WebSocket; Server Actions não se integram com esse padrão
4. **TanStack Query** — `CreateLeagueForm` usa `useMutation` + `invalidateQueries`; conversão perderia cache management
5. **Auditoria** — `DeleteAccountModal` gera trilha de auditoria no API route

---

## Gap Corrigido: verificar-idade/page.tsx

**Antes:** página estática com `<input>` + `<button>` SEM handler, SEM action, SEM estado.
O formulário não executava NADA ao submeter.

**Depois:**
- Server Action `verifyAgeAction` em `src/actions/age-verification.ts`
- Validação Zod do `birthDate`
- `calcAge()` para checar >= 18 anos
- `useActionState` na página (`"use client"`)
- Progressive enhancement via `<form action={formAction}>`
- Feedback de erro inline (`role="alert"`)
- Redirect para `/mercado` via `useEffect` no success
- Botão disabled durante `isPending`

---

## Arquivos criados/modificados

| Arquivo | Operação |
|---|---|
| `src/lib/action-utils.ts` | **Criado** — ActionResult type + helpers |
| `src/actions/age-verification.ts` | **Criado** — verifyAgeAction Server Action |
| `src/app/(app)/verificar-idade/page.tsx` | **Modificado** — conectado com useActionState |

---

## Formulários que mantêm fetch → API (documentados)

| Formulário | Razão |
|---|---|
| `LoginForm` | Cookies Supabase + middleware interplay |
| `RecuperarSenhaPage` | Rate limit IP + supabaseAdmin service role + segurança enumeração |
| `ResetPasswordForm` | Token-based + revogação no API route |
| `OrderForm` | Real-time: useMarketTick, useMotorStatus, useMarketSession |
| `CreateLeagueForm` | TanStack Query: useMutation + invalidateQueries |
| `DeleteAccountModal` | Operação destrutiva: auditoria + anonimização LGPD |
| `LGPDActions` (export) | Streaming de dados do banco |
