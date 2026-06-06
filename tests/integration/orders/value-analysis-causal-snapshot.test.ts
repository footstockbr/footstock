import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('value analysis causal order snapshot contract', () => {
  const service = readFileSync(join(process.cwd(), 'motor/src/engine/OrderFlowSnapshotService.ts'), 'utf8')
  const migration = readFileSync(join(process.cwd(), 'footstock-next/prisma/migrations/M057-order-flow-snapshot-index.sql'), 'utf8')

  it('usa consulta agrupada por asset_id e nao query por ativo', () => {
    expect(service).toContain('GROUP BY asset_id')
    expect(service).toContain('asset_id = ANY')
  })

  it('possui indice compativel com filtros do snapshot', () => {
    expect(migration).toContain('asset_id, status, side, type, created_at')
  })
})
