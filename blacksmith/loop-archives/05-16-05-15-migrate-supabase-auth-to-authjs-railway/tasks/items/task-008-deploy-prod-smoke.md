---
description: Task 008 - TASK-7 Deploy prod + migrate + seed + smoke E2E + lista final dos 9 usuarios
model: opus
effort: high
scope: project
task_type: task
mode_support:
- write
---

# Task 008 - TASK-7: Deploy prod + migrate + seed + smoke E2E + lista final

Origem: `source.md` linhas 198-219 (Item 7 - TASK-7). Comandos de verificacao em prod: source.md Apendice B.

## Contexto

Aplicar Onda 1 em producao com paradas de confirmacao humana antes de `prisma migrate deploy` E antes do seed. Validar via curl + Playwright que 5 personas-chave logam via Auth.js path puro (sem fallback Supabase no Sentry).

## Acoes (cada etapa exige confirmacao humana explicita antes da execucao)

1. Merge para `main` (commit unico ou serie atomica) com TASKS 1-6 aplicadas e CI verde.
2. Confirmar env vars no Railway service `web`: `AUTH_SECRET`, `AUTH_TRUST_HOST=true`, `FEATURE_AUTH_SUPABASE_FALLBACK=true`. Validar:
   ```bash
   railway variables --service web | grep -E '^(AUTH_|FEATURE_)'
   ```
3. Deploy automatico via Railway (push para `main` dispara). Aguardar build verde.
4. **CONFIRMACAO HUMANA** antes de:
   ```bash
   railway run --service web -- npx prisma migrate deploy
   ```
   Validar output: "1 migration applied" + `\d "User"` mostra `passwordHash | text |  |`.
5. **CONFIRMACAO HUMANA** antes de:
   ```bash
   railway run --service web -- node --experimental-strip-types scripts/seed-prod-test-users.ts
   ```
   Validar output: 9 rows upserted.
6. Smoke prod (5 personas):
   ```bash
   curl -i -X POST https://www.foot-stock.com.br/api/v1/auth/login \
     -H 'Content-Type: application/json' \
     -d '{"email":"superadmin@foot-stock.test","password":"FootStock@Dev2026!"}'
   ```
   Esperado: 200 + cookie `__Secure-authjs.session-token`. Idem para `craque@`, `jogador@`, `lenda@`, `clube-parceiro@`. Playwright headless local apontando para prod: 5 smoke tests (superadmin -> `/admin`, craque -> `/mercado`, jogador -> `/mercado`, lenda -> `/mercado`, clube-parceiro -> `/club`).
7. Confirmar via Railway logs Sentry breadcrumbs: cada login emite `path: 'authjs'` (puro, sem fallback Supabase - `passwordHash` ja semeado).
8. Postar no thread a lista final dos 9 usuarios com `(email, role/plano, club opcional, path do login bem-sucedido)`.

## Evidencia esperada

- Log de `prisma migrate deploy` (mascarado).
- Log de `seed-prod-test-users.ts` mostrando 9 upserts.
- 5 responses 200 de smoke curl + screenshots Playwright.
- Sentry filter mostrando `path: 'authjs'` em todos os 5 logins.
- Mensagem no thread com a lista.

## Criterios de aceite

- AC-001: migrate M054 aplicada em prod com sucesso ("1 migration applied").
- AC-002: 9 users semeados em prod com `passwordHash != null`.
- AC-003: 5 smoke prod passa (200 + cookie correto + redirect correto).
- AC-004: todos os 5 logins via Auth.js path puro (`path: 'authjs'` no Sentry).
- AC-005: lista final postada no thread.

## Restricoes locais

- `DIRECT_URL_PROD` (porta 5432, session pooler) para migrate; NAO usar pgbouncer 6543 (advisory locks falham em transaction mode).
- Mascarar URLs, tokens e session ids em qualquer log/output (`{first10}***{last4}`).
- Confirmacao humana antes de migrate E antes de seed (duas paradas separadas; nao agrupar).
- Em caso de falha do smoke 5/5: rollback via `git revert <sha>` (NAO `git reset --hard`) + `npx prisma migrate resolve --rolled-back M054-add-password-hash`.
- NUNCA executar `FEATURE_AUTH_SUPABASE_FALLBACK=false` nesta TASK (kill switch fica para Onda 2 apos coverage 100%).
- Trunk-based: PROIBIDO criar feature branch para o deploy. Tudo em `main`.
