# ============================================================================
# Foot Stock Motor — Dockerfile de Produção (standalone motor/)
# NOTA: Este Dockerfile assume que o build context é a RAIZ do repositório.
#       Configure o serviço Railway com Root Directory = / (raiz do repo).
#       O root Dockerfile do repo (../Dockerfile) é equivalente e preferido
#       quando possível, mas este é mantido para compatibilidade.
#
# Para usar localmente a partir da raiz do repo:
#   docker build -f motor/Dockerfile .
# ============================================================================

# Stage 1: Dependências
FROM node:22-alpine AS deps
WORKDIR /app
COPY motor/package*.json ./
RUN npm ci

# Stage 2: Build com Prisma
FROM node:22-alpine AS build
WORKDIR /app
COPY motor/ ./
COPY prisma/ ./prisma/
COPY --from=deps /app/node_modules ./node_modules

# Prisma generate (aplica patch temporário de schema para Prisma 6)
RUN cp prisma/schema.prisma prisma/schema.prisma.bak && \
    sed -i 's/provider = "postgresql"/provider = "postgresql"\n  url       = env("DATABASE_URL")\n  directUrl = env("DIRECT_URL")/' prisma/schema.prisma && \
    DATABASE_URL="postgresql://prisma:prisma@localhost/prisma" DIRECT_URL="postgresql://prisma:prisma@localhost/prisma" npx --yes prisma@^6 generate && \
    mv prisma/schema.prisma.bak prisma/schema.prisma

RUN npm run build

# Stage 3: Runtime mínimo
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

# Usuário não-root
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

USER nodejs
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

CMD ["node", "dist/index.js"]
