'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useMemo, useState } from 'react'
import { ROUTES } from '@/lib/constants/routes'
import { SESSION_HOURS, SESSION_COLORS, SESSION_TYPE_LABELS, ADMIN_POLL_FAST_MS } from '@/lib/constants'
import { ADMIN_ROLE_LABELS } from '@/lib/constants/labels'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import type { SessionType } from '@/lib/enums'
import { InboxIcon } from '@/components/inbox/InboxIcon'

/** Header do app autenticado com logo, indicador de sessao e notificacoes */
export function AppHeader() {
  const { data: user } = useCurrentUser()

  const adminRoleLabel = user?.adminRole
    ? (ADMIN_ROLE_LABELS[user.adminRole as keyof typeof ADMIN_ROLE_LABELS] ?? user.adminRole)
    : null

  const getCurrentSession = (): SessionType => {
    const parts = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date())

    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0')
    const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0')
    const nowMinutes = hour * 60 + minute

    const toMinutes = (value: string): number => {
      const [h = 0, m = 0] = value.split(':').map(Number)
      return (h * 60) + m
    }

    const orderedSessions: SessionType[] = ['PRE_ABERTURA', 'NEGOCIACAO', 'CALL', 'AFTER_MARKET', 'FECHADO']
    for (const session of orderedSessions) {
      const window = SESSION_HOURS[session]
      const start = toMinutes(window.start)
      const end = toMinutes(window.end)
      const wraps = start > end
      const inWindow = wraps ? nowMinutes >= start || nowMinutes < end : nowMinutes >= start && nowMinutes < end
      if (inWindow) return session
    }

    return 'FECHADO'
  }

  const [session, setSession] = useState<SessionType>(getCurrentSession)

  useEffect(() => {
    const update = () => setSession(getCurrentSession())
    update()
    const interval = setInterval(update, ADMIN_POLL_FAST_MS)
    return () => clearInterval(interval)
  }, [])

  const sessionLabel = useMemo(() => SESSION_TYPE_LABELS[session], [session])
  const sessionColor = useMemo(() => SESSION_COLORS[session], [session])

  return (
    <header className="sticky top-0 z-sticky bg-bg-surface/90 backdrop-blur-sm border-b border-border-default">
      <div className="flex items-center justify-between md:justify-end h-14 px-4">
        <Link href={ROUTES.DASHBOARD} className="flex items-center gap-2 md:hidden">
          <Image
            src="/logo-foot.png"
            alt="Foot Stock"
            width={24}
            height={24}
            className="h-6 w-6 object-contain"
            priority
          />
          <span className="text-sm font-semibold text-text-primary hidden sm:block">
            Foot Stock
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-2 rounded-full border border-border-default bg-bg-card px-2 py-1">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: sessionColor }}
              aria-hidden="true"
              title={sessionLabel}
            />
            <span className="text-xs text-text-secondary">{sessionLabel}</span>
          </div>

          {adminRoleLabel && (
            <span
              className="inline-flex items-center rounded-full border border-accent/30 bg-accent/10 px-2 py-1 text-[11px] font-semibold text-accent"
              aria-label={`Conta administrativa: ${adminRoleLabel}`}
            >
              {adminRoleLabel}
            </span>
          )}

          <InboxIcon />

          {/* NotificationBell — placeholder — implementado em modulo de notificacoes */}
          <Link
            href={ROUTES.NOTIFICACOES}
            className="w-9 h-9 flex items-center justify-center rounded-md text-text-secondary hover:text-text-primary hover:bg-bg-card transition-colors"
            aria-label="Notificacoes"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
              />
            </svg>
          </Link>
        </div>
      </div>
    </header>
  )
}
