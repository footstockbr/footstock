import 'server-only'

import NextAuth, { type NextAuthConfig } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import Google from 'next-auth/providers/google'
import Resend from 'next-auth/providers/resend'
import { createClient } from '@supabase/supabase-js'

import { createAuthjsAdapter } from '@/lib/auth/authjs-adapter'
import { env } from '@/lib/env'
import { prisma } from '@/lib/prisma'

/**
 * Auth.js v5 root config — dark launch (NXAUTH-03).
 *
 * Strategy: database (delega lifecycle de session ao PrismaAdapter wrappeado).
 * Providers carregados condicionalmente para nao falhar build em ambientes sem
 * RESEND_API_KEY ou Google credentials. Switchover real ocorre em NXAUTH-04.
 *
 * Constraints (Codex ADV-NXAUTH-04):
 *  - Credentials provider usa @supabase/supabase-js (NAO @supabase/ssr).
 *  - Cliente supabase com `{ auth: { autoRefreshToken: false, persistSession: false } }`.
 *  - Proibido escrever cookies durante authorize().
 */
function buildProviders(): NextAuthConfig['providers'] {
  const providers: NextAuthConfig['providers'] = []

  if (env.RESEND_API_KEY) {
    providers.push(
      Resend({
        apiKey: env.RESEND_API_KEY,
        from: env.RESEND_FROM_EMAIL,
      }),
    )
  }

  if (env.AUTH_ENABLE_LEGACY_CREDENTIALS === 'true') {
    providers.push(
      Credentials({
        id: 'legacy-supabase',
        name: 'Email + Password (legacy)',
        credentials: {
          email: { label: 'Email', type: 'email' },
          password: { label: 'Password', type: 'password' },
        },
        async authorize(raw) {
          const email = typeof raw?.email === 'string' ? raw.email.trim().toLowerCase() : ''
          const password = typeof raw?.password === 'string' ? raw.password : ''
          if (!email || !password) return null

          const supabase = createClient(
            env.NEXT_PUBLIC_SUPABASE_URL,
            env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
            { auth: { autoRefreshToken: false, persistSession: false } },
          )

          const { data, error } = await supabase.auth.signInWithPassword({ email, password })
          if (error || !data?.user?.email) return null

          const dbUser = await prisma.user.findUnique({
            where: { email: data.user.email.toLowerCase() },
            select: { id: true, email: true, name: true, image: true, emailVerified: true },
          })
          if (!dbUser) return null

          return {
            id: dbUser.id,
            email: dbUser.email,
            name: dbUser.name,
            image: dbUser.image ?? null,
            emailVerified: dbUser.emailVerified ?? null,
          }
        },
      }),
    )
  }

  if (
    env.AUTH_ENABLE_GOOGLE === 'true' &&
    env.GOOGLE_CLIENT_ID &&
    env.GOOGLE_CLIENT_SECRET
  ) {
    providers.push(
      Google({
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      }),
    )
  }

  return providers
}

export const authConfig: NextAuthConfig = {
  adapter: createAuthjsAdapter(prisma),
  session: { strategy: 'database' },
  secret: env.AUTH_SECRET,
  trustHost: env.AUTH_TRUST_HOST === 'true',
  providers: buildProviders(),
  pages: {
    signIn: '/login',
  },
  callbacks: {
    /**
     * Google: rejeita unknown emails. Auth.js so deve linkar por verified email
     * para User existente — caso contrario redireciona para onboarding manual.
     */
    async signIn({ account, profile, user }) {
      if (account?.provider !== 'google') return true

      const verified = (profile as { email_verified?: boolean } | null)?.email_verified === true
      const email = (profile?.email ?? user?.email ?? '').toLowerCase()
      if (!verified || !email) return false

      const existing = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
      })
      if (!existing) {
        // Forca onboarding Prisma-first; Auth.js redireciona para signIn page.
        return '/onboarding?reason=google_unknown_email'
      }
      return true
    },

    /**
     * Injeta adminRole/planType na session para guards downstream.
     */
    async session({ session, user }) {
      if (!session.user || !user?.id) return session
      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { adminRole: true, planType: true, emailVerified: true },
      })
      if (dbUser) {
        ;(session.user as typeof session.user & {
          id: string
          adminRole: string | null
          planType: string
          emailVerified: Date | null
        }).id = user.id
        ;(session.user as typeof session.user & { adminRole: string | null }).adminRole =
          dbUser.adminRole ?? null
        ;(session.user as typeof session.user & { planType: string }).planType = dbUser.planType
        ;(session.user as typeof session.user & { emailVerified: Date | null }).emailVerified =
          dbUser.emailVerified ?? null
      }
      return session
    },
  },
}

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig)
