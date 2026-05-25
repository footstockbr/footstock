# ============================================================================
# Foot Stock — Next.js 15 Dockerfile (multi-stage standalone)
# Suporte a output: 'standalone' para deploy otimizado no Railway.
# ============================================================================

# ─── Stage 1: Dependencies ─────────────────────────────────────────────────
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts --legacy-peer-deps

# ─── Stage 2: Builder ──────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts --legacy-peer-deps

COPY . .

# Gera Prisma client antes do build
RUN npx prisma generate

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build-time dummies para satisfazer constructors eager de modulos (Supabase
# client init usa process.env.NEXT_PUBLIC_SUPABASE_URL diretamente, sem passar
# pelo env.ts). Esses valores NAO afetam runtime de modulos server-side.
ENV NEXT_PUBLIC_SUPABASE_URL=https://build-placeholder.supabase.co
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=build-placeholder-anon-key
ENV SUPABASE_SERVICE_ROLE_KEY=build-placeholder-service-role-key

# IMPORTANTE: variaveis NEXT_PUBLIC_* sao INLINADAS no bundle do cliente durante
# `npm run build` — NAO sao sobrescritas por env de runtime. Declarar como ARG
# permite que o Railway injete o valor real do service variable durante o build
# (caso contrario o cliente vai a producao com `build.placeholder` gravado).
# Default placeholder so vale para builds locais sem a var definida.
ARG NEXT_PUBLIC_APP_URL=https://build.placeholder
ARG NEXT_PUBLIC_STREAM_URL=https://build.placeholder
ARG NEXT_PUBLIC_API_URL=https://build.placeholder
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_STREAM_URL=$NEXT_PUBLIC_STREAM_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PHASE=phase-production-build
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
ENV DIRECT_URL=postgresql://build:build@localhost:5432/build
ENV REDIS_URL=redis://localhost:6379
ENV REDIS_DISABLED=true
ENV JWT_SECRET=build-jwt-secret-placeholder-32-chars-min-len
ENV NEXTAUTH_SECRET=build-nextauth-secret-placeholder
ENV MOTOR_SECRET_TOKEN=build-motor-token
ENV SKIP_ENV_VALIDATION=true

RUN npm run build

# ─── Stage 3: Runner ───────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
# Bind 0.0.0.0 (Railway edge precisa alcançar via container interface)
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copia standalone output + static assets + public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Prisma runtime para o server.js (cliente gerado + bin).
# Identico ao Dockerfile original que ja funcionava em prod.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma/client ./node_modules/@prisma/client

# Migration toolkit ISOLADO em /migrations — evita conflito com o subset de
# node_modules que o Next.js standalone empacota em ./node_modules/. Prisma CLI
# tem deps fora do escopo @prisma/ (c12, deepmerge-ts, effect, empathic, jiti,
# etc) que precisam estar disponiveis quando preDeployCommand rodar.
#
# preDeployCommand no Railway (railway.toml) precisa de `cd /migrations` antes
# de chamar o binario. Layout:
#   /migrations/
#     ├── prisma/           (schema + migrations/)
#     ├── prisma.config.js
#     └── node_modules/     (prod-only, full tree)
COPY --from=deps --chown=nextjs:nodejs /app/node_modules /migrations/node_modules
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma /migrations/node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma /migrations/prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.js /migrations/prisma.config.js

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
