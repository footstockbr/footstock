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
      className="mt-3 border-t border-[rgba(240,185,11,.1)] pt-3"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-[10px] text-[#929AA5] uppercase tracking-wide">
          Preço das ações
        </div>

        <button
          type="button"
          data-testid="admin-motor-reset-fair-value-button"
          onClick={handleReset}
          disabled={mutation.isPending}
          className="rounded border border-[rgba(246,70,93,.3)] bg-[rgba(246,70,93,.1)] px-3 py-1.5 text-[11px] font-semibold text-[#F6465D] transition-colors hover:bg-[rgba(246,70,93,.16)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {mutation.isPending ? 'Restaurando...' : 'Restaurar preços originais'}
        </button>
      </div>

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
