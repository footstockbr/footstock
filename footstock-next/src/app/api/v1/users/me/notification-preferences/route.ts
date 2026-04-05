import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth/server'
import { prisma } from '@/lib/prisma'

const DEFAULT_PREFERENCES = [
  'orders', 'news', 'leagues', 'payments', 'system',
].flatMap((type) =>
  ['push', 'email', 'in_app'].map((channel) => ({ type, channel, enabled: true }))
)

/** GET /api/v1/users/me/notification-preferences */
export async function GET() {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prefs = await (prisma as any).notificationPreference?.findMany({
      where: { userId: auth.user.id },
    }) ?? []

    if (!prefs.length) {
      return NextResponse.json(DEFAULT_PREFERENCES)
    }

    return NextResponse.json(prefs.map((p: { type: string; channel: string; enabled: boolean }) => ({
      type: p.type,
      channel: p.channel,
      enabled: p.enabled,
    })))
  } catch {
    return NextResponse.json(DEFAULT_PREFERENCES)
  }
}

/** PATCH /api/v1/users/me/notification-preferences */
export async function PATCH(request: Request) {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const preferences: Array<{ type: string; channel: string; enabled: boolean }> = await request.json()

  if (!Array.isArray(preferences)) {
    return NextResponse.json({ error: 'Body deve ser array de preferências' }, { status: 400 })
  }

  try {
    await Promise.all(
      preferences.map((pref) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (prisma as any).notificationPreference?.upsert({
          where: { userId_type_channel: { userId: auth.user.id, type: pref.type, channel: pref.channel } },
          update: { enabled: pref.enabled },
          create: { userId: auth.user.id, type: pref.type, channel: pref.channel, enabled: pref.enabled },
        }).catch(() => null)
      )
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[NotificationPreferences PATCH]', error)
    return NextResponse.json({ error: 'Erro ao salvar preferências' }, { status: 500 })
  }
}
