# Deploy de producao — fix `real_name` backfill (2026-05-22)

Runbook canonico para aplicar em producao a correcao do bug onde a tela de
selecao de clube no cadastro exibe nome ficticio em vez do nome real.

## Mudancas inclusas neste deploy

| Categoria | Item |
|-----------|------|
| Migration | `20260522120000_M056-backfill-asset-real-name` — backfill atomico de `assets.real_name` para 40 tickers canonicos |
| Migration | `20260522121500_M053-add-asset-players-coach` — conversao do flat `M053-add-asset-players-coach.sql` em pasta timestamped, idempotente via `ADD COLUMN IF NOT EXISTS` |
| Migration (piggyback) | `20260420154609_M053-add-additional-rss-feeds`, `20260510021114_add_authjs_tables`, `20260516155448_M054-add-password-hash`, `20260516232952_M055-plan-type-nullable-for-staff` — caso ainda nao aplicadas |
| Infra | `Dockerfile`: copia `prisma/`, `prisma.config.js`, `node_modules/prisma`, `node_modules/@prisma/*` para o runner |
| Infra | `railway.toml`: `[deploy].preDeployCommand = node ./node_modules/prisma/build/index.js migrate deploy` |
| Infra | `prisma.config.ts` -> `prisma.config.js` (CommonJS, evita TS loader no runner) |
| App | `clubs.ts` server-only via guard `typeof window`; split em `clubs-public.ts` para client |
| App | Imports cliente migrados (`profile-info.tsx`, `NewsForm.tsx`, `NewsInjector.tsx`, `admin/noticias/page.tsx`, `tickers.ts`) |

## 1. Pre-deploy — preflight de producao

**Obrigatorio antes do primeiro deploy.** Conecta no Postgres de prod (read-only
ok) e roda:

```bash
psql "$PROD_DATABASE_URL" -f scripts/preflight-prod-migrations.sql
```

### Criterios SAFE_TO_DEPLOY

| Check | Valor esperado | Acao se diferente |
|-------|----------------|-------------------|
| `migration_baseline_ok` | `t` | Se `f`, prod nunca rodou `prisma migrate deploy`. Precisa baseline manual (ver §1.1). |
| `pending_or_failed_count` | `0` | Se `> 0`, ha migrations stuck. Limpar com `DELETE FROM _prisma_migrations WHERE finished_at IS NULL` (revisar antes!). |
| `canonical_missing_count` | `0` | Se `> 0`, M056 nao popula esses (o seed nao roda em prod). Inserir manualmente OU aceitar fallback. |
| `canonical_null_real_name` | `<= 40` | M056 vai popular todos. Apos deploy esperado = 0. |
| `legacy_count` | qualquer | Informativo. Legados manterao real_name como estiver. |
| `players_column_exists` | `t` ou `f` | Se `f`, M053-new vai criar. Se `t`, ja foi aplicado manualmente, M053-new e no-op. |
| `staff_with_null_plan_type` | `0` | Se `> 0`, codigo antigo pode quebrar apos M055. Auditar antes. |

### 1.1 Baseline manual (so se `migration_baseline_ok = f`)

Se prod foi populada com SQL manual e nunca passou por `prisma migrate deploy`,
o `_prisma_migrations` nao tem entrada para `20260420155654_init`. Solucao:

```bash
# DENTRO do container Railway (ou via Railway CLI shell):
node ./node_modules/prisma/build/index.js migrate resolve --applied 20260420155654_init
# Repetir para cada migration timestamped historica que ja esteja "aplicada" de facto:
node ./node_modules/prisma/build/index.js migrate resolve --applied 20260420154609_M053-add-additional-rss-feeds
node ./node_modules/prisma/build/index.js migrate resolve --applied 20260510021114_add_authjs_tables
node ./node_modules/prisma/build/index.js migrate resolve --applied 20260516155448_M054-add-password-hash
node ./node_modules/prisma/build/index.js migrate resolve --applied 20260516232952_M055-plan-type-nullable-for-staff
```

Depois rodar `migrate deploy` aplica apenas M056 e M053-new.

## 2. Deploy

```bash
git add -A
git commit -m "fix(assets): backfill real_name + Prisma 7 prod deploy wiring"
git push origin main
```

Railway aciona build do Dockerfile, depois:

