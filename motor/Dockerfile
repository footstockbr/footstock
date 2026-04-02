# DEPRECATED: Use o Dockerfile na raiz do projeto para builds de producao.
# Este arquivo e legado e nao esta alinhado com as specs do module-26-devops.
# O Dockerfile da raiz tem 3 stages, usuario nao-root e HEALTHCHECK.
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --only=production
COPY --from=builder /app/dist ./dist
EXPOSE 3001
CMD ["node", "dist/index.js"]
