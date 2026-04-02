import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { forgotPasswordSchema } from '@/lib/schemas/auth.schema'
import { forgotPasswordRateLimit } from '@/lib/ratelimit'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const parsed = forgotPasswordSchema.safeParse(body)
    if (!parsed.success) {
      // Sempre retornar 200 — nunca revelar se email existe
      return NextResponse.json(
        {
          success: true,
          data: {
            message:
              'Se o e-mail estiver cadastrado, voce receberah um link de recuperacao.',
          },
        },
        { status: 200 }
      )
    }

    const { email } = parsed.data

    // ---------- Rate Limit ----------
    if (forgotPasswordRateLimit) {
      const ip =
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
        'unknown'
      const { success } = await forgotPasswordRateLimit.limit(`${ip}:${email}`)
      if (!success) {
        // Mesmo rate limited, retornamos 200 para nao revelar informacao
        return NextResponse.json(
          {
            success: true,
            data: {
              message:
                'Se o e-mail estiver cadastrado, voce receberah um link de recuperacao.',
            },
          },
          { status: 200 }
        )
      }
    }

    // ---------- Enviar email de reset (GAP-002 fix: aponta para UI page) ----------
    await supabaseAdmin.auth.resetPasswordForEmail(email, {
      redirectTo: `${appUrl}/redefinir-senha`,
    })

    // Sempre 200 — independente do resultado
    return NextResponse.json(
      {
        success: true,
        data: {
          message:
            'Se o e-mail estiver cadastrado, voce receberah um link de recuperacao.',
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[POST /api/v1/auth/forgot-password] Erro interno:', error)

    // Mesmo em erro, retornar 200 — seguranca
    return NextResponse.json(
      {
        success: true,
        data: {
          message:
            'Se o e-mail estiver cadastrado, voce receberah um link de recuperacao.',
        },
      },
      { status: 200 }
    )
  }
}
