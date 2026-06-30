// ============================================================================
// Task 009 (loop 06-29-motor-toggles-nao-param) — Bloco B3
// Rota /api/v1/admin/market — efeito C (HALT_ALL / RESUME_ALL no motor real).
// Contrato observavel: HALT_ALL/RESUME_ALL exigem reason 10..500; publica em
// motor:control; audita a acao global (assetId null); rate-limit 10/min -> 429
// RATE_001; payload invalido -> 400 VAL_001.
// Ambiente node: exercita o postHandler real com middleware/redis/prisma mock.
// ============================================================================

const TEST_USER = { id: 'admin-test-1', adminRole: 'SUPER_ADMIN' }

jest.mock('@/app/api/middleware', () => ({
  withAdmin: () => (handler: (req: unknown, ctx: unknown) => unknown) => (req: unknown) =>
    handler(req, { user: TEST_USER }),
}))

// Redis: incr/expire para o rate-limit por minuto e publish para o canal control.
const counters = new Map<string, number>()
const incr = jest.fn(async (key: string) => {
  const next = (counters.get(key) ?? 0) + 1
  counters.set(key, next)
  return next
})
const expire = jest.fn(async (_key: string, _seconds: number) => 1)
const publish = jest.fn(async (_channel: string, _payload: string) => 1)

jest.mock('@/lib/redis', () => ({
  redisPublisher: {
    incr: (...a: [string]) => incr(...a),
    expire: (...a: [string, number]) => expire(...a),
    publish: (...a: [string, string]) => publish(...a),
  },
}))

// Prisma: só a auditoria global (assetId null) importa para HALT_ALL/RESUME_ALL.
const auditCreate = jest.fn(
  async (_args: { data: { assetId: string | null; action: string; details?: unknown } }) => ({ id: 'audit-1' })
)
jest.mock('@/lib/prisma', () => ({
  prisma: {
    asset: { findUnique: jest.fn(async () => null) },
    adminMarketAction: { create: (args: Parameters<typeof auditCreate>[0]) => auditCreate(args) },
  },
}))

import { POST } from '@/app/api/v1/admin/market/route'

const makeReq = (body: unknown) => ({ json: async () => body }) as never
const VALID_REASON = 'pausa operacional para manutencao do motor'

beforeEach(() => {
  counters.clear()
  incr.mockClear()
  expire.mockClear()
  publish.mockClear()
  auditCreate.mockClear()
})

describe('admin/market — HALT_ALL / RESUME_ALL (efeito C)', () => {
  it('HALT_ALL com reason válido publica em motor:control e audita a ação global', async () => {
    const res = await POST(makeReq({ type: 'HALT_ALL', reason: VALID_REASON }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)

    expect(publish).toHaveBeenCalledTimes(1)
    const [channel, payload] = publish.mock.calls[0]
    expect(channel).toBe('motor:control')
    const event = JSON.parse(payload)
    expect(event.type).toBe('HALT_ALL')
    expect(event.reason).toBe(VALID_REASON)
    expect(event.adminId).toBe(TEST_USER.id)

    // Ação global (sem assetId) é auditada na própria rota.
    expect(auditCreate).toHaveBeenCalledTimes(1)
    const auditArg = auditCreate.mock.calls[0][0]
    expect(auditArg.data.assetId).toBeNull()
    expect(auditArg.data.action).toBe('HALT_ALL')
  })

  it('RESUME_ALL com reason válido publica RESUME_ALL no canal control', async () => {
    const res = await POST(makeReq({ type: 'RESUME_ALL', reason: VALID_REASON }))
    expect(res.status).toBe(200)
    const event = JSON.parse(publish.mock.calls[0][1])
    expect(event.type).toBe('RESUME_ALL')
  })
})

describe('admin/market — validação de reason (espelha 10..500)', () => {
  it('reason curto (< 10) retorna 400 VAL_001 e não publica nada', async () => {
    const res = await POST(makeReq({ type: 'HALT_ALL', reason: 'curto' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VAL_001')
    expect(publish).not.toHaveBeenCalled()
  })

  it('payload com type desconhecido retorna 400 VAL_001', async () => {
    const res = await POST(makeReq({ type: 'NUKE_ALL', reason: VALID_REASON }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VAL_001')
    expect(publish).not.toHaveBeenCalled()
  })
})

describe('admin/market — rate limit 10/min (429 RATE_001)', () => {
  it('a 11ª ação no mesmo minuto retorna 429 RATE_001', async () => {
    let last: Response | null = null
    for (let i = 0; i < 11; i++) {
      last = await POST(makeReq({ type: 'HALT_ALL', reason: VALID_REASON }))
    }
    expect(last!.status).toBe(429)
    const body = await last!.json()
    expect(body.error.code).toBe('RATE_001')
    // expira foi armado na 1ª contagem (janela de 60s).
    expect(expire).toHaveBeenCalled()
  })

  it('as 10 primeiras ações no minuto passam (limite inclusivo)', async () => {
    for (let i = 0; i < 10; i++) {
      const res = await POST(makeReq({ type: 'HALT_ALL', reason: VALID_REASON }))
      expect(res.status).toBe(200)
    }
  })
})
