import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  FAIR_VALUE_RESET_CONFIRMATION,
  FairValueResetControl,
  resetPricesToFairValue,
} from '@/app/admin/motor/FairValueResetControl'

describe('FairValueResetControl', () => {
  test.each(['CLUB_PARTNER', 'MONITOR', 'EDITOR', 'MODERADOR', 'ADMINISTRADOR'] as const)(
    'não renderiza o botão para o role %s',
    (adminRole) => {
      expect(renderToStaticMarkup(<FairValueResetControl adminRole={adminRole} />)).toBe('')
    }
  )

  test('renderiza o botão exclusivamente para SUPER_ADMIN', () => {
    const queryClient = new QueryClient()
    const markup = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <FairValueResetControl adminRole="SUPER_ADMIN" />
      </QueryClientProvider>
    )

    expect(markup).toContain('data-testid="admin-motor-reset-fair-value-button"')
    expect(markup).toContain('Restaurar preços originais')
  })

  test('mantém a mensagem de confirmação solicitada', () => {
    expect(FAIR_VALUE_RESET_CONFIRMATION).toBe(
      'esta ação irá levaar todos os preço para o original, deseja continuar?'
    )
  })
})

describe('resetPricesToFairValue', () => {
  test('solicita reset de todos os ativos exatamente no fair value', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { assetsUpdated: 40 } }),
    })

    await expect(resetPricesToFairValue(fetcher as unknown as typeof fetch)).resolves.toEqual({
      assetsUpdated: 40,
    })
    expect(fetcher).toHaveBeenCalledWith(
      '/api/v1/admin/assets/reset-prices',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ onlyFloored: false, variationPct: 0 }),
      })
    )
  })

  test('propaga a mensagem de erro retornada pela API', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: 'Apenas SuperAdmin pode resetar preços.' } }),
    })

    await expect(resetPricesToFairValue(fetcher as unknown as typeof fetch)).rejects.toThrow(
      'Apenas SuperAdmin pode resetar preços.'
    )
  })
})
