// ============================================================================
// FootStock — Affiliate Auth
// Helper server-side para validar sessão de afiliado (INFLUENCIADOR ou TIME_PARCEIRO).
// ATENÇÃO: Todo usuário recebe um AffiliateCode no cadastro (commissionPercentage=0).
// Para acesso ao painel /affiliate, userType DEVE ser TIME_PARCEIRO ou INFLUENCIADOR.
// Rastreabilidade: INT-084, US-036, US-037, TASK-T-001 (Gap 2 — modelo de elegibilidade)
// ============================================================================

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { readAuthjsSession } from '@/lib/auth/authjs-session'

// Tipos de usuário elegíveis ao portal de afiliados
const ELIGIBLE_AFFILIATE_TYPES = ['TIME_PARCEIRO', 'INFLUENCIADOR'] as const
export type EligibleAffiliateType = (typeof ELIGIBLE_AFFILIATE_TYPES)[number]

export type AffiliateContext = {
  userId: string
  affiliateCodeId: string
  code: string
  commissionPercentage: number
  affiliateType: EligibleAffiliateType
}

/**
 * Retorna o contexto do afiliado APENAS para usuários elegíveis (TIME_PARCEIRO ou INFLUENCIADOR).
 * Usuários NORMAL têm AffiliateCode, mas commissionPercentage=0 e NÃO têm acesso ao portal.
 * Retorna null se: não autenticado, userType=NORMAL, ou sem código ativo.
 */
export async function getAffiliateContext(): Promise<AffiliateContext | null> {
  try {
    const cookieStore = await cookies()

    // DEV local fallback: usar cookie fs_dev_auth quando não há sessão Auth.js
    if (process.env.NODE_ENV !== 'production') {
      const devAuthRaw = cookieStore.get('fs_dev_auth')?.value
      const devAuthEmail = devAuthRaw ? decodeURIComponent(devAuthRaw) : null
      if (devAuthEmail) {
        const affiliateCode = await prisma.affiliateCode.findFirst({
          where: {
            user: { email: devAuthEmail },
            active: true,
            affiliateType: { in: ELIGIBLE_AFFILIATE_TYPES as unknown as string[] },
          },
          select: { id: true, code: true, commissionPercentage: true, userId: true, affiliateType: true },
        })
        if (affiliateCode) {
          return {
            userId: affiliateCode.userId,
            affiliateCodeId: affiliateCode.id,
            code: affiliateCode.code,
            commissionPercentage: Number(affiliateCode.commissionPercentage),
            affiliateType: affiliateCode.affiliateType as EligibleAffiliateType,
          }
        }
        return null
      }
    }

    const session = await readAuthjsSession()
    if (!session?.id) return null

    // Busca código ativo E verifica elegibilidade pelo affiliateType
    const affiliateCode = await prisma.affiliateCode.findFirst({
      where: {
        userId: session.id,
        active: true,
        affiliateType: { in: ELIGIBLE_AFFILIATE_TYPES as unknown as string[] },
      },
      select: {
        id: true,
        code: true,
        commissionPercentage: true,
        affiliateType: true,
      },
    })

    if (!affiliateCode) return null

    return {
      userId: session.id,
      affiliateCodeId: affiliateCode.id,
      code: affiliateCode.code,
      commissionPercentage: Number(affiliateCode.commissionPercentage),
      affiliateType: affiliateCode.affiliateType as EligibleAffiliateType,
    }
  } catch {
    return null
  }
}

/**
 * Variante que redireciona para /affiliate/sem-permissao se não autorizado.
 * Usar em layouts/páginas Server Component do portal de afiliados.
 * 403 para userType=NORMAL — "ter código" não implica "ser afiliado elegível".
 */
export async function withAffiliateAuth(): Promise<AffiliateContext> {
  const ctx = await getAffiliateContext()
  if (!ctx) {
    redirect('/affiliate/sem-permissao')
  }
  return ctx
}
