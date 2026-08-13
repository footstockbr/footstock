/**
 * T-022 legacy — cobertura migrada para suites dedicadas.
 *
 * Os cenários originais de delay de cotação server-side, PriceBuffer,
 * histórico com defasagem e SSE de mercado foram movidos para testes
 * específicos que rodam sem depender de Redis real:
 *
 * - tests/integration/asset-history-route.test.ts
 * - tests/unit/delay-service-entitlement.test.ts
 * - tests/unit/market-stream-hooks.test.tsx
 * - motor/src/server/routes/__tests__/marketStream.auth.test.ts
 *
 * Este arquivo permanece como sentinel de migração para preservar a
 * referência do pipeline e garantir que nenhum describe.skip crítico
 * fique pendente.
 */

import fs from 'fs'
import path from 'path'

describe('T-022 legacy — cobertura migrada', () => {
  const repoRoot = path.resolve(__dirname, '../..')

  const migrated = [
    {
      label: 'asset-history-route',
      fullPath: path.join(repoRoot, 'tests/integration/asset-history-route.test.ts'),
    },
    {
      label: 'delay-service-entitlement',
      fullPath: path.join(repoRoot, 'tests/unit/delay-service-entitlement.test.ts'),
    },
    {
      label: 'market-stream-hooks',
      fullPath: path.join(repoRoot, 'tests/unit/market-stream-hooks.test.tsx'),
    },
    {
      label: 'motor-marketStream.auth',
      fullPath: path.join(repoRoot, '..', 'motor/src/server/routes/__tests__/marketStream.auth.test.ts'),
    },
  ]

  test.each(migrated)('suite migrada existe: $label', ({ fullPath }) => {
    expect(fs.existsSync(fullPath)).toBe(true)
  })

  test('PriceBuffer é importável sem Redis real', async () => {
    const { PriceBuffer } = await import('@/lib/services/PriceBuffer')
    expect(PriceBuffer).toBeDefined()
    expect(typeof PriceBuffer.getDelayed).toBe('function')
  })
})
