# Runbook 023 — Rotação de Secrets (JWT / MOTOR / INVITE / AUTH)

> **Tipo:** RUNBOOK — REQUER COMUNICAÇÃO COM USUÁRIOS (sessões invalidadas)
> **Criticidade:** CRÍTICA
> **Criado:** 2026-05-10
> **Janela esperada:** 20 minutos (rotação) + 1 ciclo de redeploy web
> **Responsável:** DevOps / Security lead
> **Origem:** TASK-P0-02 (RAILWAY-MIGRATION-TASKLIST.md:75) + execução real item 005 do loop remediate

---

## 0. Contexto

Vale também para futuras rotações regulares (ciclo de 90 dias recomendado) e para rotações emergenciais (token vazado).

Secrets cobertos:

| Secret | Consumidor | Tamanho | Geração |
|---|---|---|---|
| `JWT_SECRET` | motor + web (paridade obrigatória) | 64 chars URL-safe-base64 | `openssl rand -base64 48` |
| `MOTOR_SECRET_TOKEN` | motor↔web handshake | 64 chars | `openssl rand -base64 48` |
| `INVITE_TOKEN_SECRET` | web (convites) | 64 chars | `openssl rand -base64 48` |
| `AUTH_SECRET` | Auth.js v5 (motor + web) | 44 chars base64 | `openssl rand -base64 32` |

> `NEXTAUTH_SECRET` (legacy v4) **não** é gerado novo neste runbook. Se já existir no Railway env como random value, mantém como alias até NXAUTH-02 migrar tudo para `AUTH_SECRET`.

---

## 1. Pré-condições

- [ ] Token Railway disponível em `.claude/projects/foot-stock.json > credentials.railway.api_token` (ORCH).
- [ ] `gh` autenticado para o repo `footstockbr/footstock`.
- [ ] Usuário com permissão de admin nos services Railway (motor + web).
- [ ] Comunicação ao cliente preparada: "todos os usuários precisarão fazer login novamente após a próxima janela de deploy do web".
- [ ] Backup `.env.production` local (`cp .env.production .env.production.bak.$(date +%s)`).
- [ ] Backup do `.claude/projects/foot-stock.json` (idem).

---

## 2. Geração segura (zero leak via shell history)

```bash
# 2.1 tmpfile chmod 600 — valores nunca tocam stdout nem history
TMP=$(mktemp) && chmod 600 "$TMP"
{
  echo "JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n')"
  echo "MOTOR_SECRET_TOKEN=$(openssl rand -base64 48 | tr -d '\n')"
  echo "INVITE_TOKEN_SECRET=$(openssl rand -base64 48 | tr -d '\n')"
  echo "AUTH_SECRET=$(openssl rand -base64 32 | tr -d '\n')"
} > "$TMP"

# 2.2 sha256 prefixos para audit (não vaza secret)
while IFS='=' read -r key val; do
  printf '%s sha256_16=%s\n' "$key" "$(printf %s "$val" | sha256sum | cut -c1-16)"
done < "$TMP"
```

Anotar os 4 prefixos `sha256_16` — usados na §6 para verificar paridade pós-rotação.

---

## 3. Aplicar em Railway (motor + web)

```bash
RAILWAY_API_TOKEN='<de credentials.railway.api_token>'

# IDs Railway (estado 2026-05-09; revalidar antes de cada rotação:
#   railway service list  OU  GraphQL { projects { edges { node { id services { ... } } } } })
SVC_MOTOR='451e1621-bcfa-4504-b2a1-8c06bd8584bf'
SVC_WEB='ae3d2626-3213-4c22-b90c-c6f578e1c69a'
ENV='6104895d-50c2-4c25-afc2-64a0b467565b'
PROJ='45677912-3487-4978-b20b-fc7cdb8b93cf'

# Helper variableUpsert via GraphQL
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

# Loop sobre o tmpfile gerado em §2
while IFS='=' read -r key val; do
  upsert "$SVC_MOTOR" "$key" "$val" >/dev/null
  upsert "$SVC_WEB" "$key" "$val" >/dev/null
  printf 'upserted: %s on motor + web\n' "$key"
done < "$TMP"
```

> **Crítico:** motor e web precisam ter **exatamente o mesmo valor** para `JWT_SECRET` (motor valida tokens emitidos pelo web) e `AUTH_SECRET`. Não faça rotação parcial.

---

## 4. Aplicar em GitHub Secrets

Apenas secrets consumidos por workflows CI/CD são propagados:

```bash
while IFS='=' read -r key val; do
  case "$key" in
    JWT_SECRET|MOTOR_SECRET_TOKEN|AUTH_SECRET)
      printf '%s' "$val" | gh secret set "$key" -R footstockbr/footstock --body -
      ;;
    INVITE_TOKEN_SECRET)
      # Não consumido por workflow atualmente — pular.
      ;;
  esac
done < "$TMP"

gh secret list -R footstockbr/footstock | grep -E '(JWT|MOTOR|AUTH)_SECRET'
```

---

## 5. Persistir em `.env.production` + `.claude/projects/`

