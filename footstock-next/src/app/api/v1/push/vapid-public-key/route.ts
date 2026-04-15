import { ok, errors } from '@/lib/api'

// GET /api/v1/push/vapid-public-key — publico, sem autenticacao
// Permite que clients obtenham a chave VAPID sem dependar de env embedada no bundle.
// Util para rotacao de chave sem rebuild e para contratos multi-frontend.
export async function GET() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

  if (!publicKey) {
    return errors.server('VAPID_PUBLIC_KEY não configurada.')
  }

  return ok({ vapidPublicKey: publicKey })
}
