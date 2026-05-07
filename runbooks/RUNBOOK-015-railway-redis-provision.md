# Runbook 015 — Provisionar Railway Redis

> **Tipo:** RUNBOOK (não executado pela IA — requer CLI Railway e conta Pro)  
> **Criado:** 2026-05-06  
> **Pré-requisito:** Conta Railway Pro ativa, CLI `railway` instalado, projeto `foot-stock` criado.

---

## 1. Pré-condições

- [ ] Conta Railway Pro ativa e faturamento configurado.
- [ ] CLI Railway logado: `railway login`
- [ ] Projeto `foot-stock` selecionado: `railway link`
- [ ] Acesso ao Redis atual (Upstash/Redis Cloud) para comparar versão e canais ativos.

---

## 2. Execução

### 2.1 Adicionar plugin Redis

```bash
# No diretório raiz do projeto
railway add --plugin redis
```

> O Railway provisionará automaticamente um serviço `redis` com Redis 7.x.

### 2.2 Obter URL de conexão

```bash
# Listar variáveis do serviço redis
railway variables --service redis

# Anotar:
#   - REDIS_URL  (interna: redis.railway.internal)
#   - REDIS_URL externa (proxy — usar apenas para redis-cli local)
```

### 2.3 Configurar maxmemory-policy

Via dashboard Railway (Settings do serviço redis) ou redis-cli:

```bash
redis-cli -u $REDIS_URL CONFIG SET maxmemory-policy allkeys-lru
```

> **Motivo:** O motor usa Redis tanto para cache quanto para pub/sub (`market:tick`, `news:inject`). `allkeys-lru` garante eviction de chaves antigas preservando canais ativos.

---

## 3. Validação

### 3.1 Conectividade

```bash
redis-cli -u $REDIS_URL PING
# Esperado: PONG
```

### 3.2 Versão

```bash
redis-cli -u $REDIS_URL INFO server | grep redis_version
# Esperado: 7.x.x
```

### 3.3 maxmemory-policy

```bash
redis-cli -u $REDIS_URL CONFIG GET maxmemory-policy
# Esperado: allkeys-lru
```

### 3.4 Pub/Sub funcional

```bash
# Terminal 1 — subscriber
redis-cli -u $REDIS_URL SUBSCRIBE test:channel

# Terminal 2 — publisher
redis-cli -u $REDIS_URL PUBLISH test:channel "hello"
# Esperado no terminal 1: 1) "message" 2) "test:channel" 3) "hello"
```

---

## 4. Migração de canais (stateless)

Redis pub/sub é **stateless** — não é necessário migrar dados persistidos.

| Aspecto | Impacto | Mitigação |
|---------|---------|-----------|
| Canais `market:tick`, `news:inject` | Re-subscribe automático ao reconectar | Motor e frontend reconectam com backoff padrão (1s, 2s, 4s...) |
| Locks de leader election (`motor:leader`) | Perda de estado momentânea | Auto-recupera em ~10s (TTL 15s + heartbeat 10s). Aceitável pequena janela sem líder. |
| Cache de sessão / rate-limit | Perda de contadores | Rebuild gradual; rate-limit pode liberar burst temporário. |

> **Não migrar:** Streams Redis, Sorted Sets de PriceBuffer (reconstruídos a partir do DB em runtime).

---

## 5. Rollback

```bash
# Identificar ID do serviço redis
railway service list

# Remover (DESTRUTIVO — perde todos os dados em memória)
railway remove <redis-service-id>
```

> **Aviso:** Redis é stateless para pub/sub, mas caches serão perdidos. Reconectar ao Redis anterior (Upstash) implica apenas atualizar `REDIS_URL` nos env vars.

---

## 6. Pós-provisionamento

1. Atualizar `REDIS_URL` nos env vars dos serviços `motor` e `web` (item 017).
2. Registrar URL interna em `.env.deploy` (local seguro, não commitado).
3. Monitorar logs do motor por 5 minutos após restart para confirmar reconexão:
   ```bash
   railway logs --service motor
   ```

---

## Referências

- `STACK-COST-ANALYSIS.md` §3 + §1.4
- Railway Redis: https://docs.railway.app/databases/redis
- Redis maxmemory-policies: https://redis.io/docs/management/config/
