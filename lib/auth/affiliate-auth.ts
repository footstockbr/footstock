// ============================================================================
// Foot Stock — Affiliate Auth
// Helper server-side para validar sessão de influenciador afiliado.
// Verifica se o usuário possui um AffiliateCode ativo no banco de dados.
// Rastreabilidade: INT-084, US-036, TASK-3/ST001
// ============================================================================

import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'

export type AffiliateContext = {
  userId: string
  affiliateCodeId: string
  code: string
  commissionPercentage: number
}

/**
 * Retorna o contexto do afiliado se o usuário tiver um código ativo.
 * Retorna null se não autenticado ou sem código ativo (sem redirecionar).
 */
export async function getAffiliateContext(): Promise<AffiliateContext | null> {
  try {
    const cookieStore = await cookies()

    // DEV local fallback: usar cookie fs_dev_auth quando não há sessão Supabase
    if (process.env.NODE_ENV !== 'production') {
      const devAuthRaw = cookieStore.get('fs_dev_auth')?.value
      const devAuthEmail = devAuthRaw ? decodeURIComponent(devAuthRaw) : null
      if (devAuthEmail) {
        const affiliateCode = await prisma.affiliateCode.findFirst({
          where: { user: { email: devAuthEmail }, active: true },
          select: { id: true, code: true, commissionPercentage: true, userId: true },
        })
        if (affiliateCode) {
          return {
            userId: affiliateCode.userId,
            affiliateCodeId: affiliateCode.id,
            code: affiliateCode.code,
            commissionPercentage: Number(affiliateCode.commissionPercentage),
          }
        }
      }
    }

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          },
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const affiliateCode = await prisma.affiliateCode.findUnique({
      where: { userId: user.id, active: true },
      select: {
        id: true,
        code: true,
        commissionPercentage: true,
      },
    })

    if (!affiliateCode) return null

    return {
      userId: user.id,
      affiliateCodeId: affiliateCode.id,
      code: affiliateCode.code,
      commissionPercentage: Number(affiliateCode.commissionPercentage),
    }
  } catch {
    return null
  }
}

/**
 * Variante que redireciona para /affiliate/sem-permissao se não autorizado.
 * Usar em layouts/páginas Server Component do portal de afiliados.
 */
export async function withAffiliateAuth(): Promise<AffiliateContext> {
  const ctx = await getAffiliateContext()
  if (!ctx) {
    redirect('/affiliate/sem-permissao')
  }
  return ctx
}
