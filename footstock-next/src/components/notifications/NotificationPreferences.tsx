'use client'

// NotificationPreferences.tsx — T-014 / module-19
// Painel de preferências de notificação por tipo (23 tipos).
// Urgentes: não editáveis, label "Obrigatória".
// Channels: inApp, push, email (email-only types mostram apenas email).
// Persiste via PUT /api/v1/users/me/notification-preferences.

import { useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface NotificationPreferenceItem {
  notificationType: string
  inAppEnabled: boolean
  pushEnabled: boolean
  emailEnabled: boolean
  isUrgent: boolean
}

type Channel = 'inAppEnabled' | 'pushEnabled' | 'emailEnabled'

// ─── Constantes ───────────────────────────────────────────────────────────────

// Tipos que enviam apenas por email (sem in-app ou push)
const EMAIL_ONLY_TYPES = new Set([
  'PASSWORD_RESET',
  'LGPD_EXPORT_READY',
  'ACCOUNT_DELETED',
  'BRUTE_FORCE_BLOCKED',
])

// Agrupamento visual dos 23 tipos
const CATEGORIES: {
  label: string
  types: { type: string; label: string }[]
}[] = [
  {
    label: 'Operações',
    types: [
      { type: 'ORDER_EXECUTED', label: 'Ordem executada' },
      { type: 'ORDER_CANCELLED', label: 'Ordem cancelada' },
    ],
  },
  {
    label: 'Margem e Risco',
    types: [
      { type: 'MARGIN_CALL_WARNING', label: 'Aviso de margem (50%)' },
      { type: 'MARGIN_CALL_ALERT', label: 'Alerta de margem (80%)' },
      { type: 'CIRCUIT_BREAKER', label: 'Circuit breaker ativado' },
      { type: 'CANCELLATION_LOCK_ACTIVE', label: 'Trava de cancelamento ativada' },
      { type: 'CANCELLATION_LOCK_LIQUIDATED', label: 'Posições liquidadas' },
    ],
  },
  {
    label: 'Financeiro',
    types: [
      { type: 'PAYMENT_CONFIRMED', label: 'Pagamento confirmado' },
      { type: 'PAYMENT_FAILED', label: 'Falha no pagamento' },
      { type: 'PLAN_CANCEL_ALERT', label: 'Alerta de cancelamento de plano' },
      { type: 'DIVIDEND_CREDITED', label: 'Dividendo creditado' },
      { type: 'BONUS_CREDITED', label: 'Bônus creditado' },
    ],
  },
  {
    label: 'Clube e Mercado',
    types: [
      { type: 'NEWS_FAVORITE_CLUB', label: 'Notícias do seu clube favorito' },
      { type: 'LEAGUE_RESULT', label: 'Resultado de liga' },
    ],
  },
  {
    label: 'Afiliados',
    types: [
      { type: 'AFFILIATE_COMMISSION_EARNED', label: 'Comissão recebida' },
      { type: 'AFFILIATE_INVITE_JOINED', label: 'Novo indicado (afiliado)' },
      { type: 'REFERRAL_JOINED', label: 'Bônus de indicação recebido' },
    ],
  },
  {
    label: 'Sistema',
    types: [
      { type: 'ADMIN_BROADCAST', label: 'Comunicado do sistema' },
      { type: 'SYSTEM_MAINTENANCE', label: 'Manutenção programada' },
    ],
  },
  {
    label: 'Conta',
    types: [
      { type: 'PASSWORD_RESET', label: 'Redefinição de senha' },
      { type: 'LGPD_EXPORT_READY', label: 'Exportação de dados pronta' },
      { type: 'ACCOUNT_DELETED', label: 'Exclusão de conta' },
      { type: 'BRUTE_FORCE_BLOCKED', label: 'Acesso bloqueado por segurança' },
    ],
  },
]

// ─── Fetcher / Mutator ────────────────────────────────────────────────────────

async function fetchPreferences(): Promise<NotificationPreferenceItem[]> {
  const res = await fetch('/api/v1/users/me/notification-preferences')
  if (!res.ok) throw new Error('Erro ao carregar preferências.')
  const json = await res.json()
  return (json.data ?? []) as NotificationPreferenceItem[]
}

async function putPreferences(
  items: Pick<NotificationPreferenceItem, 'notificationType' | 'inAppEnabled' | 'pushEnabled' | 'emailEnabled'>[]
): Promise<NotificationPreferenceItem[]> {
  const res = await fetch('/api/v1/users/me/notification-preferences', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(items),
  })
  if (!res.ok) throw new Error('Erro ao salvar preferências.')
  const json = await res.json()
  return (json.data ?? []) as NotificationPreferenceItem[]
}

