---
description: Task 003 - TASK-2 Auth.js v5 split config (edge-safe + Node) + route handler + middleware refactor + env vars
model: opus
effort: high
scope: task
task_type: task
mode_support:
- write
---

# Task 003 - TASK-2: Auth.js v5 split config + route handler + middleware refactor

Origem: `source.md` linhas 77-93 (Item 2 - TASK-2). Snippets de referencia: source.md Apendice A.1, A.2, A.3, A.5.

## Contexto

Split config edge-safe (`auth.config.ts`, sem `adapter` e sem `bcryptjs`) + config Node (`auth.ts`, com adapter + Credentials). Route handler raiz exporta GET/POST com `runtime = 'nodejs'`. Middleware decide via cookie presence (`__Secure-authjs.session-token`/`authjs.session-token` -> Auth.js path; senao, fallback Supabase se flag ON).

## Arquivos tocados

- `footstock-next/src/auth.config.ts` (novo, edge-safe): `authConfig satisfies NextAuthConfig`, sem adapter, sem bcryptjs. `providers: []` (sentinela), `callbacks.authorized = ({ auth }) => !!auth`, `pages: { signIn: '/login' }`, `session: { strategy: 'jwt' }`, `trustHost: true` (espelha `AUTH_TRUST_HOST=true`).
- `footstock-next/src/auth.ts` (novo, Node): importa `authConfig`, adiciona `adapter: prismaAdapterWithGuard(prisma)` reaproveitando `authjs-adapter.ts`, adiciona `Credentials` provider (logica em TASK-3), wire de callbacks `jwt`/`session` propagando custom fields, callback `signIn` invocando `handleIdentityConflict` quando detectar dual-cookie via `clearDualCookies`. Exporta `{ handlers, auth, signIn, signOut }`.
- `footstock-next/src/app/api/auth/[...nextauth]/route.ts` (novo): `export const { GET, POST } = handlers; export const runtime = 'nodejs';`.
- `footstock-next/src/middleware.ts` (modificar): importar EXCLUSIVAMENTE `auth.config.ts` (NAO `auth.ts`). Usar `NextAuth(authConfig).auth` como middleware. Gate por cookie presence: se cookie Auth.js presente -> Auth.js path; senao se `FEATURE_AUTH_SUPABASE_FALLBACK=true` -> Supabase legacy preservado; default `NextResponse.next()`. Sem isso, middleware fica em estado indefinido durante transicao.
- `footstock-next/.env.example` (modificar): adicionar `AUTH_SECRET=`, `AUTH_TRUST_HOST=true`, `AUTH_URL=` (opcional), `FEATURE_AUTH_SUPABASE_FALLBACK=true` com comentarios explicativos.
- Railway env vars do service `web`: criar `AUTH_SECRET` (copiar valor existente de `NEXTAUTH_SECRET`), `AUTH_TRUST_HOST=true`, `FEATURE_AUTH_SUPABASE_FALLBACK=true`. **Confirmacao humana antes de chamar `railway variables set`**.

## Evidencia esperada

- `npx tsc --noEmit` verde.
- `npm test -- --silent tests/integration/authjs-adapter.test.ts` continua verde.
- Importacao circular ausente: `node -e "require('./.next/server/app/api/auth/[...nextauth]/route.js')"` apos build local nao falha.
- Smoke local: `curl -X POST http://localhost:3000/api/auth/signin/credentials -d 'email=...&password=...'` retorna 302 ou JSON conforme contrato Auth.js.
- Bundle analyser (`ANALYZE=true npm run build`) confirma que middleware bundle NAO contem `bcryptjs` (tree-shake limpo via `auth.config.ts` edge-safe).

## Criterios de aceite

- AC-001: split config criado (`auth.config.ts` edge-safe + `auth.ts` Node).
- AC-002: route handler exporta GET/POST com `runtime = 'nodejs'`.
- AC-003: middleware decide via cookie presence; fallback Supabase preservado atras de flag.
- AC-004: env vars adicionadas em `.env.example` + Railway (apos confirmacao).
- AC-005: bundle Edge limpo (sem bcryptjs no middleware).

## Restricoes locais

- `auth.config.ts` PROIBIDO importar `bcryptjs`, Prisma client, ou qualquer modulo Node-only (preserva edge-safety do middleware).
- `auth.ts` PROIBIDO ser importado direta ou indiretamente pelo `middleware.ts` (quebraria edge bundle).
- Session strategy fixa em `"jwt"` (Credentials provider em v5 beta nao persiste rows em `Session`; database strategy faria `session` callback receber `null`).
- `trustHost: true` no `authConfig` E variavel `AUTH_TRUST_HOST=true` no Railway. Ausencia = `UntrustedHost` silencioso em prod.
