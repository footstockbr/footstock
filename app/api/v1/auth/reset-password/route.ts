import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resetPasswordRateLimit } from '@/lib/ratelimit'
import { ERROR_CODES, ERROR_MESSAGES } from '@/lib/constants/errors'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { token, password, confirmPassword } = body

    // ---------- Validacao basica ----------
    if (!token || !password || !confirmPassword) {
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

    if (password !== confirmPassword) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.VAL_001,
            message: 'As senhas nao coincidem.',
          },
        },
        { status: 400 }
      )
    }

    // ---------- Rate Limit (GAP-004 fix) ----------
    if (resetPasswordRateLimit) {
      const ip =
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
        'unknown'
      const { success } = await resetPasswordRateLimit.limit(ip)
      if (!success) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: ERROR_CODES.SYS_004,
              message: ERROR_MESSAGES[ERROR_CODES.SYS_004],
            },
          },
          { status: 429 }
        )
      }
    }

    // ---------- Verificar token e atualizar senha ----------
    // O token do Supabase e um access_token que permite verificar o usuario
    const {
      data: { user },
      error: verifyError,
    } = await supabaseAdmin.auth.getUser(token)

    if (verifyError || !user) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.AUTH_008,
            message: ERROR_MESSAGES[ERROR_CODES.AUTH_008],
          },
        },
        { status: 401 }
      )
    }

    // Atualizar senha via admin
    const { error: updateError } =
      await supabaseAdmin.auth.admin.updateUserById(user.id, {
        password,
      })

    if (updateError) {
      // Nao vazar mensagem do Supabase (GAP-005 fix)
      console.error('[POST /api/v1/auth/reset-password] Erro ao atualizar:', updateError.message)
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.AUTH_007,
            message: ERROR_MESSAGES[ERROR_CODES.AUTH_007],
          },
        },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { success: true, data: { message: 'Senha redefinida com sucesso.' } },
      { status: 200 }
    )
  } catch (error) {
    console.error('[POST /api/v1/auth/reset-password] Erro interno:', error)
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
