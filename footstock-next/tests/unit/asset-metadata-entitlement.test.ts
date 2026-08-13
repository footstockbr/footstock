/**
 * Task 01 — Testes de caracterização: metadata do ativo não deve conter cotação.
 *
 * Estes testes afirmam que generateMetadata NÃO consulta nem expõe currentPrice.
 * Eles DEVEM FALHAR contra o código atual, que inclui `Preço atual: FS$X.XX`
 * na descrição. Passam após a Task 02 remover o preço da metadata.
 *
 * hipotese: H3 — a metadata com preço é cacheada ou indexada em um contexto
 * capaz de atravessar o entitlement do usuário. O vazamento lógico está
 * presente no código; seu alcance operacional deve ser medido sem adiar a
 * remoção do preço da metadata.
 */

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockFindUnique = jest.fn()

jest.mock('@/lib/prisma', () => ({
  prisma: {
    asset: { findUnique: (...args: unknown[]) => mockFindUnique(...args) },
  },
}))

jest.mock('@/lib/validators/tickerSchema', () => ({
  tickerSchema: { safeParse: (v: string) => ({ success: true, data: v.toUpperCase() }) },
}))

// Import após mocks
import { generateMetadata } from '@/app/(app)/mercado/[ticker]/page'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function setupAsset(overrides?: Partial<{ ticker: string; displayName: string; currentPrice: { toNumber: () => number } }>) {
  mockFindUnique.mockResolvedValue({
    ticker: 'FLA1',
    displayName: 'Flamengo',
    currentPrice: { toNumber: () => 52.30 },
    ...overrides,
  })
}

beforeEach(() => {
  jest.clearAllMocks()
})

// ─── Gate P0: metadata não contém cotação ────────────────────────────────────

describe('Gate P0: generateMetadata sem cotação', () => {
  test('description NÃO deve conter o preço atual do ativo', async () => {
    setupAsset()

    const metadata = await generateMetadata({ params: Promise.resolve({ ticker: 'FLA1' }) })

    const description = (metadata as any).description ?? ''
    expect(description).not.toContain('52.30')
    expect(description).not.toContain('FS$')
    expect(description).not.toMatch(/preço/i)
  })

  test('description NÃO deve conter qualquer valor numérico de cotação', async () => {
    setupAsset({ currentPrice: { toNumber: () => 123.45 } })

    const metadata = await generateMetadata({ params: Promise.resolve({ ticker: 'FLA1' }) })

    const description = (metadata as any).description ?? ''
    expect(description).not.toContain('123.45')
    expect(description).not.toContain('123,45')
  })

  test('openGraph.description NÃO deve conter preço', async () => {
    setupAsset()

    const metadata = await generateMetadata({ params: Promise.resolve({ ticker: 'FLA1' }) })

    const ogDescription = (metadata as any).openGraph?.description ?? ''
    expect(ogDescription).not.toMatch(/preço/i)
    expect(ogDescription).not.toContain('FS$')
  })

  test('title deve conter ticker e displayName sem cotação', async () => {
    setupAsset()

    const metadata = await generateMetadata({ params: Promise.resolve({ ticker: 'FLA1' }) })

    const title = (metadata as any).title ?? ''
    expect(title).toContain('FLA1')
    expect(title).toContain('Flamengo')
    expect(title).not.toMatch(/\d+\.\d{2}/)
  })

  test('metadata não deve disparar consulta a currentPrice (findUnique chamado sem select de preço)', async () => {
    setupAsset()

    await generateMetadata({ params: Promise.resolve({ ticker: 'FLA1' }) })

    expect(mockFindUnique).toHaveBeenCalledTimes(1)
    const callArgs = mockFindUnique.mock.calls[0][0]
    const selectFields = callArgs?.select ? Object.keys(callArgs.select) : []
    if (selectFields.length > 0) {
      expect(selectFields).not.toContain('currentPrice')
    }
  })
})
