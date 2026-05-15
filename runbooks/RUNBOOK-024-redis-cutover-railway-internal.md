# Runbook 024 — Redis Cutover (Redis Labs → Railway internal Bitnami)

> **Tipo:** RUNBOOK — JANELA DE MANUTENÇÃO LEVE (~30s sem ticks; auto-redeploy)
> **Criticidade:** ALTA
> **Criado:** 2026-05-10
> **Janela esperada:** 5–10 minutos (mutações + redeploy automático)
> **Responsável:** DevOps lead
> **Origem:** TASK-P0-04 (RAILWAY-MIGRATION-TASKLIST.md:129) + execução real item 007 do loop remediate

---

## 0. Contexto

`REDIS_URL` em motor + web aponta para **Redis Labs** legacy (`redis-10811.crce207.sa-east-1-2.ec2.cloud.redislabs.com:10811`). O Railway já provisiona Redis Bitnami via service `redis` (`redis.railway.internal:6379`) no mesmo project + environment. Cancelar Redis Labs sem flipar = sistema morre.

> **Hostname `redis.railway.internal`** só resolve para serviços no mesmo project + environment. Para acesso externo (CI, local dev), usar `REDIS_PUBLIC_URL` da service redis. **NÃO** hardcodar `redis.railway.internal` para casos cross-env.

---

## 1. Pré-condições

- [ ] Service `redis` (Bitnami) provisionado no Railway no mesmo project + environment de motor e web (RUNBOOK-015).
- [ ] Token Railway disponível em `.claude/projects/foot-stock.json > credentials.railway.api_token`.
- [ ] Backup do estado atual (`REDIS_URL` Redis Labs) em `.tmp-loop/redis-baseline.json` para rollback.
- [ ] Comunicação leve preparada: leader re-election ~10–30s pode causar perda de SSE heartbeat para usuários conectados.
- [ ] Confirmar que `redis.ts` (footstock-next/src/lib/redis.ts) já é compatível com `REDIS_URL` simples — código aplicação **não muda**.

---

## 2. Audit-first (regra Codex)

**Importante:** [Codex] `footstock-next/src/lib/redis.ts:45,90` prefere `REDIS_CLOUD_URL` sobre `REDIS_URL` na resolução do client. Se essa var existir setada no Railway env, o flip de `REDIS_URL` é **no-op**.

```bash
RAILWAY_API_TOKEN='<token>'
# IDs estado 2026-05-09; revalidar via `railway service list` se Railway recriou os services.
PROJ='45677912-3487-4978-b20b-fc7cdb8b93cf'
ENV='6104895d-50c2-4c25-afc2-64a0b467565b'
SVC_MOTOR='451e1621-bcfa-4504-b2a1-8c06bd8584bf'
SVC_WEB='ae3d2626-3213-4c22-b90c-c6f578e1c69a'

# Listar todas as vars REDIS-relacionadas em motor + web
for svc in "$SVC_MOTOR" "$SVC_WEB"; do
  curl -sS -X POST https://backboard.railway.com/graphql/v2 \
    -H "Authorization: Bearer $RAILWAY_API_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"query\":\"query{ variables(projectId:\\\"$PROJ\\\",environmentId:\\\"$ENV\\\",serviceId:\\\"$svc\\\") }\"}" \
    | jq '.data.variables | with_entries(select(.key | test("REDIS|UPSTASH")))'
done
```

Procurar especificamente: `REDIS_URL`, `REDIS_CLOUD_URL`, `UPSTASH_REDIS_URL`, `REDIS_TLS`, `REDIS_DISABLED`.

- Se `REDIS_CLOUD_URL` existe → **deletar** OU repointar junto com `REDIS_URL` no §3.
- Se `UPSTASH_REDIS_URL` existe → **deletar** (Upstash não está em uso).

---

## 3. Capturar URL interna do service redis

```bash
SVC_REDIS='<id do service redis>'  # buscar via Railway dashboard ou GraphQL services()

curl -sS -X POST https://backboard.railway.com/graphql/v2 \
  -H "Authorization: Bearer $RAILWAY_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"query{ variables(projectId:\\\"$PROJ\\\",environmentId:\\\"$ENV\\\",serviceId:\\\"$SVC_REDIS\\\") }\"}" \
  | jq -r '.data.variables.REDIS_URL'

# Esperado: redis://:<password>@redis.railway.internal:6379
```

Anotar o valor (vai para `$REDIS_INTERNAL`).

---

## 4. Aplicar flip (motor + web)

```bash
upsert() {
  local svc="$1" name="$2" value="$3"
  curl -sS -X POST https://backboard.railway.com/graphql/v2 \
    -H "Authorization: Bearer $RAILWAY_API_TOKEN" \
    -H "Content-Type: application/json" \
    -d @- <<JSON
{"query":"mutation(\$input: VariableUpsertInput!){ variableUpsert(input: \$input) }",
 "variables":{"input":{"projectId":"$PROJ","environmentId":"$ENV","serviceId":"$svc","name":"$name","value":"$value"}}}
JSON
}

vdelete() {
  local svc="$1" name="$2"
  curl -sS -X POST https://backboard.railway.com/graphql/v2 \
    -H "Authorization: Bearer $RAILWAY_API_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"query\":\"mutation{ variableDelete(input:{projectId:\\\"$PROJ\\\",environmentId:\\\"$ENV\\\",serviceId:\\\"$svc\\\",name:\\\"$name\\\"}) }\"}"
}

REDIS_INTERNAL='redis://:<password>@redis.railway.internal:6379'

for svc in "$SVC_MOTOR" "$SVC_WEB"; do
  upsert "$svc" REDIS_URL "$REDIS_INTERNAL"
  upsert "$svc" REDIS_TLS false   # Bitnami sem TLS na rede interna
  # se §2 detectou:
  # vdelete "$svc" REDIS_CLOUD_URL
  # vdelete "$svc" UPSTASH_REDIS_URL
done
```

