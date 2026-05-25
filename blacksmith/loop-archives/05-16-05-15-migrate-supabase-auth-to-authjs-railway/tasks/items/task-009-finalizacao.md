---
description: Task 009 finalizacao - review consolidado, lista final dos 9 usuarios DEV, ONDA-2-BACKLOG.md
model: opus
effort: standard
scope: project
task_type: task
mode_support:
- write
---

# Task 009 - Finalizacao

Origem: `source.md` linhas 319-356 (Parte 4 - Review final) + Gates globais e Criterios de aceite globais.

## Validacoes globais

- `python3 ai-forge/scripts/generate-workflow-index.py --check` se o loop tocou em `.claude/commands/` (provavelmente NAO neste loop, mas confirmar antes de pular).
- Reler `PROGRESS.md`: todos os items devem estar `[x]` ou `[!]`. Items `[!]` exigem nota explicita no `_LOOP-LOG.md`.
- Verificar artefatos esperados conforme `_LOOP-CONFIG.json` -> `daily_loop.finalization` + Gates globais do source.md.
- Confirmar zero ocorrencia de `.env*` commitado, zero token/senha/hash em logs do PR, zero `--no-verify`/`--no-gpg-sign`/`git checkout -b`/`git switch -c` na historia.

## Verificacoes de producao (5 personas)

- `superadmin@foot-stock.test` -> 200 + redirect `/admin`.
- `admin@foot-stock.test` -> 200 + `/admin`.
- `craque@foot-stock.test` -> 200 + `/mercado`.
- `lenda@foot-stock.test` -> 200 + `/mercado`.
- `clube-parceiro@foot-stock.test` -> 200 + `/club`.

Validar via Sentry/logs que TODOS emitiram `path: 'authjs'` (sem fallback Supabase) - confirma que seed funcionou e backfill nao foi necessario para estes users.

## Comunicacao final

Imprimir bloco-resumo: nome do loop, items processados (DONE/FAILED/SKIPPED), paths principais gerados, proximos passos sugeridos. Postar mensagem no thread com a lista final dos 9 usuarios DEV (email + role + plano + clubId).

## Abertura do backlog Onda 2

Criar `output/wbs/foot-stock/micro-architecture/auth-migration/ONDA-2-BACKLOG.md` cobrindo as 10 tarefas restantes:
1. Register route (drop `auth.admin.createUser`, usar `signIn('credentials', ...)` apos `prisma.user.create`).
2. Reset-password (finalizar Auth.js Resend path, drop `exchangeCodeForSession`).
3. Forgot-password (apagar fallback Supabase apos janela de 30 dias com 100% backfill).
4. WebAuthn route (substituir `auth.admin.generateLink` por token-based recovery via Auth.js + `VerificationToken`).
5. Club auth login/forgot (mesma migracao do login principal).
6. Browser components (`inbox/page.tsx`, `NotificationBell.tsx`): trocar `supabase.auth.getUser` por `useSession` de `next-auth/react`.
7. API middleware dual (`app/api/middleware.ts`): unificar em Auth.js.
8. Drop deps `@supabase/supabase-js` + `@supabase/ssr` apos coverage 100%.
9. Plano de reset de senha para users legados que nunca logaram (notificacao por email + magic-link Auth.js Resend).
10. Remover flag `FEATURE_AUTH_SUPABASE_FALLBACK` e wrapper NXAUTH-04A apos Onda 2 (sem dual-cookie possivel).

## Saida esperada

- `_LOOP-LOG.md` consolidado com sumario por TASK.
- Mensagem no thread com lista dos 9 usuarios.
- `ONDA-2-BACKLOG.md` criado.
- Verdict final: APROVADO ou APROVADO_COM_AVISOS.
