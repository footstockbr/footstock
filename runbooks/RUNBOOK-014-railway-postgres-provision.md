# Runbook 014 — Provisionar Railway Postgres

> **Tipo:** RUNBOOK (não executado pela IA — requer CLI Railway e conta Pro)  
> **Criado:** 2026-05-06  
> **Pré-requisito:** Conta Railway Pro ativa, CLI `railway` instalado (`npm i -g @railway/cli`), projeto `foot-stock` criado no dashboard.

---

## 1. Pré-condições

- [ ] Conta Railway Pro ativa e faturamento configurado.
- [ ] CLI Railway logado: `railway login`
- [ ] Projeto `foot-stock` selecionado: `railway link` (ou criado via dashboard).
- [ ] Acesso ao banco Supabase atual (para comparar versão e extensões).

---

## 2. Execução

### 2.1 Adicionar plugin PostgreSQL

```bash
# No diretório raiz do projeto (onde está o .git)
railway add --plugin postgresql
```

> O Railway provisionará automaticamente um serviço `postgres` com PG 16 (paridade com Supabase).

### 2.2 Obter URLs de conexão

```bash
# URL interna (uso entre serviços Railway — recomendado para motor/web)
railway variables --service postgres

# Anotar os seguintes valores:
#   - POSTGRES_URL    (interna: postgres.railway.internal)
#   - DATABASE_URL    (externa/proxy — usar apenas para pg_dump/pg_restore local)
```

### 2.3 Configurar parâmetros do PostgreSQL

Via dashboard Railway (Settings do serviço postgres):

| Parâmetro | Valor | Motivo |
|-----------|-------|--------|
| `shared_buffers` | default (~25% RAM) | Railway 1 GB RAM → ~256 MB. Aceitável para fase inicial. |
| `max_connections` | default (100) | Prisma connection pool default 5–10. |
| `pg_stat_statements` | ON | Para futura análise de queries lentas. |

> **Nota:** Não alterar `fsync` ou `synchronous_commit` em produção sem testes de carga.

---

## 3. Validação

### 3.1 Conectividade

```bash
# Testar conexão interna (de outro serviço Railway)
railway run --service motor psql $POSTGRES_URL -c "SELECT version();"
```

### 3.2 Extensões necessárias

```bash
psql $POSTGRES_URL -c '\dx'
```

Esperado: `pgcrypto` e `uuid-ossp` instalados (Prisma requer para `@db.Uuid`).

Se ausentes:

```bash
psql $POSTGRES_URL -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
psql $POSTGRES_URL -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";"
```

### 3.3 Comparar com Supabase

```bash
# Listar extensões no Supabase atual
psql $SUPABASE_URL -c '\dx'

# Verificar se há diferenças
```

> Registrar diferenças em `RUNBOOK-016` (DB cutover).

---

## 4. Rollback

```bash
# Identificar ID do serviço postgres
railway service list

# Remover (DESTRUTIVO — perde todos os dados)
railway remove <postgres-service-id>
```

> **Aviso:** Após o cutover (item 016), rollback requer restore de backup Supabase.  
> Manter snapshot Supabase Pro ativo por **30 dias** pós-cutover.

---

## 5. Pós-provisionamento

1. Atualizar `DATABASE_URL` nos env vars dos serviços `motor` e `web` (item 017).
2. Executar `prisma migrate deploy` no serviço motor para criar schema.
3. Registrar URL interna e externa em `.env.deploy` (local seguro, não commitado).

---

## Referências

- `STACK-COST-ANALYSIS.md` §3 + §5 S2 dia 1–2
- Prisma Docs: https://www.prisma.io/docs/orm/reference/connection-urls
- Railway Postgres: https://docs.railway.app/databases/postgresql
