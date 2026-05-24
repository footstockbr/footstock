# Runbook 016 — DB Cutover: Supabase → Railway Postgres ⚠️ CRÍTICO

> **STATUS: CONCLUÍDO (2026-05).** O cutover foi executado; o banco de produção
> é Railway-internal Postgres. Registro histórico do procedimento — não há mais
> Supabase para migrar.

> **Tipo:** RUNBOOK — REQUER JANELA DE MANUTENÇÃO  
> **Criticidade:** ALTA  
> **Criado:** 2026-05-06  
> **Janela esperada:** 30 minutos (15 dump + 10 restore + 5 validação)  
> **Responsável:** DevOps / DBA + Cliente (aprovação final)

---

## 0. Checklist pré-janela (24h antes)

- [ ] Snapshot Supabase Pro confirmado (Settings → Database → Backups).
- [ ] Items 014 e 015 concluídos (Railway Postgres e Redis provisionados).
- [ ] Item 017 pronto para aplicar (DATABASE_URL atualizado).
- [ ] Rollback script validado mentalmente (ver §9).
- [ ] TTL DNS Cloudflare reduzido para 60s (acelera propagação se necessário).

---

## 1. Pré-condições

- [ ] Railway Postgres provisionado e acessível (item 014).
- [ ] Railway Redis provisionado e acessível (item 015).
- [ ] `DATABASE_URL` do Railway Postgres anotado (interno + externo).
- [ ] `SUPABASE_URL` (DIRECT_URL) do banco atual anotado.
- [ ] `pg_dump` e `pg_restore` instalados localmente (PostgreSQL 16 client).
- [ ] Espaço em disco local ≥ 3x o tamanho do banco (dump + restore temporário + margem).

---

## 2. Pause — Parar escrita no banco

```bash
# 2.1 Parar o serviço motor (impede novos ticks e writes)
railway service stop motor

# 2.2 Desabilitar scheduler (evita jobs que escrevem no DB)
railway variables set MOTOR_SCHEDULER_ENABLED=false --service motor

# 2.3 (Opcional) Ativar modo read-only no Prisma — requer migration de emergência.
#     Se não implementado, aceitar pequena janela de inconsistência.
```

> **Objetivo:** Garantir que o dump capture um snapshot consistente.  
> **Risco:** Usuários ativos em sessões SSE perdem conexão. Mitigação: aceitável durante a janela — D-6 (sem usuários frontend ativos no momento do cutover).

---

## 3. Snapshot Supabase (backup de segurança)

```bash
# Criar dump custom do banco atual
pg_dump "$SUPABASE_URL" \
  --no-owner \
  --no-acl \
  --format=custom \
  --verbose \
  --file="footstock-cutover-$(date +%Y%m%d-%H%M%S).dump"
```

> **Nota:** Usar `--no-owner` e `--no-acl` porque o usuário Railway Postgres será diferente do Supabase.

---

## 4. Verificar tamanho do dump

```bash
ls -lh footstock-cutover-*.dump
```

| Cenário | Ação |
|---------|------|
| < 2 GB | Prosseguir direto |
| 2 GB – 10 GB | Validar disco ≥3x; usar --jobs=4 paralelo |
| > 10 GB | ABORTAR e particionar |

---

## 5. Restore no Railway Postgres

```bash
# Restaurar com paralelismo (4 jobs)
pg_restore \
  -d "$RAILWAY_POSTGRES_URL" \
  --no-owner \
  --no-acl \
  --jobs=4 \
  --verbose \
  footstock-cutover-*.dump
```

> **Erros comuns:**
> - `role "postgres" does not exist` → esperado, ignorar ( `--no-owner` resolve parcialmente).
> - `relation already exists` → abortar; banco não estava vazio.
> - `out of memory` → reduzir `--jobs=2` ou aumentar RAM do serviço Railway.

---

## 6. Validação pós-restore

### 6.1 Contagem de registros críticos

