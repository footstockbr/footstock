# Runbook 019 — DNS Cloudflare → Railway

> **Tipo:** RUNBOOK (não executado pela IA — requer acesso Cloudflare + CLI Railway)  
> **Criticidade:** ALTA  
> **Criado:** 2026-05-06  
> **Pré-requisito:** Items 008–017 todos concluídos; serviços Railway up e healthy.

---

## 1. Pré-condições

- [ ] Items 008–017 todos `[x]` (especialmente 014–017: provisionamento + env vars).
- [ ] Serviço `web` (Next.js) no Railway respondendo `200` em `/api/health`.
- [ ] Serviço `motor` no Railway respondendo `200` em `/health`.
- [ ] Domínios reservados no Railway:
  ```bash
  railway domain list --service web
  railway domain list --service motor
  ```
  > Esperado: `web.up.railway.app` e `motor.up.railway.app` ativos.
- [ ] Acesso ao painel Cloudflare (conta do cliente).
- [ ] TTL DNS reduzido para **60s** pelo menos 24h antes (acelera propagação).

---

## 2. Adicionar registros CNAME no Cloudflare

### 2.1 Apex + WWW (frontend)

| Tipo | Nome | Alvo | Proxy | SSL |
|------|------|------|-------|-----|
| CNAME | `@` (apex) | `web.up.railway.app` | 🟠 ON | Full (strict) |
| CNAME | `www` | `web.up.railway.app` | 🟠 ON | Full (strict) |

> **Nota:** Cloudflare suporta CNAME flattening no apex. Se o registrador não suportar, usar A record com IP do Railway (ver `dig web.up.railway.app`).

### 2.2 Stream (SSE)

| Tipo | Nome | Alvo | Proxy | SSL |
|------|------|------|-------|-----|
| CNAME | `stream` | `motor.up.railway.app` | 🟠 ON | Full (strict) |

### 2.3 API (opcional)

| Tipo | Nome | Alvo | Proxy | SSL |
|------|------|------|-------|-----|
| CNAME | `api` | `motor.up.railway.app` | 🟠 ON | Full (strict) |

> **Decisão:** `api.footstock.com.br` é opcional — o frontend já usa `NEXT_PUBLIC_STREAM_URL` para SSE. Manter apenas se houver clientes mobile ou third-party usando `/api/v1/*` diretamente.

---

## 3. Configurar domínios no Railway

```bash
# Adicionar domínios customizados aos serviços
railway domain add footstock.com.br --service web
railway domain add www.footstock.com.br --service web
railway domain add stream.footstock.com.br --service motor
railway domain add api.footstock.com.br --service motor
```

> O Railway emitirá certificados SSL automaticamente (Let's Encrypt).

---

## 4. Page Rules / Cache Rules

### 4.1 Cloudflare — Bypass cache para API e SSE

```
/api/*     → Cache Level: Bypass
/stream/*  → Cache Level: Bypass
/_next/static/* → Cache Level: Cache Everything, Edge TTL: 1 year
```

> **Motivo:** SSE (`/stream/*`) não pode ser cacheado — quebraria a conexão persistente. API pode ter dados sensíveis por usuário.

### 4.2 Railway — Headers de segurança

Verificar se `footstock-next` continua enviando os security headers definidos em `next.config.ts` (HSTS, CSP, etc.).

---

## 5. Validação pós-DNS

### 5.1 Resolução DNS

```bash
# Verificar se o apex resolve para IP Cloudflare
dig footstock.com.br +short
# Esperado: IP(s) do Cloudflare proxy (ex: 104.21.x.x, 172.67.x.x)

# Verificar CNAME
dig www.footstock.com.br CNAME +short
# Esperado: web.up.railway.app (ou CNAME flattening do Cloudflare)

dig stream.footstock.com.br CNAME +short
# Esperado: motor.up.railway.app
```

### 5.2 HTTPS + SSL

```bash
# Frontend
curl -I https://footstock.com.br
# Esperado: HTTP/2 200, strict-transport-security presente

# SSE
curl -N https://stream.footstock.com.br/market
# Esperado: eventos SSE com text/event-stream
```

### 5.3 Smoke test funcional

1. Acessar `https://footstock.com.br` → login deve funcionar.
2. Dashboard com preços em tempo real → SSE conectado via `stream.footstock.com.br`.
3. Criar ordem de compra → persistência no Railway Postgres.
4. Verificar notificações → SSE `stream.footstock.com.br/news`.

---

## 6. Manter Vercel ativo por 24h

- [ ] NÃO remover Vercel imediatamente.
- [ ] Monitorar tráfego no Vercel Analytics por 24h.
- [ ] Se `0 requests` após 24h: prosseguir item 020 (cleanup Vercel).
- [ ] Se ainda houver tráfego: investigar origem (TTL DNS residual, hardcoded URLs).

---

## 7. Rollback

```bash
# Reverter CNAMEs no Cloudflare para Vercel
# Tipo: CNAME | Nome: @ | Alvo: cname.vercel-dns.com | Proxy: ON
# Tipo: CNAME | Nome: www | Alvo: cname.vercel-dns.com | Proxy: ON
```

> **Timeline de rollback:** DNS ~5 minutos (com TTL 60s).  
> **Validação:** `curl -I https://footstock.com.br` deve retornar headers `server: Vercel`.

---

## Referências

- `STACK-COST-ANALYSIS.md` §3 + §5 S2 dia 4
- Cloudflare DNS: https://developers.cloudflare.com/dns/
- Railway Custom Domains: https://docs.railway.app/guides/public-networking#custom-domains
