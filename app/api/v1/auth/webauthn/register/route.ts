import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  createRegistrationOptions,
  verifyRegistration,
} from '@/lib/auth/webauthn'
import { authRateLimit } from '@/lib/ratelimit'
import { ERROR_CODES, ERROR_MESSAGES } from '@/lib/constants/errors'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    // ---------- Rate Limit ----------
    if (authRateLimit) {
      const ip =
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
        'unknown'
      const { success } = await authRateLimit.limit(`webauthn:register:${ip}`)
      if (!success) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: ERROR_CODES.SYS_004,
              message: ERROR_MESSAGES[ERROR_CODES.SYS_004],
            },
          },
          { status: 429, headers: { 'Retry-After': '300' } }
        )
      }
    }

    // ---------- Autenticacao ----------
    const authHeader = request.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')

    if (!token) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.AUTH_007,
            message: ERROR_MESSAGES[ERROR_CODES.AUTH_007],
          },
        },
        { status: 401 }
      )
    }

    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token)

    if (authError || !user) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.AUTH_001,
            message: ERROR_MESSAGES[ERROR_CODES.AUTH_001],
          },
        },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { step } = body

    // ---------- Step: init ----------
    if (step === 'init') {
      const options = await createRegistrationOptions(user.id, user.email!)

      // TODO: Armazenar challenge em Redis com TTL de 60s
      // await redis.set(`webauthn:challenge:${user.id}`, options.challenge, { ex: 60 })

      return NextResponse.json(
        { success: true, data: { options } },
        { status: 200 }
      )
    }

    // ---------- Step: verify ----------
    if (step === 'verify') {
      const { response: registrationResponse } = body

      // TODO: Recuperar challenge do Redis
      // const expectedChallenge = await redis.get(`webauthn:challenge:${user.id}`)
      const expectedChallenge = '' // Placeholder — substituir por Redis

      const verification = await verifyRegistration(
        registrationResponse,
        expectedChallenge
      )

      if (!verification.verified || !verification.registrationInfo) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: ERROR_CODES.AUTH_001,
              message: 'Falha na verificacao da credencial.',
            },
          },
          { status: 400 }
        )
      }

      // TODO: Salvar credencial no banco (tabela webauthn_credentials)
      // await prisma.webauthnCredential.create({
      //   data: {
      //     userId: user.id,
      //     credentialId: Buffer.from(verification.registrationInfo.credential.id),
      //     publicKey: Buffer.from(verification.registrationInfo.credential.publicKey),
      //     counter: verification.registrationInfo.credential.counter,
      //     transports: ['internal'],
      //   },
      // })

      return NextResponse.json(
        { success: true, data: { verified: true } },
        { status: 200 }
      )
    }

    return NextResponse.json(
      {
        success: false,
        error: {
          code: ERROR_CODES.VAL_001,
          message: 'Step invalido. Use "init" ou "verify".',
        },
      },
      { status: 400 }
    )
  } catch (error) {
    console.error('[POST /api/v1/auth/webauthn/register] Erro:', error)
    return NextResponse.json(
      {
        success: false,
        error: {
          code: ERROR_CODES.SYS_001,
          message: ERROR_MESSAGES[ERROR_CODES.SYS_001],
        },
      },
      { status: 500 }
    )
  }
}
