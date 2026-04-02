import { NextRequest, NextResponse } from 'next/server'
import {
  createAuthenticationOptions,
  verifyAuthentication,
} from '@/lib/auth/webauthn'
import { authRateLimit } from '@/lib/ratelimit'
import { ERROR_CODES, ERROR_MESSAGES } from '@/lib/constants/errors'
import prisma from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, step } = body

    // ---------- Rate Limit ----------
    if (authRateLimit) {
      const ip =
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
        'unknown'
      const { success } = await authRateLimit.limit(`webauthn:auth:${ip}`)
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

    if (!email || !step) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.VAL_001,
            message: ERROR_MESSAGES[ERROR_CODES.VAL_001],
          },
        },
        { status: 400 }
      )
    }

    // ---------- Step: init ----------
    if (step === 'init') {
      // GAP-006 fix: usar Prisma findUnique por email (evita listUsers)
      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true },
      })

      if (!user) {
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

      // TODO: Buscar credenciais do banco
      // const credentials = await prisma.webauthnCredential.findMany({
      //   where: { userId: user.id },
      // })
      // const credentialIds = credentials.map((c) => c.credentialId)
      const credentialIds: Uint8Array[] = [] // Placeholder

      if (credentialIds.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: ERROR_CODES.AUTH_001,
              message: 'Nenhuma credencial WebAuthn encontrada para este usuario.',
            },
          },
          { status: 404 }
        )
      }

      const options = await createAuthenticationOptions(credentialIds)

      // TODO: Armazenar challenge em Redis com TTL de 60s
      // await redis.set(`webauthn:auth:challenge:${user.id}`, options.challenge, { ex: 60 })

      return NextResponse.json(
        { success: true, data: { options } },
        { status: 200 }
      )
    }

    // ---------- Step: verify ----------
    if (step === 'verify') {
      const { response: authResponse } = body

      // GAP-006 fix: usar Prisma findUnique por email (evita listUsers)
      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true },
      })

      if (!user) {
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

      // TODO: Recuperar challenge e credencial do Redis/banco
      // const expectedChallenge = await redis.get(`webauthn:auth:challenge:${user.id}`)
      // const credential = await prisma.webauthnCredential.findUnique({
      //   where: { credentialId: Buffer.from(authResponse.id, 'base64url') },
      // })
      const expectedChallenge = '' // Placeholder
      const credentialPublicKey = new Uint8Array() // Placeholder
      const credentialID = new Uint8Array() // Placeholder
      const credentialCounter = 0 // Placeholder

      const verification = await verifyAuthentication(
        authResponse,
        expectedChallenge,
        credentialPublicKey,
        credentialID,
        credentialCounter
      )

      if (!verification.verified) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: ERROR_CODES.AUTH_001,
              message: 'Falha na autenticacao biometrica.',
            },
          },
          { status: 401 }
        )
      }

      // TODO: Atualizar counter da credencial
      // await prisma.webauthnCredential.update({
      //   where: { credentialId: Buffer.from(authResponse.id, 'base64url') },
      //   data: { counter: verification.authenticationInfo.newCounter },
      // })

      // Gerar sessao para o usuario
      // TODO: Gerar token de sessao Supabase via admin API
      return NextResponse.json(
        {
          success: true,
          data: {
            verified: true,
            userId: user.id,
            // session: { accessToken, refreshToken, expiresAt }
          },
        },
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
    console.error('[POST /api/v1/auth/webauthn/authenticate] Erro:', error)
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
