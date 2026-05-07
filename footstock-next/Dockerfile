# ============================================================================
# Foot Stock — Next.js 15 Dockerfile (multi-stage standalone)
# Suporte a output: 'standalone' para deploy otimizado no Railway.
# ============================================================================

# ─── Stage 1: Dependencies ─────────────────────────────────────────────────
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts

# ─── Stage 2: Builder ──────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

COPY . .

# Gera Prisma client antes do build
RUN npx prisma generate

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build-time dummies para satisfazer constructors eager de modulos (Supabase
# client init usa process.env.NEXT_PUBLIC_SUPABASE_URL diretamente, sem passar
# pelo env.ts). Railway nao expoe env vars durante Docker build phase. Esses
# valores NAO afetam runtime — sao sobrescritos pelas vars do Railway service.
ENV NEXT_PUBLIC_SUPABASE_URL=https://build-placeholder.supabase.co
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=build-placeholder-anon-key
ENV NEXT_PUBLIC_APP_URL=https://build.placeholder
ENV NEXT_PUBLIC_STREAM_URL=https://build.placeholder
ENV NEXT_PUBLIC_API_URL=https://build.placeholder
ENV NEXT_PHASE=phase-production-build
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
ENV DIRECT_URL=postgresql://build:build@localhost:5432/build
ENV REDIS_URL=redis://localhost:6379
ENV JWT_SECRET=build-jwt-secret-placeholder-32-chars-min-len
ENV NEXTAUTH_SECRET=build-nextauth-secret-placeholder
ENV MOTOR_SECRET_TOKEN=build-motor-token

RUN npm run build

# ─── Stage 3: Runner ───────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copia standalone output + static assets + public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Copia Prisma engine necessário para runtime
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma/client ./node_modules/@prisma/client

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
