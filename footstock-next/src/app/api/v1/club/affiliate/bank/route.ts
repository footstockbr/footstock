// ============================================================================
// Foot Stock — GET + PATCH /api/v1/club/affiliate/bank
// Dados bancários do clube parceiro para repasse de royalties.
// Dados criptografados via AES-256-GCM em repouso.
// Rastreabilidade: US-036 [SUCCESS] cenário 2, GAP-002 (auditoria module-25)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getClubContext } from '@/lib/auth/club-auth'
import { prisma } from '@/lib/prisma'
import { encryptBankData, decryptBankData, type EncryptedPayload } from '@/lib/affiliate/bank-crypto'
import { validateCpfCnpj } from '@/lib/utils/validate-document'

// ---------------------------------------------------------------------------
// Schema Zod
// ---------------------------------------------------------------------------

const bankDataSchema = z.object({
  banco: z.string().min(1, 'Banco obrigatório'),
  agencia: z.string().regex(/^\d{1,6}-?\d?$/, 'Agência inválida'),
  conta: z.string().regex(/^\d{1,12}-?\d?$/, 'Conta inválida'),
  pixKey: z.string().min(1, 'Chave PIX obrigatória'),
  cpfCnpj: z.string().refine(validateCpfCnpj, 'CPF/CNPJ inválido'),
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function maskAccount(conta: string): string {
  const digits = conta.replace(/\D/g, '')
  if (digits.length <= 4) return conta
  return `****${digits.slice(-4)}`
}

function maskDocument(doc: string): string {
  const d = doc.replace(/\D/g, '')
  if (d.length === 11) return `***.***.${d.slice(6, 9)}-${d.slice(9)}`
  if (d.length === 14) return `${d.slice(0, 2)}.***.***/****-${d.slice(12)}`
  return doc
}

// ---------------------------------------------------------------------------
// GET — retorna dados mascarados
// ---------------------------------------------------------------------------

export async function GET(): Promise<NextResponse> {
  const ctx = await getClubContext()
  if (!ctx) {
    return NextResponse.json(
      { success: false, error: { code: 'ADMIN_050', message: 'Permissão insuficiente.' } },
      { status: 403 }
    )
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const record = await (prisma as any).clubPartner.findUnique({
      where: { clubId: ctx.clubId },
      select: { bankData: true },
    })

    if (!record?.bankData) {
      return NextResponse.json({ success: true, data: null })
    }

    const stored = decryptBankData(record.bankData as unknown as EncryptedPayload) as {
      banco: string; agencia: string; conta: string; pixKey: string; cpfCnpj: string
    }

    return NextResponse.json({
      success: true,
      data: {
        banco: stored.banco,
        agencia: stored.agencia,
        conta: maskAccount(stored.conta),
        pixKey: stored.pixKey,
        cpfCnpj: maskDocument(stored.cpfCnpj),
      },
    })
  } catch (err) {
    console.error('[club/affiliate/bank GET] error:', err)
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Erro interno.' } },
      { status: 500 }
    )
  }
}

// ---------------------------------------------------------------------------
// PATCH — salva dados bancários criptografados
// ---------------------------------------------------------------------------

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const ctx = await getClubContext()
  if (!ctx) {
    return NextResponse.json(
      { success: false, error: { code: 'ADMIN_050', message: 'Permissão insuficiente.' } },
      { status: 403 }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_JSON', message: 'Corpo inválido.' } },
      { status: 400 }
    )
  }

  const parsed = bankDataSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return NextResponse.json(
      { success: false, error: { code: 'AFFILIATE_002', message: first?.message ?? 'Dados inválidos.' } },
      { status: 422 }
    )
  }

  try {
    const encrypted = encryptBankData(parsed.data)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any).clubPartner.upsert({
      where: { clubId: ctx.clubId },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      update: { bankData: encrypted as any },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      create: { clubId: ctx.clubId, bankData: encrypted as any },
    })

    return NextResponse.json({
      success: true,
      data: {
        banco: parsed.data.banco,
        agencia: parsed.data.agencia,
        conta: maskAccount(parsed.data.conta),
        pixKey: parsed.data.pixKey,
        cpfCnpj: maskDocument(parsed.data.cpfCnpj),
      },
    })
  } catch (err) {
    console.error('[club/affiliate/bank PATCH] error:', err)
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Erro interno.' } },
      { status: 500 }
    )
  }
}
