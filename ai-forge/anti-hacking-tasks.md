# Anti-Hacking Tasks — FootStock
Data: 2026-04-02

---

## P0-BLOCKER (Bloqueia deploy)

_Nenhuma vulnerabilidade P0 encontrada._

---

## P1-CRÍTICO (Fix em 24h)

_Nenhuma vulnerabilidade P1 encontrada._

---

## P2-ALTO (Fix em 1 semana)

### T001 — Atualizar Node.js para ≥20.20.0 (CVE-2025-59466)

**CVE**: CVE-2025-59466
**Arquivo**: `package.json:6`
**Impacto**: DoS via stack exhaustion em async_hooks (1 request suficiente)

**Fix**:
```json
// package.json
"engines": {
  "node": ">=20.20.0",
  "npm": ">=9.0.0"
}
```

**Também**: Atualizar `.node-version` / `.nvmrc` se existirem. Atualizar `Dockerfile` e Vercel runtime settings.

**Teste**: `node --version` deve retornar >=20.20.0 no deploy.

**Estimativa**: 1h (infra)

---

### T002 — Remover 'unsafe-inline' do CSP script-src

**Arquivo**: `next.config.ts:28`
**Impacto**: Sem 'unsafe-inline', scripts XSS injetados não executam

**Antes**:
```typescript
`script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://js.sentry-cdn.com`,
```

**Depois** (opção 1 — sem scripts inline no app):
```typescript
`script-src 'self'${isDev ? " 'unsafe-eval'" : ''} https://js.sentry-cdn.com`,
```

**Depois** (opção 2 — com nonce para scripts necessários, via Next.js):
```typescript
// Ver: https://nextjs.org/docs/app/building-your-application/configuring/content-security-policy
// Usar middleware para gerar nonce por request
`script-src 'self' 'nonce-{NONCE}'${isDev ? " 'unsafe-eval'" : ''} https://js.sentry-cdn.com`,
```

**Pré-requisito**: Verificar se há scripts inline no `<head>` ou em componentes. Se sim, migrar para `<Script>` com `nonce`.

**Teste**: Abrir console no browser. Tentar executar script inline. Deve ser bloqueado pelo CSP.

**Estimativa**: 3h (auditoria + implementação)

---

### T003 — Mudar X-Frame-Options para DENY

**Arquivo**: `next.config.ts:18`

**Antes**:
```typescript
{ key: 'X-Frame-Options', value: 'SAMEORIGIN' },
```

**Depois**:
```typescript
{ key: 'X-Frame-Options', value: 'DENY' },
```

**Nota**: A CSP já tem `frame-ancestors 'none'` que é mais forte. Mas o X-Frame-Options deve ser consistente para browsers legados.

**Teste**: Tentar embutir a app em um iframe de qualquer domínio. Deve ser bloqueado.

**Estimativa**: 15min

---

### T004 — Restringir img-src no CSP

**Arquivo**: `next.config.ts:30`

**Antes**:
```typescript
"img-src 'self' data: blob: https:",
```

**Depois**:
```typescript
"img-src 'self' data: blob: https://*.supabase.co https://flagcdn.com",
```

**Nota**: Verificar quais domínios externos de imagem são usados no app (avatars, logos de clube, etc.) e adicionar à lista.

**Teste**: Verificar que imagens legítimas carregam. CSP report para imagens bloqueadas inesperadamente.

**Estimativa**: 2h (auditoria de uso + implementação)

---

### T005 — Auditar e corrigir configuração NODE_ENV em produção

**Arquivos**: `middleware.ts:55`, `app/api/middleware.ts:62`, `app/api/v1/auth/login/route.ts:196`, `lib/auth/club-auth.ts:119`, `lib/auth/affiliate-auth.ts:29`

**Ação**: Verificar no painel Vercel que `NODE_ENV=production` está configurado (Vercel define automaticamente, mas confirmar).

**Fix adicional** — Adicionar ao startup (`app/layout.tsx` ou similar):
```typescript
// lib/startup-checks.ts (executado somente server-side)
if (process.env.NODE_ENV !== 'production' && process.env.VERCEL_ENV === 'production') {
  console.error('[FATAL] NODE_ENV não é "production" em ambiente Vercel production!')
  // Não throw aqui — apenas log para alertar
}
```

**Teste**: Deploy em staging. Verificar que cookie `fs_dev_auth` não funciona.

**Estimativa**: 1h

---

## P3-MÉDIO (Próximo sprint)

### T006 — Trocar Referrer-Policy para strict-origin-when-cross-origin

**Arquivo**: `next.config.ts:21`

```typescript
{ key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
```

**Estimativa**: 5min

---

### T007 — Substituir Math.random() por randomBytes em anonimização

**Arquivo**: `lib/services/account-deletion.ts:31`

**Antes**:
```typescript
const anonymousId = sha256(`${userId}${Date.now()}${Math.random()}`).slice(0, 16)
```

**Depois**:
```typescript
import { randomBytes } from 'crypto'
const anonymousId = sha256(`${userId}${randomBytes(16).toString('hex')}`).slice(0, 16)
```

**Estimativa**: 30min

---

### T008 — Corrigir $queryRaw INTERVAL para query parametrizada correta

**Arquivo**: `lib/monitoring/nsm.ts:138-147`

**Antes**:
```typescript
const results = await prisma.$queryRaw<{ date: string; count: number }[]>`
  SELECT
    TO_CHAR(executed_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS date,
    COUNT(*)::integer AS count
  FROM orders
  WHERE status = 'FILLED'
    AND executed_at >= NOW() - INTERVAL '${days} days'
  GROUP BY date
  ORDER BY date DESC
`
```

**Depois** (interpolação direta fora de string literal — Prisma parameteriza corretamente):
```typescript
const results = await prisma.$queryRaw<{ date: string; count: number }[]>`
  SELECT
    TO_CHAR(executed_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS date,
    COUNT(*)::integer AS count
  FROM orders
  WHERE status = 'FILLED'
    AND executed_at >= NOW() - (${days}::integer * INTERVAL '1 day')
  GROUP BY date
  ORDER BY date DESC
`
```

**Nota**: `days` é sempre literal hardcoded (7, 30) — não é user input. Sem risco de SQL injection.

**Estimativa**: 30min

---

### T009 — Migrar tokens de auth para cookies httpOnly

**Arquivo**: `app/api/v1/auth/login/route.ts:308-318`

**Opção A** (simples — usar Supabase SSR cookies gerenciados):
- Verificar se o Supabase SSR client já gerencia cookies ao chamar `signInWithPassword`
- Se sim, remover tokens do JSON response e deixar apenas dados do usuário

**Opção B** (manual):
```typescript
const response = NextResponse.json({ success: true, data: { user, requiresOnboarding } })
response.cookies.set('sb-access-token', authData.session.access_token, {
  httpOnly: true, secure: true, sameSite: 'lax', maxAge: 3600
})
response.cookies.set('sb-refresh-token', authData.session.refresh_token, {
  httpOnly: true, secure: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 7
})
return response
```

**Estimativa**: 4h (mudança afeta fluxo de auth no frontend)

---

### T010 — Migrar .env.deploy para secrets manager

**Arquivo**: `.env.deploy` (em disco, gitignored)

**Ação**: Mover credenciais de produção para:
1. Vercel Environment Variables (UI do dashboard) — tokens de deploy
2. 1Password CLI ou similar para uso local do desenvolvedor

**Estimativa**: 2h

---

### T013 — Corrigir IP spoofing no rate limiting de auth

**Arquivo**: `app/api/v1/auth/login/route.ts:139`
**Identificado por**: Revisão adversarial (Codex)

**Antes**:
```typescript
const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
```

**Depois**:
```typescript
const forwarded = request.headers.get('x-forwarded-for')
const ips = forwarded?.split(',').map(s => s.trim()) ?? []
const ip = ips[ips.length - 1] ?? request.headers.get('x-real-ip') ?? 'unknown'
```

**Por que**: Em Vercel, o IP real é adicionado ao final da cadeia `x-forwarded-for`. Ler o primeiro (`[0]`) é controlável pelo atacante para bypassar rate limiting.

**Estimativa**: 15min

---

## P4-BAIXO (Backlog)

### T011 — Resolver npm audit (4 low — dev deps)

```bash
npm audit fix
```

Revisar se as correções não quebram os testes.

**Estimativa**: 1h

---

### T012 — Adicionar token de autenticação no health endpoint

**Arquivo**: `app/api/v1/health/route.ts`

**Opção**: Adicionar suporte a `?token=HEALTH_CHECK_SECRET` para requests de uptime monitors que precisam do status detalhado, mantendo o endpoint público mas com fingerprinting reduzido.

**Estimativa**: 1h
