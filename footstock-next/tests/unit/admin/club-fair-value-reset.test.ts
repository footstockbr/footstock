import { resetClubPriceToFairValue } from '@/app/admin/clubes/AdminClubesClient'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('resetClubPriceToFairValue', () => {
  test('solicita reset exato somente para o ticker do modal', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          assetsUpdated: 1,
          changes: [{ ticker: 'URU3', newPrice: 40, fairValue: 40 }],
        },
      }),
    })

    await expect(
      resetClubPriceToFairValue('URU3', fetcher as unknown as typeof fetch)
    ).resolves.toEqual({
      assetsUpdated: 1,
      changes: [{ ticker: 'URU3', newPrice: 40, fairValue: 40 }],
    })

    expect(fetcher).toHaveBeenCalledWith(
      '/api/v1/admin/assets/reset-prices',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ ticker: 'URU3', onlyFloored: false, variationPct: 0 }),
      })
    )
  })

  test('propaga o erro da API', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: 'Acesso negado.' } }),
    })

    await expect(
      resetClubPriceToFairValue('URU3', fetcher as unknown as typeof fetch)
    ).rejects.toThrow('Acesso negado.')
  })

  test('mantém input e botão reset na proporção 2:1 dentro do modal', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/app/admin/clubes/AdminClubesClient.tsx'),
      'utf8'
    )

    expect(source).toContain('data-testid="modal-clube-fair-value-row"')
    expect(source).toContain("gridTemplateColumns: '2fr 1fr'")
    expect(source).toContain('data-testid="modal-clube-fair-value-reset-button"')
    expect(source).toContain("                      reset\n                    </button>")
  })
})
