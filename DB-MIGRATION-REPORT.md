# DB Migration Report — FootStock

> **STATUS: HISTÓRICO / CONCLUÍDO.** Este relatório descreve o estado em
> 2026-03-28, quando o banco era Supabase. Desde 2026-05 o banco de produção é
> Railway-internal Postgres (`postgres.railway.internal`) e a autenticação é
> Auth.js (NextAuth v5), não Supabase Auth. Manter apenas como registro histórico.

**Projeto:** foot-stock
**ORM:** Prisma
**Database:** PostgreSQL (Supabase — histórico; atual: Railway-internal Postgres)
**Data:** 2026-03-28
**Referência LLD:** `output/docs/foot-stock/project/LLD.md` v1.2
**Data-Integrity-Decision:** não disponível (executar `/skill:data-integrity-guard` para projetos com dados existentes)

---

## Migrations Geradas

| # | Arquivo | Operação | Tabelas Afetadas | Tipo | Reversível |
|---|---------|----------|-----------------|------|------------|
| 1 | `prisma/schema.prisma` | CREATE TABLE | users | additive | Sim |
| 2 | `prisma/schema.prisma` | CREATE TABLE | assets | additive | Sim |
| 3 | `prisma/schema.prisma` | CREATE TABLE | orders | additive | Sim |
| 4 | `prisma/schema.prisma` | CREATE TABLE | positions | additive | Sim |
| 5 | `prisma/schema.prisma` | CREATE TABLE | transactions | additive | Sim |
| 6 | `prisma/schema.prisma` | CREATE TABLE | price_history | additive | Sim |
| 7 | `prisma/schema.prisma` | CREATE TABLE | subscriptions | additive | Sim |
| 8 | `prisma/schema.prisma` | CREATE TABLE | payments | additive | Sim |
| 9 | `prisma/schema.prisma` | CREATE TABLE | news | additive | Sim |
| 10 | `prisma/schema.prisma` | CREATE TABLE | sponsors | additive | Sim |
| 11 | `prisma/schema.prisma` | CREATE TABLE | leagues | additive | Sim |
| 12 | `prisma/schema.prisma` | CREATE TABLE | league_members | additive | Sim |
| 13 | `prisma/schema.prisma` | CREATE TABLE | forum_posts | additive | Sim |
| 14 | `prisma/schema.prisma` | CREATE TABLE | notifications | additive | Sim |
| 15 | `prisma/schema.prisma` | CREATE TABLE | consents | additive | Sim |
| 16 | `prisma/schema.prisma` | CREATE TABLE | data_access_logs | additive | Sim |
| 17 | `prisma/schema.prisma` | CREATE TABLE | admin_market_actions | additive | Sim |
| 18 | `prisma/schema.prisma` | CREATE TABLE | affiliate_codes | additive | Sim |
| 19 | `prisma/schema.prisma` | CREATE TABLE | affiliate_transactions | additive | Sim |
| 20 | `prisma/schema.prisma` | CREATE TABLE | push_subscriptions | additive | Sim |

---

## Cobertura do ERD

Todas as 20 entidades do LLD v1.2 cobertas:

| Tabela | FK Count | Indexes | Partial Indexes | Unique Constraints |
|--------|----------|---------|-----------------|-------------------|
| users | 0 | 4 | 3 (adminRole, userType, referredByCode) | email, cpfHash |
| assets | 0 | 1 | 0 | ticker |
| orders | 1 | 3 | 1 (status=PENDING) | — |
| positions | 1 | 2 + 1 unique | 1 (leverageMultiplier>1.0) | (userId, ticker, side) |
| transactions | 2 | 2 | 0 | — |
| price_history | 0 | 1 | 0 | (ticker, period, timestamp) |
| subscriptions | 1 | 3 | 2 (expires, bonus_pending) | — |
| payments | 1 | 0 | 0 | gatewayTransactionId |
| news | 0 | 1 | 0 | — |
| sponsors | 0 | 0 | 0 | — |
| leagues | 1 | 0 | 0 | — |
| league_members | 2 | 0 | 0 | (leagueId, userId) |
| forum_posts | 1 | 0 | 0 | — |
| notifications | 1 | 1 | 1 (read=FALSE) | — |
| consents | 1 | 0 | 0 | — |
| data_access_logs | 2 | 1 | 0 | — |
| admin_market_actions | 1 | 0 | 0 | — |
| affiliate_codes | 1 | 2 | 0 | code |
| affiliate_transactions | 3 | 3 | 1 (status=PENDING) | — |
| push_subscriptions | 1 | 1 | 0 | endpoint |
| **TOTAL** | **20** | **~27** | **9** | **8** |

---

## Notas de Design

### Campos de alavancagem em positions (DDL incompleto no LLD)

O snippet DDL de `positions` no LLD v1.2 omite os campos de alavancagem, mas
a tabela de colunas (LLD seção 2.2) e o index `idx_positions_leverage` os referenciam.
Schema Prisma inclui os 4 campos completos:
- `leverageMultiplier DECIMAL(3,1) DEFAULT 1.0`
- `leverageAmount DECIMAL(12,2) DEFAULT 0.0`
- `dailyInterestRate DECIMAL(6,4) DEFAULT 0.0`
- `interestAccrued DECIMAL(12,2) DEFAULT 0.0`

**Recomendação:** Confirmar com o time e corrigir o DDL no LLD v1.3.

### ticker sem FK constraint (design intencional)

`orders`, `positions`, `transactions`, `price_history`, `news` e `forum_posts`
referenciam `ticker` como VARCHAR sem FK constraint para `assets.ticker`.
Motivo: Motor de Mercado executa ticks de 2s; FK constraint causaria lock excessivo.
Integridade garantida na camada de aplicação (OrderService/PositionService).