```bash
# 5.1 Atualizar workspace .env.production (gitignored, usado em local prod-like)
while IFS='=' read -r key val; do
  if grep -q "^${key}=" output/workspace/foot-stock/.env.production; then
    sed -i.bak "s|^${key}=.*|${key}=${val}|" output/workspace/foot-stock/.env.production
  else
    printf '%s=%s\n' "$key" "$val" >> output/workspace/foot-stock/.env.production
  fi
done < "$TMP"

# 5.2 Atualizar credentials.app.* em .claude/projects/foot-stock.json
#     (DUAL: app em runtime + agente para mutations Railway)
#     Cada entry: { value, source: "dual", rotated_at: "<ISO>", sha256_16: "<prefix>" }
#     Editar manualmente OU usar /project-json --set credentials.app.jwt_secret.value=...
```

---

## 6. Validar paridade

```bash
# 6.1 Query Railway env vars motor + web — extrair valor + sha256_16 via shell
#     (jq nao tem builtin sha256; pipe to sha256sum no shell).
for svc in "$SVC_MOTOR" "$SVC_WEB"; do
  out="/tmp/railway-secrets-$svc.txt" ; : > "$out" ; chmod 600 "$out"
  curl -sS -X POST https://backboard.railway.com/graphql/v2 \
    -H "Authorization: Bearer $RAILWAY_API_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"query\":\"query{ variables(projectId:\\\"$PROJ\\\",environmentId:\\\"$ENV\\\",serviceId:\\\"$svc\\\") }\"}" \
    | jq -r '.data.variables | to_entries[]
        | select(.key | test("^(JWT_SECRET|MOTOR_SECRET_TOKEN|INVITE_TOKEN_SECRET|AUTH_SECRET)$"))
        | "\(.key)\t\(.value)"' \
    | while IFS=$'\t' read -r key val; do
        sha=$(printf '%s' "$val" | sha256sum | cut -c1-16)
        printf '%s sha256_16=%s\n' "$key" "$sha" >> "$out"
      done
  printf '== %s ==\n' "$svc" ; cat "$out"
done

# Esperado: sha256_16 NOVO (≠ placeholder antigo 5c630a3b...) em motor E web
# Esperado: sha256_16 IDÊNTICO entre motor e web para cada key
# Esperado: prefixos batem com os anotados na §2.

# 6.2 Cleanup dos arquivos /tmp (contém valores em claro):
shred -u "/tmp/railway-secrets-$SVC_MOTOR.txt" "/tmp/railway-secrets-$SVC_WEB.txt"
```

Critério §6: paridade total motor↔web + nenhum sha legado (`5c630a3b…`, `67b3ef4d…`, `b774cbaa…`).

---

## 7. Limpeza obrigatória

```bash
# Apagar tmpfile com secrets em claro
shred -u "$TMP"

# Validar history limpa (zero secret em ~/.bash_history / ~/.zsh_history)
```

---

## 8. Critério de aceite

- [ ] `variableUpsert` retornou OK em motor + web para os 4 secrets aplicáveis (3, se NEXTAUTH_SECRET preservado).
- [ ] sha256_16 novos confirmados em ambos services + paridade.
- [ ] GitHub secrets atualizados (apenas os 3 consumidos por CI).
- [ ] `.env.production` workspace reflete novos valores.
- [ ] `credentials.app.*` em `.claude/projects/foot-stock.json` atualizados com `rotated_at` ISO.
- [ ] Tmpfile destruído (`shred -u`).
- [ ] Comunicação ao cliente disparada (sessões serão invalidadas após próximo deploy do web).

---

## 9. Rollback

```bash
# 9.1 Restaurar arquivos
cp output/workspace/foot-stock/.env.production.bak.<ts> output/workspace/foot-stock/.env.production
cp .claude/projects/foot-stock.json.bak.<ts> .claude/projects/foot-stock.json

# 9.2 Reverter Railway: variableUpsert com valores antigos (extrair de credentials.app.*.previous_value se mantido)
#     Para placeholders dev — NÃO RECOMENDADO em prod (motivo da rotação).

# 9.3 Reverter GitHub secrets: gh secret set <KEY> -R footstockbr/footstock --body <previous>
```

> Rollback **não invalida** sessões já criadas com o secret novo — usuários ainda precisarão relogar quando o secret antigo voltar.

---

## 10. Janela de invalidação de sessões

A invalidação real ocorre quando o **web é re-deployed** com o novo `JWT_SECRET`:
- web tem `autoDeploy=true` por default — próximo push em main rebooteia com novo secret.
- Para forçar imediato: `serviceInstanceDeployV2` via Railway GraphQL.
- Após o redeploy: todos os JWTs ativos passam a falhar na validação → usuários voltam ao /login.

Motor (item 003 [~] em `autoDeploy=false`) consome JWT na validação cross-service. Quando re-ligar (RUNBOOK específico), os novos secrets já estarão aplicados.

---

## 11. Referências

- TASK-P0-02 em `output/docs/foot-stock/RAILWAY-MIGRATION-TASKLIST.md:75`
- Item 005 do loop remediate (`_LOOP-LOG.md:249-301`) — execução real, todas mutações OK
- `.claude/credentials.schema.md` — taxonomia ORCH vs RUNTIME vs DUAL
