# Anti-Hacking Review Report — FootStock
Data: 2026-04-02
Projeto: foot-stock (mercado de ações do futebol brasileiro)
Fingerprint: Next.js 15.5.14 | React 19.2.4 | Node.js >=18.17.0

---

## Resumo Executivo

App financeiro de alto risco (trading, assinaturas, pagamentos, dados bancários de afiliados e clubes). Análise completa de 6 fases: pesquisa de CVEs atuais + pentest assistido.

**Resultado:** Nenhum P0-BLOCKER nem P1-CRÍTICO encontrado. As versões utilizadas estão com todos os CVEs críticos conhecidos corrigidos. O código demonstra boas práticas de segurança (RBAC, rate limiting, HMAC em webhooks, AES-256-GCM para dados bancários). Foram identificados pontos de hardening P2 e P3.

### Contagem de vulnerabilidades

| Prioridade | Total | Detalhes |
|-----------|-------|---------|
| P0-BLOCKER | 0 | — |
| P1-CRÍTICO | 0 | — |
| P2-ALTO | 5 | Documentadas abaixo |
| P3-MÉDIO | 6 | Documentadas abaixo |
| P4-BAIXO | 2 | npm audit (dev deps) |

- CVEs verificados: 7
- CVEs aplicáveis ao projeto: 0 (todos patcheados nas versões utilizadas)
- Attack chains identificadas: 0
- **Risco geral: MÉDIO** (sem vulnerabilidades exploráveis remotamente)

---

## CVEs Verificados

| CVE | CVSS | Descrição | Status |
|-----|------|-----------|--------|
| CVE-2025-29927 | 9.1 | Middleware auth bypass via `x-middleware-subrequest` | ✅ NÃO AFETADO (fix em ≥15.2.3, projeto usa 15.5.14) |
| CVE-2025-55182 (React2Shell) | 10.0 | RCE via RSC Flight deserialization | ✅ NÃO AFETADO (fix em React ≥19.2.1, projeto usa 19.2.4) |
| CVE-2025-55184 | Alto | DoS via recursão infinita de Promises no RSC | ✅ NÃO AFETADO (mesma correção) |
| CVE-2025-57822 | Alto | SSRF via header Location no middleware | ✅ NÃO AFETADO (fix em Next.js ≥15.4.8) |
| CVE-2025-55183 | Alto | Disclosure de código de Server Actions | ✅ NÃO AFETADO (patcheado) |
| CVE-2025-49826 / CVE-2025-49005 | Alto | Cache poisoning ISR | ✅ NÃO AFETADO (patcheado) |
| CVE-2025-59466 | Alto | DoS via stack exhaustion em async_hooks | ⚠️ CONDICIONAL (depende da versão Node.js em uso) |

---

## Vulnerabilidades Detalhadas

### V001 — P2-ALTO: CSP com 'unsafe-inline' em script-src

**Arquivo**: `next.config.ts:28`

