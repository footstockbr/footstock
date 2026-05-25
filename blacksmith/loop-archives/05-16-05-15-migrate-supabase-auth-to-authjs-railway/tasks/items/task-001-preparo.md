---
description: Task 001 preparo - carregar contexto do loop migrate-supabase-auth-to-authjs-railway antes da iteracao
model: opus
effort: standard
scope: task
task_type: task
mode_support:
- check
---

# Task 001 - Preparo

Carregar contexto antes da iteracao do loop.

## Leituras obrigatorias

- `output/workspace/foot-stock/blacksmith/loop-archives/05-16-05-15-migrate-supabase-auth-to-authjs-railway/source.md` - fonte canonica da tasklist (623 linhas; Onda 1 da migracao Supabase Auth -> Auth.js v5 + Railway Postgres).
- `output/workspace/foot-stock/blacksmith/loop-archives/05-16-05-15-migrate-supabase-auth-to-authjs-railway/_LOOP-CONFIG.json` - estado canonico do loop.
- `CLAUDE.md` Tier 1 - convencoes do SystemForge (Zero Orfaos, Zero Silencio, trunk-based always main, mascaramento de credenciais).
- `.claude/commands/loop.md` + `.claude/commands/loop/iteraction/{create-task,review-created-task,execute-task,review-executed-task,review-executed-loop}.md` - sub-pipeline da iteracao.
- `.claude/commands/execute-task.md` - PRE-0 workspace scan + scaffold-check + BDD + AC-XXX (obrigatorio antes de qualquer write).
- `footstock-next/prisma/schema.prisma` (linhas 240-350) - schema atual de `User`, `Account`, `Session`, `VerificationToken`; confirmar que `passwordHash` AINDA NAO existe no `User`.
- `footstock-next/src/lib/auth.ts` - wrapper NXAUTH-04A existente (`detectIdentityConflict`, `clearDualCookies`, `handleIdentityConflict`, `getAuthUser`, `serializeUser`, `hasPlan`).
- `footstock-next/src/lib/authjs-adapter.ts` - PrismaAdapter envelopado com guard auto-create.
- Catalogo de 13 callsites Supabase Auth listado no source.md item 7 (mapear por commit antes da TASK-3).

## Restricoes globais

- Idioma pt-BR; sem emojis; sem travessao.
- Regras Zero (Orfaos, Silencio, Estados Indefinidos, Fluxos Incompletos, Assumido, ECU).
- Trunk-based / always main: PROIBIDO `git checkout -b`, `git switch -c`. Rollback via `git revert <sha>` ou GitHub UI.
- Mascarar tokens, senhas, hashes e session tokens em qualquer log/output (`{first10}***{last4}` ou `***`).
- Defesa anti-timing ativa no PASSO da TASK-3 (dummy bcrypt para user-not-found).
- Defesa race-condition no backfill via `updateMany` com `where: passwordHash: null`.
- `prisma migrate deploy` + seed em producao exigem confirmacao humana explicita por etapa (uma para migrate, outra para seed).
- `DIRECT_URL_PROD` (porta 5432, session pooler) para migrate em prod; NAO usar pgbouncer 6543.
- bcryptjs com cost factor 12; sem `bcrypt` nativo; sem Edge runtime nas rotas que chamam `authorize()`.

## Saida esperada

Confirmacao de que inputs estao disponiveis e contexto esta carregado. Sem mudancas em codigo nem em arquivos do workspace. Imprimir um sumario curto cobrindo:
- numero de callsites Supabase Auth confirmados (esperado: 13);
- presenca atual de `passwordHash` no `User` (esperado: ausente);
- env vars Railway alvo Onda 1 (`AUTH_SECRET`, `AUTH_TRUST_HOST=true`, `FEATURE_AUTH_SUPABASE_FALLBACK=true`).
