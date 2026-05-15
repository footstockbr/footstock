# Runbook 022 — Prisma Baseline (consolidação canonical tree + M000)

> **Tipo:** RUNBOOK — REQUER JANELA DE MANUTENÇÃO LEVE (deploy bloqueado durante a operação)
> **Criticidade:** ALTA
> **Criado:** 2026-05-10
> **Janela esperada:** 30–45 minutos
> **Responsável:** DevOps / Backend lead
> **Origem:** TASK-P0-05 (RAILWAY-MIGRATION-TASKLIST.md), referência cruzada com ADR-006

---

## 0. Contexto

O Railway Postgres recebeu o estado atual via cutover Supabase→Railway (ver RUNBOOK-016) **sem** popular `_prisma_migrations`. Existem duas árvores Prisma divergentes no monorepo (`prisma/` na raiz e `footstock-next/prisma/`) e ~40 `.sql` legacy soltos. Sem baseline, qualquer `prisma migrate deploy` futuro tenta re-aplicar migrations contra o schema atual e quebra com erro de objeto duplicado.

Este runbook consolida `footstock-next/prisma/` como **canonical** e cria a migration `0_baseline_consolidated` representando o estado atual de produção.

---

## 1. Pré-condições

- [ ] Snapshot do Railway PG concluído (RUNBOOK-016 §3 ou TASK-P0-09).
- [ ] `pgcrypto` instalado no Railway PG (RUNBOOK pgcrypto / TASK-P0-03).
- [ ] `psql`, `pg_dump`, `prisma` v6+ disponíveis localmente.
- [ ] DATABASE_URL e DIRECT_URL apontam para Railway PG (interno em runtime, externo `tramway.proxy.rlwy.net` para baseline).
- [ ] Branch dedicada criada (`chore/p0-05-prisma-baseline`).
- [ ] Auto-deploy de web e motor desabilitado durante a operação (`serviceInstanceAutoDeployUpdate enabled=false`).
- [ ] Decisão registrada: canonical tree = `footstock-next/prisma/` (auq-interview 2026-05-09).

---

## 2. Arquivar histórico legacy

```bash
cd output/workspace/foot-stock

# 2.1 Arquivar tree raiz
git mv prisma legacy-migrations/2026-05-09-root-prisma

# 2.2 Arquivar 40 .sql legacy + dirs antigos do footstock-next
mkdir -p legacy-migrations/2026-05-09-footstock-next-prisma
git mv footstock-next/prisma/migrations/* \
  legacy-migrations/2026-05-09-footstock-next-prisma/
mkdir -p footstock-next/prisma/migrations  # manter dir vazio
```

> **Não deletar.** Arquivar permite recuperação se o baseline divergir do esperado.

---

## 3. Gerar baseline M000

```bash
cd output/workspace/foot-stock/footstock-next

# 3.1 Capturar URL externa Railway PG
PG_URL='<DATABASE_URL_PUBLIC do Railway>'

# 3.2 Dump schema-only excluindo schemas do Supabase legacy
mkdir -p prisma/migrations/0_baseline_consolidated
pg_dump "$PG_URL" --schema-only --no-owner --no-acl \
  --exclude-schema=auth \
  --exclude-schema=storage \
  --exclude-schema=realtime \
  --exclude-schema=graphql \
  --exclude-schema=graphql_public \
  --exclude-schema=supabase_functions \
  > prisma/migrations/0_baseline_consolidated/migration.sql

# 3.3 Inspecionar e ajustar:
#  - Trocar `CREATE EXTENSION` por `CREATE EXTENSION IF NOT EXISTS` (pgcrypto já existe).
#  - Remover `ALTER OWNER` residuais (cobertos por --no-owner; checagem manual).
#  - Validar que objetos não-aplicáveis (jobs/triggers Supabase) não vieram.
```

---

## 4. Marcar baseline como applied + validar drift

```bash
cd footstock-next

# 4.1 Registrar baseline em _prisma_migrations sem reaplicar
DATABASE_URL="$PG_URL" npx prisma migrate resolve --applied 0_baseline_consolidated

# 4.2 Confirmar zero pending
DATABASE_URL="$PG_URL" npx prisma migrate status
# esperado: "Database schema is up to date"

# 4.3 Detectar drift entre schema.prisma e DB real
DATABASE_URL="$PG_URL" npx prisma db pull --print > /tmp/db-pull.prisma
diff -u prisma/schema.prisma /tmp/db-pull.prisma > /tmp/drift.diff || true

# Se diff != vazio:
#   Em DB de staging (NÃO produção):
#     prisma migrate dev --name align_drift
#   Revisar SQL gerada antes de aplicar em prod.
```

---

## 5. Validar build + type-check

```bash
cd footstock-next
npx prisma generate
npx tsc --noEmit
npm run build
```

Critério: zero erros TS, build SUCCESS, Prisma Client v7+ emitido.

---

## 6. Publicar ADR-006

ADR documentando:
1. Canonical tree = `footstock-next/prisma/`
2. Motor consome via `prisma generate` apontando para o mesmo schema (sem migrations próprias)
3. Histórico legacy arquivado em `legacy-migrations/{YYYY-MM-DD}-*/`
4. Política: novas migrations sempre via `prisma migrate dev` no `footstock-next/`

Salvar em `output/docs/foot-stock/adrs/ADR-006-prisma-canonical-tree.md`.

---

## 7. Critério de aceite

- [ ] `legacy-migrations/2026-05-09-root-prisma/` populado.
- [ ] `legacy-migrations/2026-05-09-footstock-next-prisma/` populado.
- [ ] `_prisma_migrations` table no Railway PG contém row `0_baseline_consolidated` com `applied_steps_count > 0` e `finished_at != NULL`.
- [ ] `prisma migrate status` retorna zero pending no `footstock-next/`.
- [ ] ADR-006 publicado.
- [ ] CI deploy.yml passa type-check (consequência indireta — sem drift, sem erros).

---

## 8. Rollback

```bash
# 8.1 Restaurar trees originais
git mv legacy-migrations/2026-05-09-root-prisma prisma
git mv legacy-migrations/2026-05-09-footstock-next-prisma/* \
  footstock-next/prisma/migrations/
rmdir legacy-migrations/2026-05-09-footstock-next-prisma

# 8.2 Limpar baseline registrado no DB
psql "$PG_URL" -c "DELETE FROM _prisma_migrations WHERE migration_name = '0_baseline_consolidated';"

# 8.3 Reverter commit
git revert HEAD --no-edit
```

> **Pós-rollback:** restaurar dump RUNBOOK-016 só é necessário se o passo 4 tiver corrompido tabelas — `migrate resolve` é metadata-only e não toca schema.

---

## 9. Pós-baseline

- Re-habilitar auto-deploy (`serviceInstanceAutoDeployUpdate enabled=true`) para web e motor.
- Próxima migration deve ser criada via `prisma migrate dev --name <descrição>` no `footstock-next/` e committada normalmente.
- **Não** rodar `prisma migrate deploy` em prod até confirmar via staging que o pipeline está saudável.

---

## 10. Referências

- TASK-P0-05 em `output/docs/foot-stock/RAILWAY-MIGRATION-TASKLIST.md:163`
- RUNBOOK-016 (cutover DB)
- ADR-005 (auth strategy — bloqueia NXAUTH-02 sem este baseline)
- ADR-006 (canonical Prisma tree — produzido por este runbook)