1. **preDeployCommand** roda `prisma migrate deploy` em container one-shot
2. Se preDeployCommand exit != 0 → Railway aborta o deploy, versao atual continua servindo (no downtime)
3. Se exit == 0 → switch para a nova versao, start `node server.js`

## 3. Verificacao pos-deploy

```bash
# 3.1 Confirmar migration registrada
psql "$PROD_DATABASE_URL" -c "SELECT migration_name, finished_at FROM _prisma_migrations WHERE migration_name LIKE '%M056%' OR migration_name LIKE '%M053-add-asset-players%';"

# 3.2 Confirmar real_name populado nos 40
psql "$PROD_DATABASE_URL" -c "SELECT COUNT(*) AS canonical_null FROM assets WHERE real_name IS NULL AND ticker IN ('URU3','POR3','TIM3','TRI3','GAL3','IMO3','COL3','GUE3','PEI3','CRZ3','REG3','FUR3','FOR3','BMP3','RAP3','RBB3','CUI3','VIT3','JUV3','MIR3','LEI3','NTL3','AVA3','GOI3','CHA3','PON3','GUA3','OPE3','SAM3','TIS3','LON3','FIG3','PAY3','CFC3','AME3','BSA3','CRB3','CSA3','ITA3','TON3');"
# Esperado: 0

# 3.3 Hit no endpoint publico (com cache CDN de 5min+10min stale — pode levar ate 15min para refletir)
curl -s "https://APP_URL/api/v1/assets/clubs-for-selection" | jq '.data[] | select(.ticker=="URU3") | {ticker, displayName, realName}'
# Esperado: realName = "Flamengo" (nao "Urubu da Gavea FC")
```

## 4. Rollback (forward-fix only)

Prisma nao tem rollback automatico de DDL. As migrations deste deploy sao
forward-compatible:

| Migration | Reversibilidade |
|-----------|-----------------|
| M056 (UPDATE real_name) | Se precisar reverter, `UPDATE assets SET real_name = NULL WHERE ticker IN (...)` — mas isso *recria* o bug |
| M053-new (ADD COLUMN IF NOT EXISTS players, coach_name) | Drop manual: `ALTER TABLE assets DROP COLUMN players, DROP COLUMN coach_name`. Mas o schema.prisma usa `players`, entao o codigo novo quebra sem a coluna |
| M055 (plan_type NULL) | `UPDATE users SET plan_type='JOGADOR' WHERE plan_type IS NULL` para invariante. Coluna nao reverte para NOT NULL trivialmente |

**Politica recomendada:** se o app crashar pos-deploy, faca rollback do **container** via Railway UI (volta para imagem anterior). O DB permanece migrado — codigo antigo lida bem com M053 (colunas novas opcionais para ele) e M056 (real_name agora populado).

**Cenario perigoso:** crash do app antes de health check OK. Railway pode entrar em loop de retry. Cap = 5 retries (`restartPolicyMaxRetries`). Apos isso o deploy fica failed e operador precisa decidir.

## 5. Follow-ups conhecidos (post-deploy)

- **CDN cache do `/clubs-for-selection`:** 5min `s-maxage` + 10min `stale-while-revalidate` = ate 15min de stale apos backfill. Aceitavel para janela de cadastro. Se urgente, purgar manualmente (Cloudflare API).
- **Tamanho da imagem Docker:** +80MB do prisma CLI no runner. Otimizacao P2: drop `@prisma/dev` e `@prisma/studio-core` (so usados por `prisma studio`/`prisma dev`). Nao bloqueia deploy.
- **Audit de bundle leak:** apos `npm run build`, grep `.next/static/chunks/*.js` por nomes reais — confirmado em 2026-05-22 que nao ha leak da mapa `REAL_NAMES`. Reauditar se algum Server Component novo importar de `@/lib/constants/clubs`.
- **M053 flat antigo:** `prisma/migrations/M053-add-asset-players-coach.sql` ainda existe como flat .sql. Removivel apos confirmar que prod aplicou o timestamped. Manter por ora para evitar surpresa em outros ambientes.
- **Lint guard:** adicionar `no-restricted-imports` no eslint config impedindo `@/lib/constants/clubs` em arquivos com `'use client'`. Impede regressao futura do bundle leak.

## 6. Pessoas / contatos

- DBA prod: (preencher)
- On-call: (preencher)
- Janela preferida: fora de pico (madrugada BRT)
