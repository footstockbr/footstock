import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/auth'
import { ok, error, errors } from '@/lib/api'
import { deleteAccount } from '@/lib/services/account-deletion'
import { subscriptionService } from '@/lib/services/SubscriptionService'

const DeleteSchema = z.object({
  reason: z.string().min(3).max(500).optional().default('Solicitação do usuário'),
  confirmEmail: z.string().email(),
})

// DELETE /api/v1/users/me/delete — Direito ao esquecimento LGPD Art. 18
export async function DELETE(request: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  try {
    const body = await request.json()
    const parsed = DeleteSchema.safeParse(body)
    if (!parsed.success) {
      return errors.validation('Informe confirmEmail com seu e-mail atual para confirmar a exclusão.')
    }

    const { reason, confirmEmail } = parsed.data

    // Confirmar identidade: e-mail deve bater com o usuário autenticado
    if (confirmEmail.toLowerCase() !== auth.user.email?.toLowerCase()) {
      return error(
        'LGPD_010',
        'O e-mail informado não corresponde à sua conta.',
        400
      )
    }

    // Cancelar assinatura ativa antes de anonimizar
    try {
      await subscriptionService.cancelSubscription(auth.user.id)
    } catch {
      // Sem assinatura ativa — não bloquear exclusão
    }

    // Anonimizar dados conforme LGPD Art. 18
    const result = await deleteAccount(auth.user.id, reason)

    return ok({
      message: result.message,
      anonymizedAt: result.anonymizedAt,
    })
  } catch {
    return errors.server()
  }
}
