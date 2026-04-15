// GET|PUT /api/v1/users/me/notification-preferences
// module-19 — Preferências de notificação por tipo (23 tipos), persistidas no DB
// Urgentes não podem ser desabilitadas (label "Obrigatória" no frontend)
// Rastreabilidade: T-014, NOTIFICATION-SPEC.md

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/auth'
import { notificationRepository } from '@/lib/repositories/NotificationRepository'
import { ok, errors, error as apiError } from '@/lib/api'
import { NOTIFICATION_TYPE } from '@/lib/enums'

// Tipos urgentes que não podem ser desabilitados
const ALWAYS_ON_TYPES = new Set([
  'MARGIN_CALL_ALERT',
  'CIRCUIT_BREAKER',
  'CANCELLATION_LOCK_ACTIVE',
  'CANCELLATION_LOCK_LIQUIDATED',
  'PASSWORD_RESET',
  'ACCOUNT_DELETED',
  'BRUTE_FORCE_BLOCKED',
  'ADMIN_BROADCAST',
  'PAYMENT_FAILED',
  'ORDER_EXECUTED',
])

const ALL_TYPES = Object.values(NOTIFICATION_TYPE)

const PreferenceItemSchema = z.object({
  notificationType: z.string().refine((v) => ALL_TYPES.includes(v as never), {
    message: 'Tipo de notificação inválido.',
  }),
  inAppEnabled: z.boolean().optional(),
  pushEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
})

const PutSchema = z.array(PreferenceItemSchema)

/** GET /api/v1/users/me/notification-preferences */
export async function GET() {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  try {
    const dbPrefs = await notificationRepository.getPreferences(auth.user.id)

    // Retornar todos os 23 tipos com defaults (true) para tipos sem preferência salva
    const result = ALL_TYPES.map((type) => {
      const saved = dbPrefs[type]
      const isUrgent = ALWAYS_ON_TYPES.has(type)
      return {
        notificationType: type,
        inAppEnabled: isUrgent ? true : (saved?.inApp ?? true),
        pushEnabled: isUrgent ? true : (saved?.push ?? true),
        emailEnabled: isUrgent ? true : (saved?.email ?? true),
        isUrgent,
      }
    })

    return ok(result)
  } catch {
    return errors.server()
  }
}

/** PUT /api/v1/users/me/notification-preferences */
export async function PUT(request: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errors.validation()
  }

  const parsed = PutSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('VAL_001', 'Body deve ser array de preferências válidas.', 400)
  }

  try {
    for (const pref of parsed.data) {
      if (ALWAYS_ON_TYPES.has(pref.notificationType)) continue // Urgentes não podem ser alterados

      await notificationRepository.upsertPreference(auth.user.id, pref.notificationType, {
        inApp: pref.inAppEnabled,
        push: pref.pushEnabled,
        email: pref.emailEnabled,
      })
    }

    // Retornar estado atualizado
    const dbPrefs = await notificationRepository.getPreferences(auth.user.id)
    const result = ALL_TYPES.map((type) => {
      const saved = dbPrefs[type]
      const isUrgent = ALWAYS_ON_TYPES.has(type)
      return {
        notificationType: type,
        inAppEnabled: isUrgent ? true : (saved?.inApp ?? true),
        pushEnabled: isUrgent ? true : (saved?.push ?? true),
        emailEnabled: isUrgent ? true : (saved?.email ?? true),
        isUrgent,
      }
    })

    return ok(result)
  } catch {
    return errors.server()
  }
}
