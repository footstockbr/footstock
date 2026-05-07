// ============================================================================
// FootStock — SSE Endpoint /api/v1/market/stream (DEPRECATED)
// DEPRECATED 2026-05-06: SSE market streaming migrado para o motor Railway.
// Este endpoint será removido na sprint seguinte. Use diretamente:
//   GET {NEXT_PUBLIC_STREAM_URL}/market  (ex: https://stream.footstock.com.br/market)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

const DEPRECATED_SINCE = '2026-05-06'
const NEW_URL = process.env.NEXT_PUBLIC_STREAM_URL
  ? `${process.env.NEXT_PUBLIC_STREAM_URL}/market`
  : 'https://stream.footstock.com.br/market'

function deprecatedHandler(req: NextRequest): NextResponse {
  // Preferir 301 redirect para clients compatíveis; fallback JSON para EventSource
  const accept = req.headers.get('accept') ?? ''
  const isEventSource = accept.includes('text/event-stream')

  if (isEventSource) {
    // EventSource não segue redirects automaticamente; retorna JSON com new_url
    return NextResponse.json(
      {
        deprecated: true,
        since: DEPRECATED_SINCE,
        new_url: NEW_URL,
        message: 'Este endpoint foi migrado para o motor Railway. Atualize sua URL de streaming.',
      },
      {
        status: 410,
        headers: {
          'Content-Type': 'application/json',
          'Sunset': DEPRECATED_SINCE,
        },
      }
    )
  }

  // Clients HTTP comuns: redirect permanente
  return NextResponse.redirect(NEW_URL, {
    status: 301,
    headers: {
      'Sunset': DEPRECATED_SINCE,
      'Deprecation': 'true',
    },
  })
}

export const GET = deprecatedHandler
