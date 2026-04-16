// ============================================================================
// FootStock — GET /api/cron/affiliate-commission
// Cron job diário: processa comissões PENDING de afiliados para PAID.
// Autenticado via CRON_SECRET header (Vercel Cron).
// Idempotente: transações já PAID ou PROCESSING não são reprocessadas.
// Rastreabilidade: T-001 (Gap 4), US-036, US-037, NOTIFICATION-SPEC
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendNotification } from '@/lib/services/NotificationService'
import { NOTIFICATION_TYPE } from '@/lib/enums'

const BATCH_SIZE = 100 // processar N transações por execução

export async function GET(request: NextRequest) {
  // ── Autenticação: CRON_SECRET (Vercel Cron ou teste manual) ────────────────
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = new Date()
  let processed = 0
  let errors = 0
  const notifiedAffiliates = new Set<string>()
  // Mapa: affiliateUserId → soma de FS$ realmente creditados nesta execução (só sucessos)
  const successAmountByAffiliate = new Map<string, number>()

  try {
    // Buscar transações PENDING em lotes
    // Corte: createdAt < agora (segurança para não processar transações recém-criadas)
    const pendingTransactions = await prisma.affiliateTransaction.findMany({
      where: {
        status: 'PENDING',
        createdAt: { lt: startedAt },
      },
      take: BATCH_SIZE,
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        affiliateCodeId: true,
        amount: true,
        affiliateCode: {
          select: {
            userId: true,
            commissionPercentage: true,
          },
        },
      },
    })

    if (pendingTransactions.length === 0) {
      return NextResponse.json({
        ok: true,
        processed: 0,
        message: 'Nenhuma comissão pendente',
        duration_ms: Date.now() - startedAt.getTime(),
      })
    }

    // Processar cada transação individualmente (isolamento — falha de uma não bloqueia outras)
    for (const tx of pendingTransactions) {
      try {
        await prisma.$transaction(async (trx) => {
          // Marcar como PAID (updateMany com id + status para guard atômico)
          const updated = await trx.affiliateTransaction.updateMany({
            where: { id: tx.id, status: 'PENDING' },
            data: { status: 'PAID', paidAt: new Date() },
          })
          // Se count=0, status mudou entre fetch e update (race condition ou already voided)
          if (updated.count === 0) return

          // Creditar FS$ na carteira do afiliado
          await trx.user.update({
            where: { id: tx.affiliateCode.userId },
            data: { fsBalance: { increment: Number(tx.amount) } },
          })
        })

        processed++

        // Acumular apenas valores realmente processados com sucesso para notificação correta
        const prevAmount = successAmountByAffiliate.get(tx.affiliateCode.userId) ?? 0
        successAmountByAffiliate.set(tx.affiliateCode.userId, prevAmount + Number(tx.amount))
      } catch (txErr) {
        errors++
        console.error('[cron/affiliate] Erro ao processar transação:', tx.id, txErr)
        // Continuar para próxima — não abortar o lote inteiro
      }
    }

    // Notificar afiliados com valores realmente creditados (pós-loop, somente sucessos)
    for (const [affiliateUserId, totalAmountFs] of successAmountByAffiliate.entries()) {
      try {
        await sendNotification(
          affiliateUserId,
          NOTIFICATION_TYPE.AFFILIATE_COMMISSION_EARNED,
          {
            title: 'Comissão creditada!',
            body: `FS$${totalAmountFs.toFixed(0)} foram creditados na sua carteira.`,
            metadata: {
              amountFs: totalAmountFs,
              source: 'affiliate_cron',
              batchDate: startedAt.toISOString(),
            },
          }
        )
        notifiedAffiliates.add(affiliateUserId)
      } catch (notifErr) {
        console.error('[cron/affiliate] Falha ao notificar:', affiliateUserId, notifErr)
      }
    }

    const duration = Date.now() - startedAt.getTime()

    console.log(
      `[cron/affiliate] Concluído: ${processed} comissões pagas, ${errors} erros, ${notifiedAffiliates.size} afiliados notificados (${duration}ms)`
    )

    return NextResponse.json({
      ok: true,
      processed,
      errors,
      affiliates_notified: notifiedAffiliates.size,
      duration_ms: duration,
    })
  } catch (err) {
    console.error('[cron/affiliate] Erro geral:', err)
    return NextResponse.json(
      { ok: false, error: 'Erro interno no cron de comissões' },
      { status: 500 }
    )
  }
}
