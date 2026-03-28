# Prisma Migration Guide — Foot Stock

**Projeto:** Foot Stock
**ORM:** Prisma
**Database:** PostgreSQL via Supabase
**Schema:** `prisma/schema.prisma`
**Gerado por:** `/db-migration-create` — 2026-03-28

---

## 1. Pré-requisitos

```bash
# Instalar dependências do projeto (após criar o Next.js app)
npm install prisma @prisma/client

# Configurar variáveis de ambiente (ver seção 2)
cp .env.example .env.local
```

---

## 2. Variáveis de Ambiente

Adicionar ao `.env` (desenvolvimento) e ao painel do Supabase/Vercel (produção):

```env
# Supabase — Connection string via pgbouncer (pooled)
# Formato: postgresql://[user]:[password]@[host]:[port]/[database]?pgbouncer=true
DATABASE_URL="postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true"

# Supabase — Connection string direta (sem pool) — OBRIGATÓRIA para migrations
DIRECT_URL="postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres"
```

> Ambas as URLs estão no painel Supabase em: **Settings → Database → Connection string**

---

## 3. Executar a Migration (Desenvolvimento)

```bash
cd output/workspace/foot-stock   # ou raiz do projeto Next.js

# Gera a migration inicial e aplica no banco de desenvolvimento
npx prisma migrate dev --name init_foot_stock_schema

# Após a migration, aplicar os partial indexes manualmente (ver seção 4)

# Verificar o schema gerado no banco
npx prisma studio
```

---

## 4. Partial Indexes (SQL Raw — pós-migration)

O Prisma não suporta partial indexes nativamente. Após `prisma migrate dev`, executar
o SQL abaixo no **Supabase SQL Editor** ou criar uma migration manual.

### Opção A: Supabase SQL Editor (recomendado para desenvolvimento)

```sql
-- users: apenas admins (adminRole IS NOT NULL)
DROP INDEX IF EXISTS idx_users_admin_role;
CREATE INDEX idx_users_admin_role ON users("adminRole")
    WHERE "adminRole" IS NOT NULL;

-- users: apenas afiliados (userType != 'NORMAL')
DROP INDEX IF EXISTS idx_users_user_type;
CREATE INDEX idx_users_user_type ON users("userType")
    WHERE "userType" != 'NORMAL';

-- users: apenas usuários com código de referral
DROP INDEX IF EXISTS idx_users_referred_by;
CREATE INDEX idx_users_referred_by ON users("referredByCode")
    WHERE "referredByCode" IS NOT NULL;

-- orders: apenas ordens pendentes agendadas
DROP INDEX IF EXISTS idx_orders_pending_scheduled;
CREATE INDEX idx_orders_pending_scheduled ON orders(status, "scheduledAt")
    WHERE status = 'PENDING';

-- positions: apenas posições alavancadas (Lenda)
CREATE INDEX IF NOT EXISTS idx_positions_leverage ON positions("userId")
    WHERE "leverageMultiplier" > 1.0;

-- subscriptions: apenas assinaturas ativas (cron de expiração)
DROP INDEX IF EXISTS idx_sub_expires;
CREATE INDEX idx_sub_expires ON subscriptions("expiresAt")
    WHERE status = 'ACTIVE';

-- subscriptions: bônus pendentes de crédito
DROP INDEX IF EXISTS idx_sub_bonus_pending;
CREATE INDEX idx_sub_bonus_pending ON subscriptions("bonusScheduledAt")
    WHERE "bonusCreditedAt" IS NULL AND "bonusAmount" IS NOT NULL;

-- notifications: apenas não lidas (contador + listagem)
DROP INDEX IF EXISTS idx_notifications_user_unread;
CREATE INDEX idx_notifications_user_unread ON notifications("userId", read)
    WHERE read = FALSE;

-- affiliate_transactions: apenas pendentes de processamento
DROP INDEX IF EXISTS idx_affiliate_tx_pending;
CREATE INDEX idx_affiliate_tx_pending ON affiliate_transactions(status)
    WHERE status = 'PENDING';
```

### Opção B: Migration manual do Prisma (recomendado para staging/produção)

```bash
# Criar migration vazia
npx prisma migrate dev --create-only --name add_partial_indexes

# Editar o arquivo gerado em prisma/migrations/YYYYMMDDHHMMSS_add_partial_indexes/migration.sql
# Colar o SQL da Opção A (sem os DROP INDEX IF EXISTS)

# Aplicar
npx prisma migrate dev
```

---

## 5. Aplicar em Staging

```bash
# Aplicar migrations sem gerar novos arquivos
npx prisma migrate deploy

# Aplicar partial indexes no Supabase SQL Editor de staging
# (usar o SQL da seção 4)

# Validar schema
npx prisma db pull --force    # compara schema local vs banco
```

