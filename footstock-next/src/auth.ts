// ============================================================================
// Auth.js v5 — Node runtime config (NXAUTH TASK-3)
// ----------------------------------------------------------------------------
// Estende `authConfig` (edge-safe) com:
//  - adapter Prisma com guard anti auto-create (createAuthjsAdapter)
//  - provider Credentials (logica completa entrega TASK-4 / Item 3 do source)
//  - callbacks jwt/session propagando campos custom (id, adminRole, planType,
//    userType, favoriteClub) para o token e a session
//  - callback signIn que invoca detectIdentityConflict/handleIdentityConflict
//    quando ambos cookies (Auth.js + Supabase) estao presentes
//
// Roda apenas no Node runtime — importado pelo route handler em
// app/api/auth/[...nextauth]/route.ts (que declara runtime='nodejs').
// ============================================================================

import 'server-only'

import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { cookies } from 'next/headers'

import { authConfig } from '@/auth.config'
import { createAuthjsAdapter } from '@/lib/auth/authjs-adapter'
import { authorizeCredentials } from '@/lib/auth-credentials'
import {
  clearDualCookies,
  detectIdentityConflict,
  handleIdentityConflict,
} from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createSupabaseServerClient } from '@/lib/supabase'
import type { AdminRole, PlanType } from '@/lib/enums'

const SUPABASE_COOKIE_PREFIX = 'sb-'

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: createAuthjsAdapter(prisma),
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Senha', type: 'password' },
      },
      // TASK-3 (Item 3 do source.md): delega para `authorizeCredentials`
      // em src/lib/auth-credentials.ts (Zod parse + bcrypt.compare com
      // timing defense). Retorno nullable: null sinaliza CredentialsSignin
      // para o caller (rota /api/v1/auth/login decide fallback Supabase).
      authorize: authorizeCredentials,
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,

    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string
        token.adminRole = (user.adminRole ?? null) as AdminRole | null
        // planType e nullable: staff (ADMIN/CLUB_PARTNER) tem null.
        token.planType = (user.planType ?? null) as PlanType | null
        token.userType = user.userType
        token.favoriteClub = user.favoriteClub ?? null
      }
      return token
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id
        session.user.adminRole = (token.adminRole ?? null) as AdminRole | null
        session.user.planType = (token.planType ?? null) as PlanType | null
        session.user.userType = (token.userType ?? '') as string
        session.user.favoriteClub = (token.favoriteClub ?? null) as string | null
      }
      return session
    },

    async signIn({ user }) {
      if (!user?.id) return false

      let cookieStore: Awaited<ReturnType<typeof cookies>>
      try {
        cookieStore = await cookies()
      } catch {
        // Contexto sem cookies (ex: testes unitarios) — sem conflito possivel.
        return true
      }

      const hasSupabaseCookie = cookieStore
        .getAll()
        .some((c) => c.name.startsWith(SUPABASE_COOKIE_PREFIX))
      if (!hasSupabaseCookie) return true

      try {
        const supabase = await createSupabaseServerClient()
        const {
          data: { user: supabaseUser },
        } = await supabase.auth.getUser()
        if (!supabaseUser) return true

        const conflict = detectIdentityConflict(
          { id: user.id, email: user.email ?? null },
          { id: supabaseUser.id, email: supabaseUser.email ?? null },
        )
        if (!conflict) return true

        const decision = await handleIdentityConflict(
          true,
          { id: user.id, email: user.email ?? null },
          { id: supabaseUser.id, email: supabaseUser.email ?? null },
        )
        if (decision === null) {
          await clearDualCookies()
          return false
        }
        return true
      } catch {
        // Falha de leitura do Supabase nao bloqueia signIn — telemetria ja
        // capturada em handleIdentityConflict quando aplicavel.
        return true
      }
    },
  },
})
