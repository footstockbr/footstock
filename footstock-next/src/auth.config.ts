// ============================================================================
// Auth.js v5 — Edge-safe shared config (NXAUTH TASK-3)
// ----------------------------------------------------------------------------
// NUNCA importar nada de 'server-only', '@/lib/prisma', '@auth/prisma-adapter',
// 'bcryptjs' ou outros pacotes Node-only aqui. Este modulo e consumido pelo
// middleware (Edge runtime) e qualquer dep nativa quebra o bundle.
//
// Providers ficam vazios neste arquivo (sentinela): o Credentials real e
// adicionado em src/auth.ts (Node runtime) junto com o adapter Prisma e a
// logica de autenticacao. O middleware nao precisa avaliar Credentials — basta
// usar o callback `authorized` para decidir acesso baseado no token JWT.
// ============================================================================

import type { NextAuthConfig } from 'next-auth'

export const authConfig = {
  // Sentinela vazio. Credentials e injetado em src/auth.ts (runtime Node).
  providers: [],
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  // AUTH_TRUST_HOST=true em env espelha esta flag; explicito aqui evita
  // diferenca de comportamento entre dev e prod quando a env var faltar.
  trustHost: true,
  callbacks: {
    // Hook chamado pelo middleware quando wrap via NextAuth(authConfig).auth.
    // Retornar true mantem comportamento atual: protecao por rota e feita
    // dentro dos route handlers (lib/auth/server.ts). Quando o app migrar
    // para Auth.js-first end-to-end, ajustar para checar `auth?.user` aqui.
    authorized() {
      return true
    },
  },
} satisfies NextAuthConfig