---

## 6. Aplicar em Produção

**OBRIGATÓRIO antes do deploy:**

1. Fazer backup do banco de produção (Supabase → Database → Backups)
2. Aplicar migrations em staging e validar
3. Durante janela de baixo tráfego (preferencialmente madrugada):

```bash
# Aplicar migrations de produção
DATABASE_URL="$PROD_DIRECT_URL" npx prisma migrate deploy

# Aplicar partial indexes no Supabase SQL Editor de produção
```

4. Monitorar logs por 15 minutos após a migration

---

## 7. Rollback

Prisma não tem rollback automático. O procedimento é:

```bash
# 1. Identificar a migration a reverter
npx prisma migrate status

# 2. Reverter via SQL manual no Supabase SQL Editor:
#    DROP TABLE [tabela] CASCADE;
#    (na ordem inversa da criação — ver seção 8)

# 3. Marcar a migration como revertida no histórico Prisma:
npx prisma migrate resolve --rolled-back [migration_name]

# 4. Corrigir o schema.prisma e criar nova migration corretiva
```

---

## 8. Ordem de Criação (dependências de FK)

Execute na seguinte ordem para evitar violações de FK:

| # | Tabela | Depende de |
|---|--------|------------|
| 1 | `users` | — |
| 2 | `assets` | — |
| 3 | `sponsors` | — |
| 4 | `orders` | users |
| 5 | `positions` | users |
| 6 | `transactions` | users, orders |
| 7 | `price_history` | — (sem FK) |
| 8 | `subscriptions` | users |
| 9 | `payments` | subscriptions |
| 10 | `news` | — (sem FK) |
| 11 | `leagues` | sponsors |
| 12 | `league_members` | leagues, users |
| 13 | `forum_posts` | users |
| 14 | `notifications` | users |
| 15 | `consents` | users |
| 16 | `data_access_logs` | users |
| 17 | `admin_market_actions` | users |
| 18 | `affiliate_codes` | users |
| 19 | `affiliate_transactions` | affiliate_codes, users, subscriptions |
| 20 | `push_subscriptions` | users |

Para rollback: ordem **inversa** (20 → 1).

---

## 9. Seed de Dados

Após migrations aplicadas, executar:

```bash
npx prisma db seed
```

> Seed dos 40 ativos (20 Série A + 20 Série B) gerado por `/seed-data-create`.
> Arquivo: `prisma/seed.ts`

---

## 10. Notas de Design

### ticker sem FK constraint

Os campos `ticker` em `orders`, `positions`, `transactions`, `price_history`,
`news` e `forum_posts` NÃO têm FK constraint para `assets.ticker`. Isso é
**intencional**: o Motor de Mercado (Railway) atualiza esses campos a altíssima
frequência (tick 2s) e FK constraints causariam lock excessivo. A integridade
é garantida na camada de aplicação (validação no OrderService).

### Campos de alavancagem em positions

Os campos `leverageMultiplier`, `leverageAmount`, `dailyInterestRate` e
`interestAccrued` não aparecem no snippet DDL do LLD (v1.2), mas estão
presentes na tabela de colunas e referenciados no index `idx_positions_leverage`.
Foram incluídos no schema Prisma conforme o design completo do LLD.

### Supabase RLS

Row-Level Security (RLS) deve ser configurado no Supabase SQL Editor após
as migrations (migration M019 do plano do LLD). O schema Prisma não define RLS —
isso é responsabilidade do Supabase.

### Otimistic Lock (version)

Os campos `version` em `users`, `orders` e `positions` implementam lock
otimista. A camada de repositório deve incrementar `version` em cada UPDATE
e lançar `ConflictException` se `version` não corresponder ao esperado.

---

## 11. Comandos Úteis

```bash
# Verificar status das migrations
npx prisma migrate status

# Resetar banco de desenvolvimento (DESTRUTIVO — apenas dev)
npx prisma migrate reset

# Gerar Prisma Client após alterações no schema
npx prisma generate

# Abrir Prisma Studio (GUI do banco)
npx prisma studio

# Validar schema sem aplicar
npx prisma validate

# Formatar schema
npx prisma format
```

---

## 12. Checklist Pré-Deploy

- [ ] `npx prisma migrate deploy` executado em staging sem erros
- [ ] Partial indexes aplicados em staging (seção 4)
- [ ] `npx prisma db pull` confirma schema igual ao local
- [ ] Seed de assets executado e validado (40 registros em `assets`)
- [ ] Backup do banco de produção realizado (Supabase Backups)
- [ ] Partial indexes documentados em runbook de operações
- [ ] RLS policies configuradas no Supabase (M019)
- [ ] Variáveis `DATABASE_URL` e `DIRECT_URL` configuradas em produção
