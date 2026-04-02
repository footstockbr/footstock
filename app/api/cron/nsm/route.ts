// ============================================================================
// Foot Stock — Cron NSM (North Star Metric)
// Conta ordens FILLED do dia, persiste historico, alerta admin se < 50%.
// Executar diariamente via Vercel Cron ou similar.
// Protegido por Bearer CRON_SECRET.
// Rastreabilidade: G024
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendNotification } from '@/lib/services/NotificationService'
import { NOTIFICATION_TYPE } from '@/lib/enums'

const NSM_TARGET = 500

export async function GET(request: NextRequest) {
  // Validar CRON_SECRET
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) {
    console.error('[cron/nsm] CRON_SECRET nao configurado')
    return NextResponse.json({ error: 'CRON_SECRET nao configurado' }, { status: 401 })
  }

  if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  try {
    // Contar ordens FILLED do dia (UTC)
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)

    const tomorrow = new Date(today)
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)

    const filledOrders = await prisma.order.count({
      where: {
        status: 'FILLED',
        updatedAt: { gte: today, lt: tomorrow },
      },
    })

    const percentage = (filledOrders / NSM_TARGET) * 100

    // Persistir historico diario (upsert para idempotencia)
    await prisma.nsmDailyRecord.upsert({
      where: { date: today },
      create: {
        date: today,
        filledOrders,
        target: NSM_TARGET,
        percentage,
        alertSent: percentage < 50,
      },
      update: {
        filledOrders,
        percentage,
      },
    })

    // Alerta admin se < 50% do target
    if (percentage < 50) {
      const admins = await prisma.user.findMany({
        where: { adminRole: { not: null } },
        select: { id: true },
      })

      for (const admin of admins) {
        await sendNotification(admin.id, NOTIFICATION_TYPE.ADMIN_BROADCAST, {
          title: 'NSM Alerta: Ordens abaixo de 50%',
          body: `Apenas ${filledOrders} ordens executadas hoje (${percentage.toFixed(1)}% do target de ${NSM_TARGET}). Acao necessaria.`,
        })
      }

      console.warn(`[cron/nsm] ALERTA: ${filledOrders}/${NSM_TARGET} (${percentage.toFixed(1)}%)`)
    }

    console.log(`[cron/nsm] ${today.toISOString().slice(0, 10)}: ${filledOrders}/${NSM_TARGET} (${percentage.toFixed(1)}%)`)

    return NextResponse.json({
      date: today.toISOString().slice(0, 10),
      filledOrders,
      target: NSM_TARGET,
      percentage: Math.round(percentage * 10) / 10,
      alertSent: percentage < 50,
    })
  } catch (err) {
    console.error('[cron/nsm] Erro:', err)
    return NextResponse.json({ error: 'Erro interno no job NSM' }, { status: 500 })
  }
}
