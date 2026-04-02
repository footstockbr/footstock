'use client'

import { useRouter } from 'next/navigation'
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Zap,
  Newspaper,
  CreditCard,
  AlertCircle,
  TrendingUp,
  Gift,
  Trophy,
  Megaphone,
  Lock,
  ShieldAlert,
  Bell,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { NotificationDTO, NotificationType } from '@/types'

interface NotificationConfig {
  icon: LucideIcon
  colorClass: string
  href: string | null
}

const NOTIFICATION_CONFIG: Record<string, NotificationConfig> = {
  ORDER_EXECUTED: { icon: CheckCircle, colorClass: 'text-emerald-400', href: '/carteira' },
  ORDER_CANCELLED: { icon: XCircle, colorClass: 'text-red-400', href: '/carteira' },
  MARGIN_CALL_ALERT: { icon: AlertTriangle, colorClass: 'text-orange-400', href: '/carteira?tab=shorts' },
  CIRCUIT_BREAKER: { icon: Zap, colorClass: 'text-red-500', href: '/noticias' },
  NEWS_FAVORITE_CLUB: { icon: Newspaper, colorClass: 'text-[#F0B90B]', href: '/noticias' },
  PAYMENT_CONFIRMED: { icon: CreditCard, colorClass: 'text-emerald-400', href: '/planos' },
  PAYMENT_FAILED: { icon: CreditCard, colorClass: 'text-red-400', href: '/planos' },
  PLAN_CANCEL_ALERT: { icon: AlertCircle, colorClass: 'text-yellow-400', href: '/planos' },
  DIVIDEND_CREDITED: { icon: TrendingUp, colorClass: 'text-[#F0B90B]', href: '/carteira?tab=dividendos' },
  BONUS_CREDITED: { icon: Gift, colorClass: 'text-[#F0B90B]', href: '/carteira' },
  LEAGUE_RESULT: { icon: Trophy, colorClass: 'text-[#F0B90B]', href: '/ligas' },
  ADMIN_BROADCAST: { icon: Megaphone, colorClass: 'text-[#F0B90B]', href: null },
  AFFILIATE_COMMISSION_EARNED: { icon: Gift, colorClass: 'text-emerald-400', href: '/perfil?tab=afiliados' },
  AFFILIATE_INVITE_JOINED: { icon: Users, colorClass: 'text-emerald-400', href: '/perfil?tab=afiliados' },
  CANCELLATION_LOCK_ACTIVE: { icon: Lock, colorClass: 'text-orange-400', href: '/carteira?tab=posicoes' },
  CANCELLATION_LOCK_LIQUIDATED: { icon: ShieldAlert, colorClass: 'text-red-500', href: '/carteira?tab=posicoes' },
}

const FALLBACK_CONFIG: NotificationConfig = {
  icon: Bell,
  colorClass: 'text-muted-foreground',
  href: '/',
}

function formatRelativeDate(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `há ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `há ${hours}h`
  const days = Math.floor(hours / 24)
  return `há ${days} dia${days > 1 ? 's' : ''}`
}

interface NotificationItemProps {
  notification: NotificationDTO
  onMarkAsRead: (id: string) => void
  onClose: () => void
}

export function NotificationItem({ notification, onMarkAsRead, onClose }: NotificationItemProps) {
  const router = useRouter()
  const config = NOTIFICATION_CONFIG[notification.type as NotificationType] ?? FALLBACK_CONFIG
  const Icon = config.icon

  async function handleClick() {
    onMarkAsRead(notification.id)
    if (config.href) {
      onClose()
      router.push(config.href)
    } else {
      onClose()
    }
  }

  const isUrgent =
    notification.type === 'MARGIN_CALL_ALERT' || notification.type === 'CANCELLATION_LOCK_ACTIVE'

  const ariaLabel = `${notification.title}. ${notification.body}. Recebido ${formatRelativeDate(notification.createdAt)}. ${notification.read ? 'Lida' : 'Não lida'}.`

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleClick()
        }
      }}
      className={cn(
        'relative min-h-[64px] flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors',
        notification.read ? 'bg-[#1E2329]' : 'bg-[#1a2230]',
        'hover:bg-[#1e2a3a]'
      )}
    >
      {/* Ícone */}
      <div className="flex-shrink-0 mt-0.5">
        <Icon
          className={cn('w-8 h-8', config.colorClass, isUrgent && 'animate-pulse')}
          aria-hidden="true"
        />
      </div>

      {/* Conteúdo */}
      <div className="flex-1 min-w-0 pr-4">
        <p
          className={cn(
            'text-sm font-semibold leading-tight',
            notification.read ? 'text-[#c5b99a]' : 'text-[#EAECEF]'
          )}
        >
          {notification.title}
        </p>
        <p className="text-xs text-[#929AA5] mt-1 leading-relaxed line-clamp-2">
          {notification.body}
        </p>
        <p className="text-[10px] text-[#707A8A] mt-1">
          {formatRelativeDate(notification.createdAt)}
        </p>
      </div>

      {/* Ponto não-lida */}
      {!notification.read && (
        <div
          className={cn(
            'absolute top-3 right-3 w-2 h-2 rounded-full flex-shrink-0',
            isUrgent ? 'bg-red-500' : 'bg-[#F0B90B]'
          )}
          aria-hidden="true"
        />
      )}
    </div>
  )
}
