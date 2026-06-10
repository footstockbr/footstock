import { NextResponse } from 'next/server'

/**
 * GET /api/cron/card-updater — detecção de cartões expirando.
 *
 * NO-OP HONESTO. A versão anterior consultava `prisma.subscriptions` (modelo
 * inexistente — é `subscription`) e campos `expiryMonth`/`expiryYear` que NÃO
 * existem no schema. O optional-chaining curto-circuitava para `[]`, então o job
 * sempre retornava `checked:0` fingindo sucesso.
 *
 * Não armazenamos dados de cartão (responsabilidade do gateway — PCI-DSS). A
 * expiração e a recobrança são tratadas pelo próprio gateway + pelo fluxo de
 * dunning (`/api/cron/dunning`, que reage a PAYMENT_FAILED do webhook). Mantemos
 * o endpoint (a entrada de cron pode apontar para cá) como no-op explícito até
 * que exista integração real com a metadata de cartão do gateway.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  return NextResponse.json({
    success: true,
    noop: true,
    reason:
      'Expiração de cartão é tratada pelo gateway/dunning; não armazenamos dados de cartão (PCI).',
    notified: 0,
    atRisk: 0,
    checked: 0,
  })
}