```bash
psql "$RAILWAY_POSTGRES_URL" -c "
SELECT
  (SELECT COUNT(*) FROM \"User\") as users,
  (SELECT COUNT(*) FROM \"Position\") as positions,
  (SELECT COUNT(*) FROM \"Order\") as orders,
  (SELECT COUNT(*) FROM \"Trade\") as trades,
  (SELECT COUNT(*) FROM \"PriceHistory\") as price_history;
"
```

### 6.2 Comparar com Supabase

```bash
psql "$SUPABASE_URL" -c "
SELECT
  (SELECT COUNT(*) FROM \"User\") as users,
  (SELECT COUNT(*) FROM \"Position\") as positions,
  (SELECT COUNT(*) FROM \"Order\") as orders,
  (SELECT COUNT(*) FROM \"Trade\") as trades,
  (SELECT COUNT(*) FROM \"PriceHistory\") as price_history;
"
```

| Tabela | Diff aceitável | Ação se exceder |
|--------|----------------|-----------------|
| User, Position, Order, Trade | < 0.1% | Normal (ticks em flight). Prosseguir. |
| PriceHistory | < 1% | Normal (ticks entre pause e dump). Prosseguir. |
| Qualquer tabela | > 5% | **ABORTAR**. Investigar perda de dados. |

### 6.3 Sanity check de schema

```bash
psql "$RAILWAY_POSTGRES_URL" -c "\dt"
# Verificar se todas as tabelas esperadas estão presentes.
```

---

## 7. Atualizar DATABASE_URL

```bash
# 7.1 Atualizar env var nos serviços Railway
railway variables set DATABASE_URL="$RAILWAY_POSTGRES_INTERNAL_URL" --service motor
railway variables set DATABASE_URL="$RAILWAY_POSTGRES_INTERNAL_URL" --service web

# 7.2 Atualizar .env.production e .env.staging no repo (placeholders)
#     (item 017 completa essa etapa de forma definitiva)
```

> **Dica:** Usar URL interna (`postgres.railway.internal`) para comunicação serviço-a-serviço. URL externa só para `pg_dump`/`pg_restore` local.

---

## 8. Resume — Retomar serviços

```bash
# 8.1 Re-habilitar scheduler
railway variables set MOTOR_SCHEDULER_ENABLED=true --service motor

# 8.2 Iniciar motor
railway service start motor

# 8.3 Verificar logs
railway logs --service motor
# Esperado: "[motor] Scheduler iniciado", "[motor] Liderança adquirida"
```

---

## 9. Smoke test

```bash
# 9.1 Criar usuário de teste via frontend
# 9.2 Fazer login e verificar dashboard
# 9.3 Colocar uma ordem de compra (verificar persistência no DB)
# 9.4 Verificar se gráfico de preço atualiza (SSE /stream/market)
# 9.5 Verificar notificações (SSE /stream/news)
```

> Se qualquer passo falhar: considerar rollback imediato (§10).

---

## 10. Hold rollback — Manter Supabase ativo

- [ ] Manter Supabase Pro ativo por **30 dias**.
- [ ] Marcar data de review: `2026-06-06`.
- [ ] Se tudo estiver estável até a data de review: cancelar Supabase Pro e remover runbook de rollback.
- [ ] Se problemas surgirem: reverter `DATABASE_URL` para Supabase, restart motor.

---

## Rollback completo (emergência)

```bash
# 1. Parar motor
railway service stop motor

# 2. Reverter DATABASE_URL para Supabase
railway variables set DATABASE_URL="$SUPABASE_URL" --service motor
railway variables set DATABASE_URL="$SUPABASE_URL" --service web

# 3. Re-habilitar scheduler se necessário
railway variables set MOTOR_SCHEDULER_ENABLED=true --service motor

# 4. Iniciar motor
railway service start motor

# 5. Validar imediatamente (smoke test §9)
```

> **Timeline máxima de rollback:** 5 minutos.

---

## Referências

- `STACK-COST-ANALYSIS.md` §5 S2 dia 3 (citado como "Alto risco")
- `RUNBOOK-014` (provisionamento Postgres)
- `RUNBOOK-015` (provisionamento Redis)
- PostgreSQL pg_dump/pg_restore: https://www.postgresql.org/docs/current/app-pgdump.html
