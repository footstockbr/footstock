// ============================================================================
// Foot Stock — Contrato news:inject
// Verifica formato do payload de notícias e validação de ImpactCategory
// Rastreabilidade: INT-099 | US-014 | module-28/TASK-1/ST003
// ============================================================================

import { z } from 'zod'
import { IMPACT_CATEGORY_VALUES, type ImpactCategoryValue } from '../helpers/contract-test-helpers'
import { RedisMock, createMockNewsInject } from '../__mocks__/redis.mock'

// Schema local — espelha motor/src/contracts/news-inject-contract.ts
// Produtores (module-17, module-22) e consumidores devem honrar este contrato
const NewsInjectPayloadSchema = z.object({
  title: z.string().min(1).max(300),
  ticker: z.string().min(1).max(8).optional(),
  impactCategory: z.enum(IMPACT_CATEGORY_VALUES),
  sentiment: z.number().min(-1).max(1),
  source: z.string().min(1),
  publishedAt: z.string().datetime(),
})

describe('Contrato news:inject', () => {
  let mock: RedisMock

  beforeEach(() => {
    mock = new RedisMock()
  })

  afterEach(() => {
    mock.reset()
  })

  // ── Payload válido ─────────────────────────────────────────────────────────

  it('[SUCCESS] deve aceitar payload válido com todos os campos', () => {
    const payload = createMockNewsInject()
    const result = NewsInjectPayloadSchema.safeParse(payload)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.title).toBe(payload.title)
      expect(result.data.impactCategory).toBe(payload.impactCategory)
    }
  })

  it('[SUCCESS] publicar e receber payload no canal news:inject', () => {
    const payload = createMockNewsInject()
    mock.publish('news:inject', JSON.stringify(payload))

    const received = JSON.parse(mock.published['news:inject']![0]!)
    const result = NewsInjectPayloadSchema.safeParse(received)
    expect(result.success).toBe(true)
  })

  // ── Campo obrigatório ausente ──────────────────────────────────────────────

  it('[ERROR] deve rejeitar payload sem title', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { title, ...payloadSemTitle } = createMockNewsInject()
    const result = NewsInjectPayloadSchema.safeParse(payloadSemTitle)

    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0])
      expect(paths).toContain('title')
    }
  })

  // ── impactCategory inválido ────────────────────────────────────────────────

  it('[ERROR] deve rejeitar impactCategory fora dos valores do enum Prisma', () => {
    const invalid = createMockNewsInject({
      impactCategory: 'EARNINGS' as ImpactCategoryValue,
    })
    const result = NewsInjectPayloadSchema.safeParse(invalid)

    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0])
      expect(paths).toContain('impactCategory')
    }
  })

  // ── ticker opcional ────────────────────────────────────────────────────────

  it('[EDGE] deve aceitar payload sem ticker como notícia geral', () => {
    const payload = createMockNewsInject({ ticker: undefined })
    const result = NewsInjectPayloadSchema.safeParse(payload)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.ticker).toBeUndefined()
    }
  })

  // ── ImpactCategory alinhado com enum Prisma ────────────────────────────────

  it('[EDGE] ImpactCategory deve usar exatamente os valores do enum Prisma', () => {
    // Garante que cada valor do enum Prisma é aceito pelo schema
    IMPACT_CATEGORY_VALUES.forEach((value) => {
      const payload = createMockNewsInject({ impactCategory: value })
      const result = NewsInjectPayloadSchema.safeParse(payload)
      expect(result.success).toBe(true)
    })
  })

  // ── sentiment numérico ────────────────────────────────────────────────────

  it('[EDGE] sentiment deve ser número no range -1 a 1', () => {
    const validPayload = createMockNewsInject({ sentiment: -0.5 })
    expect(NewsInjectPayloadSchema.safeParse(validPayload).success).toBe(true)

    const tooHigh = createMockNewsInject({ sentiment: 1.5 })
    expect(NewsInjectPayloadSchema.safeParse(tooHigh).success).toBe(false)

    const tooLow = createMockNewsInject({ sentiment: -1.5 })
    expect(NewsInjectPayloadSchema.safeParse(tooLow).success).toBe(false)
  })
})
