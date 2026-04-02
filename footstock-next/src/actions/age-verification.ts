'use server'

import { z } from 'zod'
import { calcAge } from '@/lib/utils/validators'
import {
  type ActionResult,
  actionSuccess,
  actionError,
} from '@/lib/action-utils'

const ageVerificationSchema = z.object({
  birthDate: z
    .string()
    .min(1, 'Informe sua data de nascimento.')
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida. Use o formato AAAA-MM-DD.'),
})

/**
 * Verifica se o usuário tem 18+ anos a partir da data de nascimento.
 * Assinatura compatível com useActionState (prevState como primeiro parâmetro).
 */
export async function verifyAgeAction(
  prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const parsed = ageVerificationSchema.safeParse({
    birthDate: formData.get('birthDate'),
  })

  if (!parsed.success) {
    return actionError(
      'Data inválida.',
      parsed.error.flatten().fieldErrors as Record<string, string[]>
    )
  }

  const age = calcAge(parsed.data.birthDate)

  if (age < 18) {
    return actionError(
      'Você precisa ter 18 anos ou mais para usar o Foot Stock.'
    )
  }

  return actionSuccess(undefined, 'Verificação concluída.')
}
