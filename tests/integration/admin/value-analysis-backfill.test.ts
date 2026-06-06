import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('backfill-price-attribution contract', () => {
  const script = readFileSync(join(process.cwd(), 'scripts/backfill-price-attribution.ts'), 'utf8')

  it('mantem dry-run como default e bloqueia force em producao', () => {
    expect(script).toContain('const dryRun = !process.argv.includes')
    expect(script).toContain("process.env.NODE_ENV === 'production'")
    expect(script).toContain('Backfill --force proibido em producao')
  })

  it('rotula GBM como historico sintetico sem causa real', () => {
    expect(script).toContain('SYNTHETIC_HISTORY')
    expect(script).toContain('nao representa causa real de mercado')
  })
})
