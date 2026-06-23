// GET /api/cron/notification-email-retry — Cron de reprocessamento de email transacional
// Rastreabilidade: FIX-25 (loop 06-22-footstock-financeiro-planos, Task 11 > "Falha de email")
//
// Varre notificações com email_status in (pending, failed) — envio nunca concluído
// (crash/timeout no path síncrono) ou falho — e re-tenta o email. Idempotente pela
// mesma idempotency_key: NÃO cria nova notificação, apenas re-tenta o envio e atualiza
// email_status para 'sent' (com provider_id) ou mantém 'failed' (com error). Estados
// 'sent' e 'na' são terminais e ignorados pela varredura.
//
// Agendamento (schedule) é responsabilidade do motor/scheduler externo (fora deste repo).

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { emailNotificationService } from '@/lib/services/EmailNotificationService'

const BATCH_SIZE = 100

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const pending = await prisma.notification.findMany({
      where: { emailStatus: { in: ['pending', 'failed'] } },
      include: { user: { select: { email: true } } },
      orderBy: { createdAt: 'asc' },
      take: BATCH_SIZE,
    })

    let sent = 0
    let stillFailed = 0

    for (const n of pending) {
      const result = await emailNotificationService.sendForTypeResult(n.type, n.user.email, {
        title: n.title,
        body: n.body,
      })
      // Estado parcial proibido: 'sent' exige provider_id.
      if (result.status === 'sent' && result.providerId) {
        await prisma.notification.update({
          where: { id: n.id },
          data: { emailStatus: 'sent', emailProviderId: result.providerId, emailError: null },
        })
        sent++
      } else {
        await prisma.notification.update({
          where: { id: n.id },
          data: { emailStatus: 'failed', emailError: result.error ?? 'envio não confirmado pelo provider' },
        })
        stillFailed++
      }
    }

    return NextResponse.json({ success: true, processed: pending.length, sent, stillFailed })
  } catch (err) {
    console.error('[cron/notification-email-retry] Erro:', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}
