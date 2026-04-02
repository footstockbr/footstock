import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ERROR_CODES, ERROR_MESSAGES } from '@/lib/constants/errors'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    // Sempre limpar fallback de auth local em DEV.
    const response = NextResponse.json(
      { success: true, data: null },
      { status: 200 }
    )
    response.cookies.delete('fs_dev_auth')
    response.cookies.delete('fs_dev_admin')

    // ---------- Extrair token ----------
    const authHeader = request.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')

    if (!token) {
      // Em DEV fallback (cookie fs_dev_auth), pode não haver token.
      return response
    }

    // ---------- Identificar usuario pelo token (GAP-003 fix) ----------
    const {
      data: { user },
      error: getUserError,
    } = await supabaseAdmin.auth.getUser(token)

    if (getUserError || !user) {
      // Token ja expirado/invalido — tratar graciosamente
      return response
    }

    // ---------- Sign out via admin ----------
    const { error: signOutError } =
      await supabaseAdmin.auth.admin.signOut(user.id)

    if (signOutError) {
      console.error('[POST /api/v1/auth/logout] Erro ao deslogar:', signOutError.message)
      // Mesmo com erro, retornamos sucesso — o token ja nao sera mais usado
    }

    return response
  } catch (error) {
    console.error('[POST /api/v1/auth/logout] Erro interno:', error)
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