Auto-redeploy de motor e web é disparado pelo Railway logo após `variableUpsert`. Janela esperada: ~10–30s leader re-election durante BUILDING→SUCCESS.

---

## 5. Smoke pós-deploy

```bash
# 5.1 Web /api/health — confirma redisDetail novo host
curl -sS https://web-production-4940c.up.railway.app/api/health \
  | jq '.checks.redis, .checks.redisDetail'
# esperado: "ok" + "host:redis.railway.internal:6379, ioredis:ready"

# 5.2 Motor /health
curl -sS https://motor-production-cbb0.up.railway.app/health
# esperado: 200 (se motor está ONLINE; se offline por design — item 003 — irrelevante para este smoke)

# 5.3 Connection layer via REDIS_PUBLIC_URL (acesso externo do agent)
REDIS_PUBLIC_URL='<de service redis env vars>'
redis-cli -u "$REDIS_PUBLIC_URL" PING
redis-cli -u "$REDIS_PUBLIC_URL" EXISTS motor:leader motor:fencing-token
# esperado: PONG + (1, 1) se motor escreveu (ou (0, 0) se motor está OFFLINE — não bloquear)
```

---

## 6. GitHub secret REDIS_URL — política

`deploy.yml` linha 65 e `ci.yml` linha 108 usam `${{ secrets.REDIS_URL }}` apenas como env do step "Build Next.js" (next build não conecta a Redis em build-time). Não há smoke contra prod via REDIS_URL — usa REDIS_URL_CI separado.

Per spec TASK-P0-04d: **atualizar GitHub secret apenas se workflows usam para smoke contra prod**. Em foot-stock atual, critério não satisfeito → **NÃO atualizar**.

> Risco: secret aponta para Redis Labs até cancelamento (RUNBOOK §8). Build não conecta, então não quebra. Pós-cancelamento o secret vira dangling pointer dormente — recomendado pending action de hygiene em paralelo ao cancelamento Redis Labs.

---

## 7. Critério de aceite

- [ ] Audit §2: nenhum `REDIS_CLOUD_URL` / `UPSTASH_REDIS_URL` em motor + web (deletados se existiam).
- [ ] `REDIS_URL` motor = `REDIS_URL` web = `redis.railway.internal:6379`.
- [ ] `REDIS_TLS=false` em motor + web (paridade Bitnami).
- [ ] Auto-redeploy motor + web concluído com SUCCESS.
- [ ] Web `/api/health` retorna `redisDetail` com `redis.railway.internal:6379` + `ioredis:ready`.
- [ ] `motor:leader` e `motor:fencing-token` presentes no Railway Redis (quando motor ONLINE).
- [ ] `redis-cli PING` via `REDIS_PUBLIC_URL` retorna `PONG`.

---

## 8. Wait window 7d antes de cancelar Redis Labs

Cancelamento da subscription Redis Labs **só permitido após 7 dias** consecutivos sem incidente:
- T0 oficial = timestamp do redeploy SUCCESS de motor pós-flip.
- Critérios de continuidade durante a janela:
  - Web `/api/health` retorna `redisDetail.ioredis:ready` em todos os smokes.
  - Motor leader stable (sem flapping; se ONLINE).
  - Zero rate-limiter fail-open spikes (redis.ts:191-193).
- Codificado em `_LOOP-CONFIG.json > wait_windows[1]` para o item 041 (TASK-P2-02) do loop remediate.

Após 7d OK: portal Redis Labs → cancel subscription. Pós-cancelamento: limpar GitHub secret `REDIS_URL` (dangling pointer).

---

## 9. Rollback

```bash
# Re-rodar variableUpsert revertendo motor + web REDIS_URL ao Redis Labs URL.
# Senha original em .tmp-loop/redis-baseline.json (criado em §1).
REDIS_LEGACY='redis://default:<password>@redis-10811.crce207.sa-east-1-2.ec2.cloud.redislabs.com:10811'

for svc in "$SVC_MOTOR" "$SVC_WEB"; do
  upsert "$svc" REDIS_URL "$REDIS_LEGACY"
  # REDIS_TLS=false pode permanecer (Redis Labs aceita non-TLS na 10811 atual).
done
```

Auto-redeploy reverterá. ~30s leader re-election esperada (idêntica blast radius do flip).

---

## 10. Riscos e mitigações

- **Pub/sub leader election:** flip causa motor perder locks → reelege em ~10s. Janela de manutenção esperada: 30s sem ticks. Comunicar antes ou rodar em janela de baixa atividade.
- **Fail-open absorvedor:** `redis.ts` linhas 80-86 (`_noopProxy`) e 191-193 (rate limiter fail-open) absorvem ~30s sem Redis durante o redeploy SUCCESS sem 5xx para usuários.
- **Codex precedência REDIS_CLOUD_URL > REDIS_URL:** mantida no código como guarda contra integrações Vercel Marketplace futuras. §2 audit garante que essa ordem é inerte na env atual.

---

## 11. Referências

- TASK-P0-04 em `output/docs/foot-stock/RAILWAY-MIGRATION-TASKLIST.md:129`
- Item 007 do loop remediate (`_LOOP-LOG.md:336-421`) — execução real, todas mutações OK + smoke validado
- RUNBOOK-015 (Railway Redis provision)
- `footstock-next/src/lib/redis.ts:45,90` — precedência defensiva REDIS_CLOUD_URL
