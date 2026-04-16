import { defineConfig } from '@prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    // DIRECT_URL bypasses PgBouncer pooler — required for DDL (migrations)
    // Falls back to DATABASE_URL for environments without a separate direct connection
    url: process.env.DATABASE_URL ?? 'postgresql://user:password@localhost:5432/footstock',
    directUrl: process.env.DIRECT_URL,
  },
})
