import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/auth'
import { pushSubscriptionRepository } from '@/lib/repositories/PushSubscriptionRepository'
import { ok, errors } from '@/lib/api'

const UnsubscribeSchema = z.object({
  endpoint: z.string().url({ message: 'Formato inválido para o campo endpoint.' }),
})

// DELETE /api/v1/push/unsubscribe
// @deprecated — usar DELETE /api/v1/push/subscribe (contrato canonico T-002)
// Alias de compatibilidade — remover quando todos os clients migrarem.
export async function DELETE(req: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return errors.validation('Corpo da requisição inválido.')
  }

  const parsed = UnsubscribeSchema.safeParse(body)
  if (!parsed.success) {
    return errors.validation('Campo obrigatório não informado.')
  }

  try {
    // Idempotente: não falha se subscription não existia
    await pushSubscriptionRepository.deleteByEndpoint(auth.user.id, parsed.data.endpoint)
    return ok({ success: true })
  } catch {
    return errors.server()
  }
}
