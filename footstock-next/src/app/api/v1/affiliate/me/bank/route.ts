// ============================================================================
// Foot Stock — GET + PATCH /api/v1/affiliate/me/bank
// Leitura e atualização de dados bancários do influenciador afiliado.
// bankData armazenado como JSON criptografado; conta/CNPJ mascarados na leitura.
// Rastreabilidade: INT-084, US-036, TASK-3/ST003
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAffiliateContext } from '@/lib/auth/affiliate-auth'
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
// Tipos
// ---------------------------------------------------------------------------

interface StoredBankData {
  banco: string
  agencia: string
  conta: string
  pixKey: string
  cpfCnpj: string
}

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
  const ctx = await getAffiliateContext()
  if (!ctx) {
    return NextResponse.json(
      { success: false, error: { code: 'AFFILIATE_001', message: 'Sem código de afiliado ativo.' } },
      { status: 403 }
    )
  }

  try {
    const record = await prisma.affiliateCode.findUnique({
      where: { id: ctx.affiliateCodeId },
      select: { bankData: true },
    })

    if (!record?.bankData) {
      return NextResponse.json({ success: true, data: null })
    }

    // Decrypt if encrypted payload, fallback to legacy plaintext
    let stored: StoredBankData
    const raw = record.bankData as unknown as Record<string, unknown>
    if (raw.iv && raw.data && raw.tag) {
      stored = decryptBankData(raw as unknown as EncryptedPayload) as unknown as StoredBankData
    } else {
      stored = raw as unknown as StoredBankData
    }

    return NextResponse.json({
      success: true,
      data: {
        banco: stored.banco,
        agencia: stored.agencia,
        conta: maskAccount(stored.conta),
        pixKey: stored.pixKey,
        cpfCnpj: maskDocument(stored.cpfCnpj ?? (stored as unknown as Record<string, string>).cnpj ?? ''),
      },
    })
  } catch (err) {
    console.error('[affiliate/me/bank GET] error:', err)
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Erro interno.' } },
      { status: 500 }
    )
  }
}

// ---------------------------------------------------------------------------
// PATCH — salva dados bancários
// ---------------------------------------------------------------------------

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const ctx = await getAffiliateContext()
  if (!ctx) {
    return NextResponse.json(
      { success: false, error: { code: 'AFFILIATE_001', message: 'Sem código de afiliado ativo.' } },
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

    await prisma.affiliateCode.update({
      where: { id: ctx.affiliateCodeId },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { bankData: encrypted as any },
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
    console.error('[affiliate/me/bank PATCH] error:', err)
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Erro interno.' } },
      { status: 500 }
    )
  }
}
