# Foot Stock

O mercado de ações do futebol brasileiro.

## Stack

- **Frontend:** Next.js 15 (App Router) + TypeScript + Tailwind CSS 4
- **Backend:** Next.js API Routes + Prisma 6
- **Database:** PostgreSQL (Supabase)
- **Cache:** Redis (Railway/Upstash)
- **Motor:** Node.js standalone (Railway)
- **Auth:** Supabase Auth + WebAuthn
- **Monitoring:** Sentry
- **Deploy:** Vercel (web) + Railway (motor)

## Pré-requisitos

- Node.js 22+
- npm 10+
- Docker (para desenvolvimento local)
- Chave SSH configurada no GitHub

## Setup local

```bash
# Clonar repositório
git clone git@github.com:footstockbr/footstock.git
cd foot-stock

# Copiar variáveis de ambiente
cp .env.example .env.local

# Instalar dependências
npm install

# Subir banco e Redis locais (Docker)
npm run db:up

# Rodar migrations
npx prisma migrate dev

# Iniciar dev server
npm run dev
```

## Motor Railway

```bash
cd motor
npm install
npm run dev
```

## Scripts disponíveis

| Script | Descrição |
|--------|-----------|
| `npm run dev` | Inicia dev server Next.js |
| `npm run build` | Build de produção |
| `npm run lint` | Executa ESLint |
| `npm run format` | Formata código com Prettier |
| `npm run test` | Executa testes unitários |
| `npm run typecheck` | Verifica tipos TypeScript |
| `npm run db:up` | Sobe PostgreSQL + Redis via Docker |
| `npm run db:down` | Para containers Docker |
| `npm run db:reset` | Reseta banco e Redis |

## Estrutura de pastas

```
foot-stock/
├── app/                  # Next.js App Router
│   ├── (auth)/           # Páginas sem navegação (login, registro)
│   ├── (app)/            # Páginas autenticadas
│   └── api/v1/           # Route Handlers
├── components/           # Componentes React
├── lib/                  # Lógica pura (sem React)
├── motor/                # Motor de mercado (Railway)
├── prisma/               # Schema + migrations + seeds
├── types/                # TypeScript types globais
├── hooks/                # Custom React hooks
└── scripts/              # Scripts de utilidade
```
