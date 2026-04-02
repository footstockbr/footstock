# Stage 1: Dependencies (incluindo dev para prisma generate)
FROM node:22-alpine AS deps
WORKDIR /app
COPY motor/package*.json ./
RUN npm ci

# Stage 2: Build
FROM node:22-alpine AS build
WORKDIR /app
COPY motor/ ./
COPY prisma/ ./prisma/
COPY --from=deps /app/node_modules ./node_modules
RUN npx prisma generate
RUN npm run build

# Stage 3: Runtime (imagem final mínima)
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

# Criar usuário não-root
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Copiar apenas o necessário
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

USER nodejs
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

CMD ["node", "dist/index.js"]
