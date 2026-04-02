import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { CardUpdaterService } from '@/lib/services/CardUpdaterService'

/** GET /api/cron/card-updater — Job de detecção de cartões expirando (executado pelo Vercel Cron) */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    // Buscar assinaturas ativas com dados de cartão
    const subscriptions = await (prisma as any).subscriptions?.findMany({
      where: { status: 'ACTIVE' },
      include: { user: { select: { id: true, email: true } } },
    }) ?? []

    let notified = 0
    let atRisk = 0

    for (const sub of subscriptions) {
      const { expiryMonth, expiryYear } = (sub as any)
      if (!expiryMonth || !expiryYear) continue

      if (CardUpdaterService.isExpiringSoon(expiryMonth, expiryYear)) {
        // Criar notificação para o usuário
        await (prisma as any).notification?.create({
          data: {
            userId: sub.userId,
            type: 'PAYMENT',
            title: 'Cartão expirando em breve',
            body: `Seu cartão expira em ${CardUpdaterService.daysUntilExpiry(expiryMonth, expiryYear)} dias. Atualize para manter sua assinatura ativa.`,
          },
        }).catch(() => null)
        notified++
      }

      if (CardUpdaterService.isExpired(expiryMonth, expiryYear)) {
        // Marcar assinatura como at_risk
        await (prisma as any).subscriptions?.update({
          where: { id: sub.id },
          data: { status: 'AT_RISK' } as any,
        }).catch(() => null)
        atRisk++
      }
    }

    return NextResponse.json({ success: true, notified, atRisk, checked: subscriptions.length })
  } catch (error) {
    console.error('[CardUpdater Cron]', error)
    return NextResponse.json({ error: 'Erro no card updater' }, { status: 500 })
  }
}
