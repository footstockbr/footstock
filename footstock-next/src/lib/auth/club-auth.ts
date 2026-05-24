// ============================================================================
// FootStock — Club Auth Helpers
// Contexto de autenticação para o portal de clubes parceiros.
// adminRole lido do banco (nunca do JWT). clubId extraído de user_metadata
// ou derivado do email — NUNCA de query params (prevenção IDOR/ADMIN_051).
// Rastreabilidade: INT-084, US-025, US-036, TASK-1/ST003-ST004
// ============================================================================

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { readAuthjsSession } from '@/lib/auth/authjs-session'
import { ADMIN_ROLE } from '@/lib/enums'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ClubContext = {
  userId: string
  clubId: string      // ticker do clube (ex: "FLA")
  clubName: string    // nome fictício do clube (displayName)
  adminRole: 'CLUB_PARTNER'
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

/** Deriva o clubId a partir do padrão de email: fla@footstock.com → "FLA" */
function deriveClubIdFromEmail(email: string): string | null {
  const match = email.match(/^([^@]+)@footstock\.com$/)
  return match?.[1] ? match[1].toUpperCase() : null
}

/** Busca o nome do ativo (clube) pelo ticker no banco */
async function getClubDisplayName(ticker: string): Promise<string> {
  const asset = await prisma.asset.findUnique({
    where: { ticker },
    select: { displayName: true },
  })
  return asset?.displayName ?? ticker
}

// ---------------------------------------------------------------------------
// getClubContext — para uso em API routes (lê headers injetados pelo middleware)
// ---------------------------------------------------------------------------

/**
 * Retorna o ClubContext a partir dos headers `x-club-id` / `x-club-name`
 * injetados pelo middleware (quando disponíveis), ou do JWT como fallback.
 *
 * SEGURANÇA: clubId NUNCA vem de query params — apenas de headers do middleware
 * ou da sessão autenticada do Supabase.
 */
export async function getClubContext(): Promise<ClubContext | null> {
  const { headers } = await import('next/headers')
  const headerStore = await headers()
  const cookieStore = await cookies()

  const xClubId = headerStore.get('x-club-id')
  const xClubName = headerStore.get('x-club-name')
  const xClubUserId = headerStore.get('x-club-user-id')

  // Fast path: headers injetados pelo middleware (funciona em dev e prod)
  if (xClubId && xClubName && xClubUserId) {
    // Em dev, x-club-user-id contém o email; em prod, contém o UUID
    const isEmail = xClubUserId.includes('@')
    if (isEmail && process.env.NODE_ENV !== 'production') {
      const dbUser = await prisma.user.findUnique({
        where: { email: xClubUserId },
        select: { id: true },
      })
      if (!dbUser) return null
      return { userId: dbUser.id, clubId: xClubId, clubName: xClubName, adminRole: 'CLUB_PARTNER' }
    }
    return { userId: xClubUserId, clubId: xClubId, clubName: xClubName, adminRole: 'CLUB_PARTNER' }
  }

  // Fallback: sessão Auth.js (cookie). cookieStore mantido para o dev fallback acima.
  void cookieStore
  const session = await readAuthjsSession()
  if (!session?.id) return null

  // adminRole e email SEMPRE lidos do banco (nunca confiar em claims para roles)
  const dbUser = await prisma.user.findUnique({
    where: { id: session.id },
    select: { adminRole: true, email: true },
  })
  if (dbUser?.adminRole !== ADMIN_ROLE.CLUB_PARTNER) return null

  // Resolver clubId pelo padrão de email institucional
  const clubId = deriveClubIdFromEmail(dbUser.email ?? '')
  if (!clubId) return null

  const clubName = await getClubDisplayName(clubId)
  return { userId: session.id, clubId, clubName, adminRole: 'CLUB_PARTNER' }
}

// ---------------------------------------------------------------------------
// withClubAuth — para uso em Server Components e pages
// ---------------------------------------------------------------------------

/**
 * Verifica autenticação e role CLUB_PARTNER.
 * Redireciona para /club/login se não autenticado ou role incorreto.
 * NUNCA aceita clubId de parâmetros externos.
 */
export async function withClubAuth(): Promise<ClubContext> {
  const cookieStore = await cookies()

  // DEV local fallback: usar fs_dev_auth + fs_dev_club_id quando não há sessão Supabase
  if (process.env.NODE_ENV !== 'production') {
    const devAuthRaw = cookieStore.get('fs_dev_auth')?.value
    const devClubId = cookieStore.get('fs_dev_club_id')?.value
    const devAuthEmail = devAuthRaw ? decodeURIComponent(devAuthRaw) : null

    if (devAuthEmail && devClubId) {
      const dbUser = await prisma.user.findUnique({
        where: { email: devAuthEmail },
        select: { id: true, adminRole: true },
      })
      if (dbUser?.adminRole === ADMIN_ROLE.CLUB_PARTNER) {
        const clubName = await getClubDisplayName(devClubId)
        return { userId: dbUser.id, clubId: devClubId, clubName, adminRole: 'CLUB_PARTNER' }
      }
    }
  }

  const session = await readAuthjsSession()

  if (!session?.id) {
    redirect('/club/login')
  }

  // adminRole e email SEMPRE lidos do banco
  const dbUser = await prisma.user.findUnique({
    where: { id: session.id },
    select: { adminRole: true, email: true },
  })

  if (dbUser?.adminRole !== ADMIN_ROLE.CLUB_PARTNER) {
    redirect('/club/login?error=unauthorized')
  }

  // Resolver clubId pelo padrão de email institucional
  const clubId = deriveClubIdFromEmail(dbUser.email ?? '')

  if (!clubId) {
    redirect('/club/login?error=unauthorized')
  }

  const clubName = await getClubDisplayName(clubId)
  return { userId: session.id, clubId, clubName, adminRole: 'CLUB_PARTNER' }
}
