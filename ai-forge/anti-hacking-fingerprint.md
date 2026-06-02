# Anti-Hacking Fingerprint — FootStock
Data: 2026-04-02
Gerado por: /nextjs:anti-hacking-review

## Stack

| Componente | Versão | Fonte |
|-----------|--------|-------|
| Next.js | 15.5.14 | package-lock.json |
| React | 19.2.4 | package-lock.json |
| Node.js | >=18.17.0 (requerido) | package.json engines |
| Prisma Client | 7.6.0 | package.json |
| Supabase SSR | ^0.9.0 | package.json |
| Sentry Next.js | ^10.47.0 | package.json |
| @upstash/ratelimit | ^2.0.0 | package.json |
| bcryptjs | 3.0.3 | package.json |
| SimpleWebAuthn | ^9.0.1/9.0.3 | package.json |

## Configuração

- **Router**: App Router (`app/`) — sem Pages Router
- **Auth**: Supabase Auth + JWT (Bearer token em API routes) + WebAuthn (biometria)
- **ORM**: Prisma com `@prisma/adapter-pg`
- **Database**: PostgreSQL via Supabase
- **Cache**: Upstash Redis (`@upstash/redis` + `ioredis`)
- **Deploy**: Vercel
- **Rate Limit**: @upstash/ratelimit
- **Pagamentos**: Mercado Pago, PagSeguro, PayPal (webhooks HMAC)
- **Email**: Resend
- **AI**: Anthropic SDK (assessor IA)

## Server Actions

Total de arquivos `'use server'`: 1
- `app/actions/admin/news.ts` — `injectNewsAction` (com RBAC `motor:control`)

## Endpoints Sensíveis

- `/api/v1/orders` — criação e listagem de ordens de trading
- `/api/v1/payments/webhook` — webhooks de pagamento (HMAC)
- `/api/v1/payments/checkout` — checkout
- `/api/v1/admin/**` — painel admin (19 endpoints)
- `/api/v1/club/**` — portal de parceiros de clube
- `/api/v1/affiliate/**` — portal de afiliados
- `/api/cron/**` — 9 jobs cron (CRON_SECRET)

## Middleware

- Arquivo: `middleware.ts`
- Matcher: `/((?!_next/static|_next/image|favicon.ico|public/).*)`
- Rotas protegidas: 9 rotas principais + `/admin` + `/affiliate` + `/club`
- Auth via: Supabase `createServerClient` + `getUser()`
- DEV fallback: cookies `fs_dev_auth` (guarded by `NODE_ENV !== 'production'`)

## Configuração de Segurança (next.config.ts)

- HSTS: ✅ max-age=63072000; includeSubDomains; preload
- X-Frame-Options: ⚠️ SAMEORIGIN (recomendado: DENY)
- X-Content-Type-Options: ✅ nosniff
- Referrer-Policy: ⚠️ origin-when-cross-origin
- Permissions-Policy: ✅ camera=(), microphone=(), geolocation=()
- CSP: ⚠️ script-src com 'unsafe-inline'
- Source Maps: ✅ desabilitado em produção (`sourcemaps: { disable: true }`)
- poweredByHeader: não configurado (default: false no Next.js 15)
- CORS: configurado via env `ALLOWED_ORIGINS` (default: `https://footstock.com.br`)

## Package Manager

- npm@10.2.3 (lock file presente)
