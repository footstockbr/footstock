# FootStock

Plataforma de investimentos simulados em ações de clubes de futebol brasileiro.

**Versão:** 1.0.0 | **Stack:** Next.js 15 + TypeScript + PostgreSQL + Redis

---

## Pré-requisitos

- Node.js 22+
- npm 10+
- Conta Supabase (banco de dados)
- Conta Upstash (Redis)

## Setup Local

```bash
# 1. Instalar dependências
npm install

# 2. Configurar variáveis de ambiente
cp .env.production.example .env.local
# Editar .env.local com suas credenciais de desenvolvimento

# 3. Aplicar migrations
npx prisma migrate dev

# 4. Popular banco de dados (40 clubes + usuários de teste)
npx prisma db seed

# 5. Iniciar servidor de desenvolvimento
npm run dev
# Abrir http://localhost:3000
```

## Motor de Mercado

O motor é um serviço Node.js standalone que calcula preços a cada 2 segundos.

```bash
# Em terminal separado:
cd motor
npm install
npm run dev
```

## Testes

```bash
# Testes unitários + integração
npm test

# Testes E2E (requer servidor rodando)
npx playwright test

# Smoke tests de produção
TEST_ENV=production \
TEST_CRAQUE_EMAIL=craque@footstock-test.com \
TEST_CRAQUE_PASS=<senha> \
PROD_URL=https://{url} \
npx playwright test tests/e2e/smoke-production.spec.ts
```

## Deploy

```bash
# Build de produção
npm run build

# Deploy no Vercel
vercel --prod
```

Para deploy completo, seguir `PENDING-ACTIONS.md` → Seção "Milestone 11".

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind CSS |
| Backend | Next.js API Routes, TypeScript |
| Banco de dados | PostgreSQL via Supabase, Prisma ORM |
| Cache + Real-time | Upstash Redis, SSE (Server-Sent Events) |
| Motor de mercado | Node.js 22 standalone (Railway) |
| Autenticação | NextAuth.js v5, WebAuthn (biometria) |
| Pagamentos | Mercado Pago, PagSeguro, PayPal |
| IA | Anthropic Claude (assessor de investimentos) |
| Monitoramento | Sentry |
| Notificações push | Web Push API (VAPID) |
| Testes | Jest, Playwright |
| Deploy | Vercel (frontend), Railway (motor) |

## Variáveis de Ambiente

Referência completa: `.env.production.example` (31 variáveis documentadas).

Variáveis mínimas para ambiente local:

```env
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...
NEXT_PUBLIC_SUPABASE_URL=https://...supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
UPSTASH_REDIS_REST_URL=https://...upstash.io
UPSTASH_REDIS_REST_TOKEN=...
ANTHROPIC_API_KEY=sk-ant-...
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<openssl rand -base64 32>
```

## Estrutura de Pastas

```
src/
├── app/              # Páginas e API Routes (Next.js App Router)
│   ├── (auth)/       # Login, cadastro, recuperação de senha
│   ├── (main)/       # Mercado, ativo, portfolio, assessor, notícias
│   ├── admin/        # Painel administrativo
│   ├── club-portal/  # Portal dos clubes parceiros
│   └── api/v1/       # 99 endpoints REST
├── components/       # 131 componentes React
├── lib/              # Utilitários: auth, prisma, ratelimit, errors
└── prisma/           # Schema, migrations e seed
motor/                # Motor de mercado Node.js standalone
tests/e2e/            # Testes Playwright
```

## Versão e Git Tags

Para criar a tag de produção após o deploy:

```bash
git tag -a v1.0.0 -m "FootStock v1.0.0 — Lançamento oficial"
git push origin v1.0.0
```

Ver histórico completo de versões em [CHANGELOG.md](./CHANGELOG.md).