// ─── Toggle switch simples ────────────────────────────────────────────────────

function Toggle({
  checked,
  disabled,
  onChange,
  label,
  'data-testid': testId,
}: {
  checked: boolean
  disabled?: boolean
  onChange: (v: boolean) => void
  label: string
  'data-testid'?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      data-testid={testId}
      onClick={() => !disabled && onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 flex-shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F0B90B] focus-visible:ring-offset-2 focus-visible:ring-offset-[#1A1F26]',
        checked ? 'bg-[#F0B90B]' : 'bg-[#2B3139]',
        disabled && 'opacity-40 cursor-not-allowed'
      )}
    >
      <span
        className={cn(
          'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform mt-0.5',
          checked ? 'translate-x-4' : 'translate-x-0.5'
        )}
        aria-hidden="true"
      />
    </button>
  )
}

// ─── Linha de preferência ─────────────────────────────────────────────────────

function PreferenceRow({
  item,
  label,
  onToggle,
}: {
  item: NotificationPreferenceItem
  label: string
  onToggle: (type: string, channel: Channel, value: boolean) => void
}) {
  const isEmailOnly = EMAIL_ONLY_TYPES.has(item.notificationType)

  return (
    <div
      className="flex items-center justify-between gap-3 py-2.5"
      data-testid={`pref-row-${item.notificationType.toLowerCase()}`}
    >
      {/* Label + badge urgente */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="text-sm text-[#929AA5] leading-tight truncate">{label}</span>
        {item.isUrgent && (
          <span className="flex-shrink-0 text-[10px] font-semibold text-[#F0B90B] border border-[#F0B90B]/30 rounded px-1.5 py-0.5 bg-[#F0B90B]/10">
            Obrigatória
          </span>
        )}
      </div>

      {/* Toggles de canal */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {/* In-app */}
        {!isEmailOnly ? (
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-[9px] text-[#707A8A] uppercase tracking-wide">App</span>
            <Toggle
              checked={item.isUrgent ? true : item.inAppEnabled}
              disabled={item.isUrgent}
              onChange={(v) => onToggle(item.notificationType, 'inAppEnabled', v)}
              label={`${label} — notificação no app`}
              data-testid={`toggle-inapp-${item.notificationType.toLowerCase()}`}
            />
          </div>
        ) : (
          <div className="w-9" aria-hidden="true" />
        )}

        {/* Push */}
        {!isEmailOnly ? (
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-[9px] text-[#707A8A] uppercase tracking-wide">Push</span>
            <Toggle
              checked={item.isUrgent ? true : item.pushEnabled}
              disabled={item.isUrgent}
              onChange={(v) => onToggle(item.notificationType, 'pushEnabled', v)}
              label={`${label} — notificação push`}
              data-testid={`toggle-push-${item.notificationType.toLowerCase()}`}
            />
          </div>
        ) : (
          <div className="w-9" aria-hidden="true" />
        )}

        {/* Email */}
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-[9px] text-[#707A8A] uppercase tracking-wide">Email</span>
          <Toggle
            checked={item.isUrgent ? true : item.emailEnabled}
            disabled={item.isUrgent}
            onChange={(v) => onToggle(item.notificationType, 'emailEnabled', v)}
            label={`${label} — notificação por email`}
            data-testid={`toggle-email-${item.notificationType.toLowerCase()}`}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function NotificationPreferences() {
  const queryClient = useQueryClient()

  const {
    data: preferences,
    isLoading,
    isError,
  } = useQuery<NotificationPreferenceItem[]>({
    queryKey: ['notification-preferences'],
    queryFn: fetchPreferences,
    staleTime: 5 * 60_000,
  })

  const mutation = useMutation({
    mutationFn: putPreferences,
    onMutate: async (updatedItems) => {
      await queryClient.cancelQueries({ queryKey: ['notification-preferences'] })
      const prev = queryClient.getQueryData<NotificationPreferenceItem[]>(['notification-preferences'])

      // Aplicar optimistic update: mesclar updatedItems na lista existente
      queryClient.setQueryData<NotificationPreferenceItem[]>(['notification-preferences'], (old = []) => {
        const updatedMap = new Map(updatedItems.map((i) => [i.notificationType, i]))
        return old.map((item) => {
          const patch = updatedMap.get(item.notificationType)
          if (!patch) return item
          return {
            ...item,
            inAppEnabled: patch.inAppEnabled,
            pushEnabled: patch.pushEnabled,
            emailEnabled: patch.emailEnabled,
          }
        })
      })

      return { prev }
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) {
        queryClient.setQueryData(['notification-preferences'], context.prev)
      }
      toast.error('Erro ao salvar preferências. Tente novamente.')
    },
    onSuccess: (serverData) => {
      queryClient.setQueryData(['notification-preferences'], serverData)
      toast.success('Preferências salvas.')
    },
  })

  const handleToggle = useCallback(
    (type: string, channel: Channel, value: boolean) => {
      if (!preferences) return
      const current = preferences.find((p) => p.notificationType === type)
      if (!current || current.isUrgent) return

      const patch = {
        notificationType: type,
        inAppEnabled: current.inAppEnabled,
        pushEnabled: current.pushEnabled,
        emailEnabled: current.emailEnabled,
        [channel]: value,
      }

      mutation.mutate([patch])
    },
    [preferences, mutation]
  )

  // ─── Estados de carregamento / erro ──────────────────────────────────────────

  if (isLoading) {
    return (
      <Card data-testid="notification-preferences-loading">
        <div className="p-4 flex flex-col gap-3">
          <div className="h-4 w-40 rounded bg-[#2B3139] animate-pulse" />
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-10 rounded bg-[#2B3139] animate-pulse" />
          ))}
        </div>
      </Card>
    )
  }

  if (isError || !preferences) {
    return (
      <Card data-testid="notification-preferences-error">
        <div className="p-4 flex flex-col gap-2">
          <p className="text-sm font-semibold text-[#EAECEF]">Notificações</p>
          <p className="text-xs text-[#F6465D]">
            Não foi possível carregar as preferências. Recarregue a página.
          </p>
        </div>
      </Card>
    )
  }

  // Mapa rápido por tipo
  const prefsMap = new Map(preferences.map((p) => [p.notificationType, p]))

  return (
    <Card data-testid="notification-preferences">
      <div className="p-4 pb-2">
        <div className="flex items-start justify-between mb-1">
          <p className="text-sm font-semibold text-[#EAECEF]">Notificações</p>
          {mutation.isPending && (
            <span className="text-[10px] text-[#929AA5] animate-pulse" aria-live="polite">
              Salvando...
            </span>
          )}
        </div>
        <p className="text-xs text-[#707A8A] mb-4 leading-relaxed">
          Escolha quais alertas receber e por qual canal. Notificações marcadas como{' '}
          <span className="text-[#F0B90B]">Obrigatória</span> não podem ser desativadas.
        </p>

        {/* Cabeçalho das colunas */}
        <div className="flex items-center justify-end gap-3 mb-1 pr-0">
          <span className="text-[9px] text-[#707A8A] uppercase tracking-wide w-9 text-center">
            App
          </span>
          <span className="text-[9px] text-[#707A8A] uppercase tracking-wide w-9 text-center">
            Push
          </span>
          <span className="text-[9px] text-[#707A8A] uppercase tracking-wide w-9 text-center">
            Email
          </span>
        </div>

        {/* Categorias */}
        <div className="flex flex-col gap-0">
          {CATEGORIES.map((category) => {
            const rows = category.types.filter((t) => prefsMap.has(t.type))
            if (rows.length === 0) return null

            return (
              <div key={category.label} className="mb-3">
                <p className="text-[10px] font-semibold text-[#707A8A] uppercase tracking-wider mb-1">
                  {category.label}
                </p>
                <div className="divide-y divide-[rgba(240,185,11,.06)]">
                  {rows.map(({ type, label }) => {
                    const item = prefsMap.get(type)
                    if (!item) return null
                    return (
                      <PreferenceRow
                        key={type}
                        item={item}
                        label={label}
                        onToggle={handleToggle}
                      />
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {/* Nota de horário silencioso */}
        <p className="text-[10px] text-[#707A8A] mt-2 mb-2 leading-relaxed border-t border-[rgba(240,185,11,.06)] pt-3">
          Notificações não urgentes são entregues fora do horário silencioso (23h–7h BRT).
        </p>
      </div>
    </Card>
  )
}
