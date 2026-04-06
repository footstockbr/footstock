// ============================================================================
// Foot Stock — DataExportService
// Direito à portabilidade LGPD (TASK-2/ST003)
// Gera ZIP (JSON+CSV) e envia por email via Resend
// Rastreabilidade: INT-103, US-027
// ============================================================================

import path from 'path'
import fs from 'fs/promises'
import os from 'os'
import { prisma } from '@/lib/prisma'
import { consentService } from '@/lib/services/ConsentService'

// ─── Helper: CSV simples ──────────────────────────────────────────────────────

function toCsv(items: Record<string, unknown>[]): string {
  if (items.length === 0) return ''
  const first = items[0]
  if (!first) return ''
  const headers = Object.keys(first)
  const rows = items.map(row =>
    headers.map(h => {
      const val = row[h]
      if (val === null || val === undefined) return ''
      const str = String(val)
      return str.includes(',') || str.includes('"') || str.includes('\n')
        ? `"${str.replace(/"/g, '""')}"`
        : str
    }).join(',')
  )
  return [headers.join(','), ...rows].join('\n')
}

// ─── Helper: ZIP usando JSZip ────────────────────────────────────────────────

async function createZip(files: Record<string, string>): Promise<Buffer> {
  try {
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()
    for (const [name, content] of Object.entries(files)) {
      zip.file(name, content)
    }
    const blob = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
    return Buffer.from(blob)
  } catch {
    // Fallback se jszip não estiver disponível: arquivo texto concatenado
    const combined = Object.entries(files)
      .map(([name, content]) => `\n=== ${name} ===\n${content}`)
      .join('\n')
    return Buffer.from(combined, 'utf-8')
  }
}

// ─── Helper: coletar dados do usuário ─────────────────────────────────────────

async function collectUserData(userId: string) {
  const [profile, orders, positions, transactions, subscriptions, consents] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        email: true,
        phone: true,
        birthDate: true,
        favoriteClub: true,
        investorProfile: true,
        planType: true,
        createdAt: true,
        // Excluir: cpfHash (dado técnico irreversível), adminRole, passwordHash
      },
    }),
    prisma.order.findMany({
      where: { userId, createdAt: { gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) } },
      select: { id: true, type: true, side: true, status: true, quantity: true, price: true, createdAt: true },
    }),
    prisma.position.findMany({
      where: { userId },
      select: { id: true, assetId: true, quantity: true, avgPrice: true },
    }),
    prisma.transaction.findMany({
      where: { userId },
      select: { id: true, type: true, financialType: true, side: true, quantity: true, price: true, fee: true, totalAmount: true, fsAmount: true, createdAt: true },
    }),
    prisma.subscription.findMany({
      where: { userId },
      select: { id: true, planType: true, status: true, startsAt: true, expiresAt: true },
    }),
    consentService.getConsents(userId),
  ])

  const financial = await prisma.user.findUnique({
    where: { id: userId },
    select: { fsBalance: true, planType: true },
  })

  return {
    profile,
    financial: { fsBalance: financial?.fsBalance, planType: financial?.planType },
    orders,
    positions,
    transactions,
    subscriptions,
    consents,
  }
}

// ─── Helper: salvar arquivo ───────────────────────────────────────────────────

async function saveExportFile(userId: string, buffer: Buffer) {
  const dir = path.join(os.tmpdir(), 'footstock-exports')
  await fs.mkdir(dir, { recursive: true })
  const fileName = `export-${userId}-${Date.now()}.zip`
  const filePath = path.join(dir, fileName)
  await fs.writeFile(filePath, buffer)

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const downloadUrl = `${baseUrl}/api/v1/users/me/export/download?file=${fileName}`
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  return { filePath, downloadUrl, expiresAt }
}

// ─── Helper: enviar email ─────────────────────────────────────────────────────

async function sendExportEmail(to: string, downloadUrl: string, expiresAt: Date) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[DataExportService] RESEND_API_KEY não configurado. Email não enviado para:', to)
    return
  }

  const { Resend } = await import('resend')
  const resend = new Resend(apiKey)
  const from = process.env.RESEND_FROM_EMAIL ?? 'noreply@footstock.app'
  const expiresStr = expiresAt.toLocaleDateString('pt-BR')

  await resend.emails.send({
    from: `Foot Stock <${from}>`,
    to,
    subject: 'Seus dados do Foot Stock estão prontos',
    html: `
      <h2>Seus dados estão prontos para download</h2>
      <p>Você solicitou a exportação dos seus dados pessoais conforme a LGPD.</p>
      <p><a href="${downloadUrl}" style="padding: 12px 24px; background: #16a34a; color: white; text-decoration: none; border-radius: 6px;">
        Baixar meus dados
      </a></p>
      <p>Este link expira em <strong>${expiresStr}</strong>.</p>
      <p>Em caso de dúvidas, entre em contato: <a href="mailto:privacy@footstock.com.br">privacy@footstock.com.br</a></p>
    `,
  })
}

// ─── Service ─────────────────────────────────────────────────────────────────

class DataExportService {
  /**
   * Processa job de export assíncrono.
   * Chamado em background (fire-and-forget) após POST /export.
   */
  async processExportJob(jobId: string): Promise<void> {
    await prisma.dataExportJob.update({ where: { id: jobId }, data: { status: 'PROCESSING' } })

    try {
      const job = await prisma.dataExportJob.findUniqueOrThrow({ where: { id: jobId } })
      const userData = await collectUserData(job.userId)

      const jsonContent = JSON.stringify(userData, null, 2)
      const ordersCsv = toCsv(userData.orders as Record<string, unknown>[])
      const transactionsCsv = toCsv(userData.transactions as Record<string, unknown>[])
      const profileCsv = toCsv(userData.profile ? [userData.profile as Record<string, unknown>] : [])

      const positionsCsv = toCsv(userData.positions as Record<string, unknown>[])

      const zipBuffer = await createZip({
        'data.json': jsonContent,
        'orders.csv': ordersCsv,
        'transactions.csv': transactionsCsv,
        'positions.csv': positionsCsv,
        'profile.csv': profileCsv,
      })

      const { filePath, downloadUrl, expiresAt } = await saveExportFile(job.userId, zipBuffer)

      const profile = await prisma.user.findUnique({
        where: { id: job.userId },
        select: { email: true },
      })

      if (profile?.email) {
        await sendExportEmail(profile.email, downloadUrl, expiresAt)
      }

      await prisma.dataExportJob.update({
        where: { id: jobId },
        data: {
          status: 'COMPLETED',
          filePath,
          downloadUrl,
          expiresAt,
          completedAt: new Date(),
        },
      })
    } catch (error) {
      await prisma.dataExportJob.update({
        where: { id: jobId },
        data: { status: 'FAILED', error: String(error) },
      })
    }
  }
}

export const dataExportService = new DataExportService()
export { collectUserData }
