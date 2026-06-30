// ============================================================================
// Task 009 (loop 06-29-motor-toggles-nao-param) — Bloco B2
// Rota /api/v1/admin/motor/global-halt — efeito B (bloqueio de novas ordens).
// Contrato observavel (criterio 3): POST grava a chave motor:global-halt;
// DELETE remove; GET reflete o status (halted/running) a partir da chave.
// Ambiente node (sem DOM): exercita os handlers reais com middleware e redis
// mockados. NAO altera producao — apenas cobre o codigo existente.
// ============================================================================

const GLOBAL_HALT_KEY = 'motor:global-halt'
const TEST_USER = { id: 'admin-test-1', adminRole: 'SUPER_ADMIN' }

// withAdmin é a barreira de autorização; aqui o foco é o efeito de halt, então
// o middleware vira passthrough que injeta o AuthContext (user) esperado.
jest.mock('@/app/api/middleware', () => ({
  withAdmin: () => (handler: (req: unknown, ctx: unknown) => unknown) => (req: unknown) =>
    handler(req, { user: TEST_USER }),
}))

// Redis em memória: prova que POST persiste a chave e DELETE a remove de fato.
const store = new Map<string, string>()
const redisSet = jest.fn(async (k: string, v: string) => {
  store.set(k, v)
  return 'OK'
})
const redisDel = jest.fn(async (k: string) => {
  const had = store.has(k)
  store.delete(k)
  return had ? 1 : 0
})
const redisGet = jest.fn(async (k: string) => (store.has(k) ? store.get(k)! : null))

jest.mock('@/lib/redis', () => ({
  redisPublisher: {
    set: (...a: [string, string]) => redisSet(...a),
    del: (...a: [string]) => redisDel(...a),
    get: (...a: [string]) => redisGet(...a),
  },
}))

import { POST, DELETE, GET } from '@/app/api/v1/admin/motor/global-halt/route'

const req = {} as never

beforeEach(() => {
  store.clear()
  redisSet.mockClear()
  redisDel.mockClear()
  redisGet.mockClear()
})

describe('global-halt route — POST (efeito B: bloquear novas ordens)', () => {
  it('grava a chave motor:global-halt com haltedBy=user.id e responde status halted', async () => {
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.status).toBe('halted')

    // A chave canônica foi gravada (read-only de ordens = chave presente).
    expect(redisSet).toHaveBeenCalledWith(GLOBAL_HALT_KEY, expect.any(String))
    const persisted = JSON.parse(store.get(GLOBAL_HALT_KEY)!)
    expect(persisted.haltedBy).toBe(TEST_USER.id)
    expect(typeof persisted.haltedAt).toBe('string')
  })
})

describe('global-halt route — GET (status canônico do halt)', () => {
  it('reflete running quando a chave não existe', async () => {
    const res = await GET(req)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.status).toBe('running')
    expect(body.data.halt).toBeNull()
  })

  it('reflete halted e devolve o payload do halt quando a chave existe', async () => {
    await POST(req)
    const res = await GET(req)
    const body = await res.json()
    expect(body.data.status).toBe('halted')
    expect(body.data.halt.haltedBy).toBe(TEST_USER.id)
  })
})

describe('global-halt route — DELETE (efeito B inverso: liberar ordens)', () => {
  it('remove a chave e o GET subsequente volta a running', async () => {
    await POST(req)
    expect(store.has(GLOBAL_HALT_KEY)).toBe(true)

    const del = await DELETE(req)
    const delBody = await del.json()
    expect(delBody.success).toBe(true)
    expect(delBody.data.status).toBe('running')
    expect(redisDel).toHaveBeenCalledWith(GLOBAL_HALT_KEY)
    expect(store.has(GLOBAL_HALT_KEY)).toBe(false)

    const status = await (await GET(req)).json()
    expect(status.data.status).toBe('running')
  })
})