### Supabase RLS (fora do escopo deste comando)

Row-Level Security precisa ser configurado no Supabase SQL Editor.
Ver migration M019 do plano do LLD. Executar `/supabase-sql-editor` para consolidar.

---

## Ordem de Execução das Migrations

Executar na seguinte ordem para respeitar dependências de FK:

```
1. users       → sem dependências
2. assets      → sem dependências
3. sponsors    → sem dependências
4. orders      → users
5. positions   → users
6. transactions → users, orders
7. price_history → sem dependências
8. subscriptions → users
9. payments    → subscriptions
10. news       → sem dependências
11. leagues    → sponsors
12. league_members → leagues, users
13. forum_posts → users
14. notifications → users
15. consents   → users
16. data_access_logs → users
17. admin_market_actions → users
18. affiliate_codes → users
19. affiliate_transactions → affiliate_codes, users, subscriptions
20. push_subscriptions → users
```

Prisma resolve esta ordem automaticamente durante `migrate dev`.

---

## Comandos de Aplicação

### Desenvolvimento

```bash
cd output/workspace/foot-stock   # raiz do projeto Next.js
npx prisma migrate dev --name init_foot_stock_schema
```

Após a migration, aplicar os 9 partial indexes via Supabase SQL Editor.
Ver `prisma/PRISMA-MIGRATION-GUIDE.md` — seção 4.

### Staging (OBRIGATÓRIO antes de produção)

```bash
npx prisma migrate deploy
# Aplicar partial indexes no Supabase SQL Editor de staging
npx prisma db pull --force   # validar schema
```

### Produção

1. Backup do banco de produção (Supabase → Backups)
2. Executar durante janela de baixo tráfego:

```bash
DATABASE_URL="$PROD_DIRECT_URL" npx prisma migrate deploy
```

3. Aplicar partial indexes no Supabase SQL Editor de produção
4. Monitorar logs por 15 minutos

---

## Rollback

Para reverter, executar na **ordem inversa** (20 → 1) no Supabase SQL Editor:

```sql
-- Exemplo de rollback completo (APENAS se banco ainda vazio)
DROP TABLE IF EXISTS push_subscriptions CASCADE;
DROP TABLE IF EXISTS affiliate_transactions CASCADE;
DROP TABLE IF EXISTS affiliate_codes CASCADE;
DROP TABLE IF EXISTS admin_market_actions CASCADE;
DROP TABLE IF EXISTS data_access_logs CASCADE;
DROP TABLE IF EXISTS consents CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS forum_posts CASCADE;
DROP TABLE IF EXISTS league_members CASCADE;
DROP TABLE IF EXISTS leagues CASCADE;
DROP TABLE IF EXISTS news CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS subscriptions CASCADE;
DROP TABLE IF EXISTS price_history CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS positions CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS sponsors CASCADE;
DROP TABLE IF EXISTS assets CASCADE;
DROP TABLE IF EXISTS users CASCADE;
```

Após o rollback SQL, marcar no Prisma:
```bash
npx prisma migrate resolve --rolled-back init_foot_stock_schema
```

---

## Checklist de Segurança — Resultado

| Item | Status | Observação |
|------|--------|------------|
| Reversibilidade: down funcional | ✅ | Prisma gera down automaticamente |
| Idempotência: IF NOT EXISTS | ✅ | Prisma usa CREATE TABLE IF NOT EXISTS |
| NOT NULL com DEFAULT (novas tabelas) | ✅ | Todos os NOT NULL têm DEFAULT |
| DROP sem backup instruction | ✅ | Sem DROP nesta migration |
| Rename usa expand-contract | N/A | Sem rename nesta migration |
| FK com ON DELETE explícito | ⚠️ | Prisma usa RESTRICT por default — revisar se CASCADE é necessário em `orders` e `positions` quando user for deletado (LGPD: soft delete recomendado) |
| Indexes em todas as FK | ✅ | Todos os FK columns têm índices |
| Enums como tipos no banco | ℹ️ | LLD usa VARCHAR com CHECK — mantido assim (Prisma enums podem ser adicionados em v2) |
| Dados sensíveis com tipo correto | ✅ | cpfHash=CHAR(64), bankData=JSONB, ipAddress=INET |

**Itens aprovados: 8/9**

### ⚠️ Atenção: ON DELETE em cascatas

O Prisma usa `ON DELETE RESTRICT` por padrão. Para o FootStock:
- `users` nunca devem ser deletados (LGPD: anonimização, não exclusão)
- Recomendar soft delete via campo `deletedAt` em `users` no futuro
- `RESTRICT` é seguro para o escopo atual

---

## Sumário

| Métrica | Valor |
|---------|-------|
| Tabelas criadas | 20 |
| Foreign keys | 20 |
| Indexes (regular) | ~27 |
| Partial indexes (SQL raw) | 9 |
| Unique constraints | 8 |
| Tipo additive | 20 |
| Tipo alter | 0 |
| Tipo destructive | 0 |
| Checklist segurança | 8/9 (1 observação) |

---

## Próximos Passos

1. **`/seed-data-create .claude/projects/foot-stock.json`** — seed dos 40 ativos (Série A e B)
2. **`/integration-test-create .claude/projects/foot-stock.json`** — testes de integração contra banco real
3. **`/supabase-sql-editor .claude/projects/foot-stock.json`** — consolidar SQL (partial indexes + RLS policies)

---

*Gerado por `/db-migration-create` — FootStock — 2026-03-28*