```typescript
// ANTES (vulnerável)
`script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://js.sentry-cdn.com`,
```

**Descrição**: `'unsafe-inline'` em `script-src` permite execução de scripts inline, anulando a proteção do CSP contra XSS. Em um app financeiro de trading, XSS pode levar a roubo de tokens e session hijacking.

**Impacto**: Redução significativa da defesa em profundidade contra XSS.

**Mitigação**: Usar nonces CSP (`nonce-{base64}`) ou hashes para scripts inline necessários.

---

### V002 — P2-ALTO: X-Frame-Options SAMEORIGIN (deveria ser DENY)

**Arquivo**: `next.config.ts:18`

```typescript
{ key: 'X-Frame-Options', value: 'SAMEORIGIN' },
```

**Descrição**: `SAMEORIGIN` permite que a aplicação seja embutida em iframes de mesmo domínio. Para um app financeiro, DENY é obrigatório para prevenir clickjacking completo (atacante não pode criar subdomínio para embutir o app).

**Impacto**: Clickjacking em subdomínios do mesmo domínio (`partner.footstock.com.br` embutindo `app.footstock.com.br`).

**Mitigação**:
```typescript
{ key: 'X-Frame-Options', value: 'DENY' },
// E na CSP: frame-ancestors 'none'
```
Nota: a CSP já tem `frame-ancestors 'none'`, o que é mais forte. O X-Frame-Options redundante deveria ser DENY para consistência.

---

### V003 — P2-ALTO: img-src permite qualquer HTTPS

**Arquivo**: `next.config.ts:30`

```typescript
"img-src 'self' data: blob: https:",
```

**Descrição**: `https:` em `img-src` permite carregar imagens de qualquer domínio HTTPS. Em apps financeiros, isso pode ser abusado para exfiltração de dados via tracking pixels ou como vetor de content spoofing.

**Mitigação**: Restringir a domínios conhecidos:
```typescript
"img-src 'self' data: blob: https://*.supabase.co https://flagcdn.com https://lh3.googleusercontent.com",
```

---

### V004 — P2-ALTO: CVE-2025-59466 — Node.js DoS condicional

**Descrição**: CVE-2025-59466 (DoS via stack exhaustion em async_hooks) afeta Node.js < 20.20.0, < 22.22.0, < 24.13.0. O projeto requer `>=18.17.0` (package.json engines), sem fixar um limite superior. Se o deployment usa Node.js 18.x ou 20.x < 20.20.0, o servidor é vulnerável a DoS com 1 request malformado.

**Como verificar**: `node --version` no servidor de produção.

**Mitigação**: Atualizar para Node.js 20.20.0+ ou 22.22.0+. Fixar engines:
```json
"engines": { "node": ">=20.20.0", "npm": ">=9.0.0" }
```

---

### V005 — P2-ALTO: Múltiplos caminhos DEV auth (risco se NODE_ENV mal configurado)

**Arquivos**:
- `middleware.ts:55` — `process.env.NODE_ENV !== 'production' && Boolean(devAuthEmail)`
- `app/api/middleware.ts:62` — cookie `fs_dev_auth` como auth fallback
- `app/api/v1/auth/login/route.ts:196` — comparação plaintext de senha
- `lib/auth/club-auth.ts:119` — DEV bypass para portal de clube
- `lib/auth/affiliate-auth.ts:29` — DEV bypass para portal de afiliados

**Descrição**: Se `NODE_ENV` for diferente de `"production"` em ambiente de produção (misconfiguration), todos esses caminhos de autenticação de desenvolvimento ficam ativos. Isso incluiria:
- Login sem Supabase via cookie arbitrário `fs_dev_auth`
- Comparação plaintext de senha (`devProfile.password === password`)
- Bypass completo de verificação de role para admin, clube e afiliado

**Impacto**: Se ativado em produção → bypass total de autenticação.

**Mitigação**: Validar NODE_ENV no startup da aplicação. Adicionar verificação explícita na CI/CD.

---

### V006 — P3-MÉDIO: Referrer-Policy vaza paths (origin-when-cross-origin)

**Arquivo**: `next.config.ts:21`

```typescript
{ key: 'Referrer-Policy', value: 'origin-when-cross-origin' },
```

**Descrição**: `origin-when-cross-origin` envia a URL completa (incluindo path e query params) em requests same-origin e apenas a origin em cross-origin. Isso pode vazar paths de trading (`/mercado/FLA?ordem=compra&preco=10.50`) para analytics/CDN logs.

**Mitigação**:
```typescript
{ key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
```

---

### V007 — P3-MÉDIO: Math.random() em geração de ID de anonimização

**Arquivo**: `lib/services/account-deletion.ts:31`

```typescript
const anonymousId = sha256(`${userId}${Date.now()}${Math.random()}`).slice(0, 16)
```

**Descrição**: `Math.random()` não é criptograficamente seguro (CSPRNG). Embora o sha256 aplique uma transformação one-way, a entropia do anonymousId pode ser previsível se o userId for conhecido. Para dados LGPD, IDs de anonimização devem ser imprevisíveis.

**Mitigação**:
```typescript
import { randomBytes } from 'crypto'
const anonymousId = sha256(`${userId}${randomBytes(16).toString('hex')}`).slice(0, 16)
```

---

### V008 — P3-MÉDIO: $queryRaw com interpolação em INTERVAL (bug potencial)

**Arquivo**: `lib/monitoring/nsm.ts:138-147`

```typescript
const results = await prisma.$queryRaw<...>`
  ...
  AND executed_at >= NOW() - INTERVAL '${days} days'
  ...
`
```

**Descrição**: Prisma's `$queryRaw` tagged template parameteriza interpolações como `$1`, mas `INTERVAL '$1 days'` em PostgreSQL NÃO é uma query parametrizada válida — o banco interpreta `$1` como literal. Em runtime, se o Redis cache falhar, esta query pode retornar resultado inesperado ou erro.

**Nota de segurança**: `days` é sempre um literal hardcoded (7, 30) — não é user input. Risco é funcional, não de segurança.

**Mitigação**:
```typescript
import { Prisma } from '@prisma/client'
const daysInt = Prisma.sql`${days}::integer`
const results = await prisma.$queryRaw<...>`
  ...
  AND executed_at >= NOW() - (${daysInt} * INTERVAL '1 day')
  ...
`
```

---

### V009 — P3-MÉDIO: Tokens de acesso no body da resposta JSON

**Arquivo**: `app/api/v1/auth/login/route.ts:312-318`

```typescript
session: {
  accessToken: authData.session.access_token,
  refreshToken: authData.session.refresh_token,
  expiresAt: authData.session.expires_at,
},
```

**Descrição**: Tokens retornados no body JSON ficam acessíveis a JavaScript no cliente e podem ser logados por proxies, CDNs ou ferramentas de analytics. O padrão mais seguro para SPAs é retornar tokens em cookies httpOnly.

**Mitigação**: Retornar tokens em cookies httpOnly ou usar a sessão gerenciada pelo Supabase SSR client via cookies.

---

### V010 — P3-MÉDIO: Credenciais de produção em plaintext no disco

**Arquivo**: `.env.deploy` (gitignored — NÃO está no repositório)

**Descrição**: O arquivo `.env.deploy` contém credenciais reais de produção (Supabase, Anthropic API key, Vercel token, GitHub token, Railway token, Upstash Redis, Resend). O arquivo está corretamente no `.gitignore` do projeto E no `.gitignore` do SystemForge. Porém, credenciais em plaintext no disco são vulneráveis a comprometimento da máquina do desenvolvedor.

**Mitigação**: Migrar para secrets manager (1Password CLI, Vercel env vars dashboard, ou `op run`).

---

### V011 — P3-MÉDIO: Health endpoint expõe status de infra (público)

**Arquivo**: `app/api/v1/health/route.ts`

**Descrição**: O endpoint público `/api/v1/health` expõe status de `db`, `redis` e `motor`. Embora intencional para monitoramento, um atacante pode usar isso para recon (saber quando o Redis ou DB está offline para explorar race conditions).

**Impacto**: Baixo — auxilia reconhecimento.

**Mitigação**: Adicionar um token simples de monitoramento ou restringir por IP das ferramentas de uptime.

---

### V012 — P4-BAIXO: npm audit — 4 vulnerabilidades baixas (deps de dev)

```
@tootallnate/once: low
http-proxy-agent: low
jest-environment-jsdom: low
jsdom: low
```

**Nota**: Todas são dependências de desenvolvimento/teste. Não afetam o runtime de produção.

---

## Attack Chains

### Attack Chain 1: XSS + Token Exfiltration (V001 + V009)
1. Atacante injeta conteúdo malicioso via fórum ou notícias (se sanitização falhar)
2. `'unsafe-inline'` no CSP permite execução do script injetado (V001)
3. Script acessa tokens Supabase retornados no JSON e armazenados em estado JS (V009)
4. Tokens exfiltrados para servidor externo → session hijacking

**Complexidade**: Média (requer XSS em conteúdo de terceiro + frontend que expõe tokens)
**Impacto combinado**: Comprometimento de conta de usuário
**Mitigação**: T002 (remover unsafe-inline) + T009 (tokens em httpOnly cookies)

---

---

## Dependências Vulneráveis

```
npm audit: 4 vulnerabilities (4 low) — todas em dev dependencies
```

---

## Headers de Segurança

| Header | Status | Valor |
|--------|--------|-------|
| Content-Security-Policy | ⚠️ | script-src com 'unsafe-inline' |
| Strict-Transport-Security | ✅ | max-age=63072000; includeSubDomains; preload |
| X-Frame-Options | ⚠️ | SAMEORIGIN (recomendar DENY) |
| X-Content-Type-Options | ✅ | nosniff |
| Referrer-Policy | ⚠️ | origin-when-cross-origin |
| Permissions-Policy | ✅ | camera=(), microphone=(), geolocation=() |
| X-XSS-Protection | — | Não configurado (obsoleto em browsers modernos) |

---

## Análise PCI DSS 4.0

O projeto usa Mercado Pago, PagSeguro e PayPal via webhooks. Pontos positivos:
- ✅ Webhooks validados por HMAC (previne replay attacks)
- ✅ Dados de pagamento PCI-safe: `gatewayMeta` NUNCA contém PAN/CVV
- ✅ Payment records não armazenam dados de cartão
- ✅ Rate limiting em webhook endpoint
- ✅ Idempotência verificada por `gatewayTransactionId`
- ⚠️ Verificar se formulários de checkout usam hosted fields (não foi possível auditar frontend completo)

---

## Análise LGPD/Dados Sensíveis

- ✅ Dados bancários de afiliados/clubes: AES-256-GCM em repouso
- ✅ Anonimização de conta via `account-deletion.ts`
- ⚠️ Math.random() na geração de anonymousId (V007)
- ✅ CPF armazenado como hash (cpfHash)
- ✅ Export de dados do usuário disponível (`/api/v1/users/me/export`)

---

## Fontes Pesquisadas

- NVD: CVE-2025-29927, CVE-2025-55182, CVE-2025-55184, CVE-2025-57822, CVE-2025-55183
- Vercel Changelog: CVE-2025-49826, CVE-2025-57822
- React.dev: CVE-2025-55184, CVE-2025-55183
- Wiz Blog: React2Shell (CVE-2025-55182)
- Node.js Security Blog: CVE-2025-59466
