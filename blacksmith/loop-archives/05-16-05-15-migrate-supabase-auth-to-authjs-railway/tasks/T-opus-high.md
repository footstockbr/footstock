---
description: Bucket T-opus-high - 7 tasks intermediarias (TASK-1..TASK-7) da migracao Supabase -> Auth.js v5 + Railway
model: opus
effort: high
scope: task
mode_support:
- write
---

# Bucket T-opus-high

Itens deste bucket (ordem fixa, dependencias TASK-1 -> TASK-7):
- 002 - TASK-1: Schema migration M054 + type augmentation (`prisma/schema.prisma`, `prisma/migrations/M054-add-password-hash/`, `src/types/next-auth.d.ts`).
- 003 - TASK-2: Auth.js v5 split config (`auth.config.ts` edge-safe + `auth.ts` Node) + `[...nextauth]/route.ts` + middleware refactor + env vars.
- 004 - TASK-3: Login route dual-stack (`auth-credentials.ts`, `app/api/v1/auth/login/route.ts`) com backfill silencioso, timing defense (dummy bcrypt) e race-safe (`updateMany` com `where: passwordHash: null`).
- 005 - TASK-4: Logout route + `clearDualCookies` wiring + cookie strategy (`__Secure-authjs.session-token` em prod, `authjs.session-token` em dev).
- 006 - TASK-5: Seed script Prisma + bcrypt + upsert (substitui `seed-prod-test-users.ts`, remove Supabase Auth Admin API).
- 007 - TASK-6: Migrar `/api/v1/users/me/password` para bcrypt (prevenir regressao pos-seed).
- 008 - TASK-7: Deploy prod + `prisma migrate deploy` + seed + smoke E2E 5 personas + lista final dos 9 usuarios.

## Iteration template

```
/loop:iteraction:create-task {task_path}
/loop:iteraction:review-created-task {task_path}
/clear
/loop:iteraction:execute-task {task_path}
/clear
/loop:iteraction:review-executed-task {task_path}
```

## Criterios de aceite do bucket

- Cada task com AC-XXX 100% validados (AC-001..AC-00N declarados em cada item).
- Diff aplicado em commit atomico em `main` (trunk-based; sem `git checkout -b`).
- Suite de testes correspondente verde (≥ 4 novas suites: `auth-credentials`, `login-route-dual-stack`, `logout-route`, `users-me-password`).
- Mascaramento absoluto de tokens/senhas/hash em todo log/output (`{first10}***{last4}` ou `***`).
- TASK-7 exige confirmacao humana explicita ANTES de `prisma migrate deploy` em prod E ANTES do seed em prod (duas confirmacoes separadas).
