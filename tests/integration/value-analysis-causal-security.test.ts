import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('value analysis causal security contract', () => {
  const attribution = readFileSync(join(process.cwd(), 'motor/src/engine/PriceAttribution.ts'), 'utf8')
  const rollout = readFileSync(join(process.cwd(), 'blacksmith/value-analysis-causal-rollout.md'), 'utf8')

  it('remove chaves sensiveis antes da serializacao da attribution', () => {
    expect(attribution).toContain('PII_KEY_PATTERN')
    expect(attribution).toContain('email|nome|name|saldo|balance|ip|session|payload|user|cpf|phone|telefone')
  })

  it('documenta rollback por env para snapshot e modo estrito', () => {
    expect(rollout).toContain('ORDER_FLOW_SNAPSHOT_ENABLED=false')
    expect(rollout).toContain('ATTRIBUTION_STRICT_MODE=false')
  })
})
