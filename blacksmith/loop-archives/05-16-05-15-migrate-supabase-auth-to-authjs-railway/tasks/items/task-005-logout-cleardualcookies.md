---
description: Task 005 - TASK-4 Logout route + clearDualCookies wiring + cookie strategy (Auth.js v5)
model: opus
effort: high
scope: task
task_type: task
mode_support:
- write
---

# Task 005 - TASK-4: Logout route + clearDualCookies wiring + cookie strategy

Origem: `source.md` linhas 127-138 (Item 4 - TASK-4).

## Contexto

Garantir que logout invalida cookies de AMBOS os stacks (Auth.js + Supabase legacy). Confirmar explicitamente defaults do v5 no `auth.ts` (`cookies: { sessionToken: { ... } }`) para evitar surpresas. Bloquear sign-in quando dual-cookie detectado, forcando o client a limpar antes de re-tentar.

## Arquivos tocados

- `footstock-next/src/app/api/v1/auth/logout/route.ts` (modificar):
  - Chamar `await signOut({ redirect: false })` do Auth.js PRIMEIRO.
  - Em seguida: `if (FEATURE_AUTH_SUPABASE_FALLBACK) await supabaseAdmin.auth.admin.signOut(userId)` para invalidar refresh tokens legados.
  - Finalizar com `clearDualCookies(response)` para garantir limpeza de `sb-*` + `authjs.*` + `next-auth.*`.
- `footstock-next/src/auth.ts` (modificar TASK-2): adicionar bloco `cookies`:
  ```ts
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === 'production'
        ? '__Secure-authjs.session-token'
        : 'authjs.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  }
  ```
- `footstock-next/src/auth.ts` callback `signIn`: invocar `detectIdentityConflict` quando ambos cookies presentes; se conflict, `handleIdentityConflict` + retornar `false` (bloqueia o sign-in e forca limpeza pelo client).

## Evidencia esperada

- Smoke local: login -> logout -> validar que `Set-Cookie` da response contem `Max-Age=0` para `__Secure-authjs.session-token` + `sb-access-token` + `sb-refresh-token`.
- `tests/integration/logout-route.test.ts` (novo ou atualizar): cobrir logout Auth.js puro, logout Supabase legado, logout dual.
- `tests/integration/auth-dual-cookie-conflict.test.ts` continua verde (regressao zero do NXAUTH-04A).

## Criterios de aceite

- AC-001: logout invalida ambos cookies (Auth.js + Supabase) em todos os cenarios.
- AC-002: conflito dual-cookie no `signIn` callback bloqueia o sign-in e forca limpeza.
- AC-003: cookie names corretos por ambiente (`__Secure-authjs.session-token` em prod, `authjs.session-token` em dev).

## Restricoes locais

- Cookie name em prod EXIGE prefixo `__Secure-` (browsers rejeitam `Set-Cookie` `__Secure-*` em HTTP nao-TLS).
- `clearDualCookies` ja existe em `lib/auth.ts` - reaproveitar, NAO duplicar.
- Logout NUNCA dispara antes do `signOut({ redirect: false })` finalizar (Auth.js precisa do call para limpar JWT do server-side).
