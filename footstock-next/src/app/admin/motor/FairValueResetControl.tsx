'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { AdminRole } from '@/types'

export const FAIR_VALUE_RESET_CONFIRMATION =
  'esta ação irá levaar todos os preço para o original, deseja continuar?'

interface FairValueResetResult {
  assetsUpdated: number
}

interface FairValueResetControlProps {
  adminRole: AdminRole
}

export async function resetPricesToFairValue(
  fetcher: typeof fetch = fetch
): Promise<FairValueResetResult> {
  const response = await fetcher('/api/v1/admin/assets/reset-prices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      onlyFloored: false,
      variationPct: 0,
    }),
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(
      payload?.error?.message ?? 'Não foi possível restaurar os preços para o fair value.'
    )
  }

  return payload.data as FairValueResetResult
}

function SuperAdminFairValueResetControl() {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: () => resetPricesToFairValue(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-assets'] })
      queryClient.invalidateQueries({ queryKey: ['admin-assets-full'] })
      queryClient.invalidateQueries({ queryKey: ['admin-assets-halt'] })
      queryClient.invalidateQueries({ queryKey: ['audit-log'] })
    },
  })

  const handleReset = () => {
    if (mutation.isPending) return
    if (!window.confirm(FAIR_VALUE_RESET_CONFIRMATION)) return
    mutation.mutate()
  }

  return (
    <div
      data-testid="admin-motor-kpi-fair-value-reset"
      className="bg-[#1E2329] rounded-xl border border-[rgba(246,70,93,.18)] p-4"
    >
      <div className="text-[10px] text-[#929AA5] uppercase tracking-wide mb-1">
        Preços das ações
      </div>
      <div className="text-sm font-bold text-[#EAECEF]">Restaurar fair value</div>
      <p className="text-[10px] text-[#929AA5] mt-1 mb-3">
        Retorna todas as ações ao valor original cadastrado.
      </p>

      <button
        type="button"
        data-testid="admin-motor-reset-fair-value-button"
        onClick={handleReset}
        disabled={mutation.isPending}
        className="w-full rounded border border-[rgba(246,70,93,.3)] bg-[rgba(246,70,93,.1)] px-3 py-2 text-[11px] font-semibold text-[#F6465D] transition-colors hover:bg-[rgba(246,70,93,.16)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {mutation.isPending ? 'Restaurando...' : 'Restaurar preços originais'}
      </button>

      {mutation.isSuccess && (
        <p
          data-testid="admin-motor-reset-fair-value-success"
          role="status"
          className="mt-2 text-[10px] text-[#2EBD85]"
        >
          {mutation.data.assetsUpdated} ações restauradas para o fair value.
        </p>
      )}

      {mutation.isError && (
        <p
          data-testid="admin-motor-reset-fair-value-error"
          role="alert"
          className="mt-2 text-[10px] text-[#F6465D]"
        >
          {mutation.error.message}
        </p>
      )}
    </div>
  )
}

export function FairValueResetControl({ adminRole }: FairValueResetControlProps) {
  if (adminRole !== 'SUPER_ADMIN') return null

  return <SuperAdminFairValueResetControl />
}
