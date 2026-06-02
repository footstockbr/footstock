/**
 * Corrige manualmente o planType de um usuário para LENDA.
 * Uso:
 *   dotenv -e .env -- npx tsx scripts/fix-user-plan.ts
 *
 * Variáveis de ambiente:
 *   FIX_USER_EMAIL  — email do usuário a corrigir (obrigatório)
 *   FIX_PLAN        — plano alvo: LENDA | CRAQUE (default: LENDA)
 *   DRY_RUN         — qualquer valor não vazio → só lê, não grava
 *
 * Diagnostica também o último webhook audit log do usuário.
 */
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma  = new PrismaClient({ adapter, log: ['error'] })

const TARGET_EMAIL = process.env.FIX_USER_EMAIL ?? 'corgnati.pedro@gmail.com'
const TARGET_PLAN  = (process.env.FIX_PLAN ?? 'LENDA') as 'LENDA' | 'CRAQUE'
const DRY_RUN      = Boolean(process.env.DRY_RUN)

async function main() {
  console.log(`[fix-user-plan] email=${TARGET_EMAIL} plan=${TARGET_PLAN} dry=${DRY_RUN}\n`)

  const user = await prisma.user.findUnique({
    where: { email: TARGET_EMAIL },
    select: { id: true, email: true, planType: true, adminRole: true, userType: true },
  })

  if (!user) {
    console.error(`Usuário não encontrado: ${TARGET_EMAIL}`)
    process.exit(1)
  }

  console.log('Usuário encontrado:')
  console.log(`  id:        ${user.id}`)
  console.log(`  email:     ${user.email}`)
  console.log(`  planType:  ${user.planType ?? '(null)'}`)
  console.log(`  adminRole: ${user.adminRole ?? '(null)'}`)
  console.log(`  userType:  ${user.userType}`)
  console.log()

  if (user.adminRole) {
    console.warn(`⚠️  ATENÇÃO: usuário tem adminRole=${user.adminRole}`)
    console.warn(`   O webhook rejeita ativação de plano para contas admin (AUTH-009).`)
    console.warn(`   Este script faz o fix direto no DB ignorando essa restrição.\n`)
  }

  // Diagnóstico: últimos webhook audit logs do usuário
  const recentSubs = await prisma.subscription.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { id: true, planType: true, status: true, gateway: true, createdAt: true, amount: true },
  })

  console.log(`Assinaturas recentes (${recentSubs.length}):`)
  for (const s of recentSubs) {
    console.log(`  ${s.status.padEnd(20)} ${s.planType.padEnd(8)} ${s.gateway.padEnd(15)} ${s.createdAt.toISOString().slice(0, 19)} amount=${s.amount}`)
  }
  console.log()

  // Webhook audit (últimos 5)
  const webhookLogs = await prisma.webhookAuditLog.findMany({
    orderBy: { processedAt: 'desc' },
    take: 8,
    select: { id: true, gateway: true, status: true, eventType: true, errorMessage: true, processedAt: true, transactionId: true },
  })

  console.log(`Últimos webhook audit logs (${webhookLogs.length}):`)
  for (const w of webhookLogs) {
    console.log(`  ${w.status.padEnd(12)} ${(w.eventType ?? '-').padEnd(20)} ${w.gateway.padEnd(15)} ${w.processedAt?.toISOString().slice(0, 19) ?? '-'}`)
    if (w.errorMessage) console.log(`    └ ${w.errorMessage}`)
  }
  console.log()

  if (user.planType === TARGET_PLAN) {
    console.log(`✅ Usuário já está no plano ${TARGET_PLAN}. Nenhuma alteração necessária.`)
    process.exit(0)
  }

  if (DRY_RUN) {
    console.log(`[dry-run] Aplicaria: user.planType ${user.planType ?? 'null'} → ${TARGET_PLAN}`)
    console.log(`[dry-run] Criaria subscription ACTIVE ${TARGET_PLAN} para ${user.email}`)
    process.exit(0)
  }

  const now       = new Date()
  const expiresAt = new Date(now)
  expiresAt.setFullYear(expiresAt.getFullYear() + 1)

  await prisma.$transaction(async (tx) => {
    // Cancela assinaturas em estado não-terminal
    const cancelled = await tx.subscription.updateMany({
      where: {
        userId: user.id,
        status: { in: ['ACTIVE', 'TRIAL', 'PENDING', 'PAST_DUE', 'CANCELLATION_LOCK'] },
      },
      data: { status: 'CANCELLED', cancelledAt: now },
    })
    if (cancelled.count > 0) {
      console.log(`  Canceladas ${cancelled.count} sub(s) anteriores`)
    }

    // Cria nova sub ACTIVE manual
    const sub = await tx.subscription.create({
      data: {
        userId:    user.id,
        planType:  TARGET_PLAN,
        gateway:   'MERCADO_PAGO',
        period:    'YEARLY',
        amount:    0,
        status:    'ACTIVE',
        startsAt:  now,
        expiresAt,
      },
    })
    console.log(`  Subscription ACTIVE criada: ${sub.id}`)

    // Atualiza planType do usuário
    await tx.user.update({
      where: { id: user.id },
      data: { planType: TARGET_PLAN },
    })
    console.log(`  user.planType atualizado: ${user.planType ?? 'null'} → ${TARGET_PLAN}`)
  })

  console.log(`\n✅ Concluído. ${user.email} agora está no plano ${TARGET_PLAN}.`)
  console.log(`   Peça ao usuário para fazer logout e login novamente para atualizar a sessão.`)

  await prisma.$disconnect()
}

main().catch(err => {
  console.error('[fix-user-plan] Erro fatal:', err)
  process.exit(1)
})
