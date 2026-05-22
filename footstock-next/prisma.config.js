// ============================================================================
// Prisma 7 — config canonico (variante JS, sem TS transpiler no runner)
//
// IMPORTANTE: Prisma 7 NAO permite mais `url` em schema.prisma (breaking change
// vs Prisma 6). A URL do datasource fica AQUI, e este arquivo PRECISA ser
// copiado para o container runner (ver Dockerfile) para `prisma migrate deploy`
// funcionar em pre-deploy do Railway.
//
// JS (CommonJS) escolhido em vez de TS para evitar arrastar c12 + jiti + 12
// deps transitivas no runner. Node 20 carrega nativo via require().
//
// Tipos: dispensados aqui (config nao tem chamadores TS); validacao continua
// em build via `npx prisma validate`.
// ============================================================================

const { defineConfig } = require('@prisma/config')

module.exports = defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL ?? 'postgresql://user:password@localhost:5432/footstock',
  },
})
