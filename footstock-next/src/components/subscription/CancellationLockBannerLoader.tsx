// ============================================================================
// CancellationLockBannerLoader — Server Component
// Busca assinatura do usuário autenticado e exibe banner se em CANCELLATION_LOCK
// Renderizado no layout (app) para cobertura 100% das páginas autenticadas
// ============================================================================

import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { CancellationLockBanner } from './CancellationLockBanner'

export async function CancellationLockBannerLoader() {
  const auth = await getAuthUser()
  if (!auth) return null

  const sub = await prisma.subscription.findFirst({
    where: { userId: auth.user.id, status: 'CANCELLATION_LOCK' },
    orderBy: { createdAt: 'desc' },
    select: { planType: true, cancellationLockExpiresAt: true },
  })

  if (!sub || !sub.cancellationLockExpiresAt) return null

  return (
    <CancellationLockBanner
      planType={sub.planType}
      cancellationLockExpiresAt={sub.cancellationLockExpiresAt.toISOString()}
    />
  )
}
