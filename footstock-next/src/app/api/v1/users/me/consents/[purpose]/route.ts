// ============================================================================
// FootStock — PATCH /api/v1/users/me/consents/[purpose]
// Concede ou revoga consentimento por finalidade.
// Rastreabilidade: INT-102, US-026, US-M13-001, TASK-1/ST003
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuth, type AuthContext } from '@/app/api/middleware'
import { consentService, type ConsentPurposeKey } from '@/lib/services/ConsentService'
import { LGPDError, LGPD_ERRORS } from '@/lib/errors/lgpd-errors'

const VALID_PURPOSES: ConsentPurposeKey[] = [
  'essential',
  'analytics',
  'marketing',
  'data_terceiros',
]

const schema = z.object({ granted: z.boolean() })

async function handler(
  req: NextRequest,
  { user }: AuthContext,
  { params }: { params: Promise<{ purpose: string }> }
) {
  const { purpose } = await params

  if (!VALID_PURPOSES.includes(purpose as ConsentPurposeKey)) {
    return NextResponse.json(
      { code: LGPD_ERRORS.INVALID_PURPOSE.code, message: LGPD_ERRORS.INVALID_PURPOSE.message },
      { status: LGPD_ERRORS.INVALID_PURPOSE.status }
    )
  }

  let body: { granted: boolean }
  try {
    body = schema.parse(await req.json())
  } catch {
    return NextResponse.json(
      { code: LGPD_ERRORS.INVALID_BODY.code, message: LGPD_ERRORS.INVALID_BODY.message },
      { status: LGPD_ERRORS.INVALID_BODY.status }
    )
  }

  const ip = req.headers.get('x-forwarded-for') ?? undefined
  const userAgent = req.headers.get('user-agent') ?? undefined

  try {
    const consent = body.granted
      ? await consentService.grantConsent(user.id, purpose as ConsentPurposeKey, { ip, userAgent })
      : await consentService.revokeConsent(user.id, purpose as ConsentPurposeKey)

    return NextResponse.json({
      success: true,
      purpose,
      granted: consent.granted,
      revokedAt: consent.revokedAt,
    })
  } catch (e) {
    if (e instanceof LGPDError) {
      return NextResponse.json(
        { code: e.code, message: e.message },
        { status: e.httpStatus }
      )
    }
    throw e
  }
}

export const PATCH = withAuth(handler as never)
