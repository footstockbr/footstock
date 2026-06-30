// ============================================================================
// Task 009 (loop 06-29-motor-toggles-nao-param) — Blocos B4 + B5
// Orquestracao REAL de pausar/retomar o motor (orchestrateGlobalHalt), extraida
// de MotorPageClient para teste em ambiente node (o build sintetico de React
// deste repo nao renderiza componentes em jsdom — dispatcher nulo).
//
// B4: ordem fixa Pausar = B (global-halt POST) -> C (HALT_ALL market); Retomar =
//     C (RESUME_ALL market) -> B (global-halt DELETE). Falha parcial = fail-loud
//     (mensagem no canal unico) sem mascarar.
// B5 (gate de aceite): pausar SO via efeito B sem efeito C falha — a assertiva
//     exige a chamada HALT_ALL no market. Se o orquestrador omitisse C, o teste
//     falharia (market nunca seria chamado).
//
// Guard estrutural ao final: o componente continua reconciliando (GET global-halt)
// em TODOS os caminhos apos a orquestracao — contrato B4 que vive no MotorPageClient.
// ============================================================================

import { readFileSync } from 'fs'
import { join } from 'path'
import { orchestrateGlobalHalt, type OrchestratorFetch } from '@/lib/admin/global-halt-orchestrator'

type Call = { url: string; method: string; body: string | null }
const VALID_REASON = 'pausa operacional para manutencao do motor'

function res(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

interface FakeState {
  globalHaltPost?: Response
  globalHaltDelete?: Response
  market?: Response
  motorStatus?: Response
  throwOn?: string // substring da url que dispara erro de rede
}

function fakeFetch(state: FakeState): { fetchFn: OrchestratorFetch; calls: Call[] } {
  const calls: Call[] = []
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = (init?.method ?? 'GET').toUpperCase()
    calls.push({ url, method, body: typeof init?.body === 'string' ? init.body : null })
    if (state.throwOn && url.includes(state.throwOn)) throw new Error('network down')
    if (url.includes('/api/v1/admin/motor/status')) {
      return state.motorStatus ?? res({
        success: true,
        data: {
          operational: {
            command: {
              commandId: url.includes('resume-cmd') ? 'resume-cmd' : 'halt-cmd',
              type: url.includes('resume-cmd') ? 'RESUME_ALL' : 'HALT_ALL',
              state: 'applied',
              applied: true,
            },
            db: { haltAllCount: url.includes('resume-cmd') ? 0 : 3 },
          },
        },
      })
    }
    if (url.includes('/api/v1/admin/market')) {
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {}
      const commandId = body.type === 'RESUME_ALL' ? 'resume-cmd' : 'halt-cmd'
      return state.market ?? res({ success: true, data: { commandId, operationalStatus: { state: 'published', applied: false } } })
    }
    if (url.includes('/api/v1/admin/motor/global-halt')) {
      if (method === 'DELETE') return state.globalHaltDelete ?? res({ success: true, data: { status: 'running' } })
      return state.globalHaltPost ?? res({ success: true, data: { status: 'halted' } })
    }
    return res({ success: true, data: {} })
  }) as OrchestratorFetch
  return { fetchFn, calls }
}

const isMarketPost = (c: Call) => c.url.includes('/api/v1/admin/market') && c.method === 'POST'
const isHaltPost = (c: Call) => c.url.includes('/api/v1/admin/motor/global-halt') && c.method === 'POST'
const isHaltDelete = (c: Call) => c.url.includes('/api/v1/admin/motor/global-halt') && c.method === 'DELETE'

describe('orchestrateGlobalHalt — Pausar B -> C (B4) e gate HALT_ALL (B5)', () => {
  it('grava global-halt (B) ANTES de HALT_ALL no market (C) e confirma sucesso', async () => {
    const { fetchFn, calls } = fakeFetch({})
    const out = await orchestrateGlobalHalt('halt', VALID_REASON, fetchFn)

    expect(out.error).toBeNull()
    expect(out.checkCbPreserved).toBe(false)

    // B5 — gate de aceite: a orquestração TEM que acionar HALT_ALL (efeito C).
    const market = calls.find(isMarketPost)
    expect(market).toBeDefined()
    expect(JSON.parse(market!.body!).type).toBe('HALT_ALL')

    // B4 — ordem: B (POST global-halt) antes de C (POST market).
    const bIdx = calls.findIndex(isHaltPost)
    const cIdx = calls.findIndex(isMarketPost)
    expect(bIdx).toBeGreaterThanOrEqual(0)
    expect(bIdx).toBeLessThan(cIdx)
  })

  it('falha de B (efeito read-only) não tenta C e devolve erro fail-loud', async () => {
    const { fetchFn, calls } = fakeFetch({ globalHaltPost: res({ success: false }, 500) })
    const out = await orchestrateGlobalHalt('halt', VALID_REASON, fetchFn)

    expect(out.error).toMatch(/Falha ao bloquear novas ordens/)
    expect(calls.some(isMarketPost)).toBe(false) // C nunca roda se B falhou
  })

  it('falha de C com 429 informa o limite por minuto (B confirmado)', async () => {
    const { fetchFn, calls } = fakeFetch({ market: res({ success: false, error: { code: 'RATE_001' } }, 429) })
    const out = await orchestrateGlobalHalt('halt', VALID_REASON, fetchFn)

    expect(out.error).toMatch(/limite de ações por minuto/i)
    expect(calls.some(isHaltPost)).toBe(true)
    expect(calls.some(isMarketPost)).toBe(true)
  })

  it('falha genérica de C reporta motor não confirmado', async () => {
    const { fetchFn } = fakeFetch({ market: res({ success: false }, 500) })
    const out = await orchestrateGlobalHalt('halt', VALID_REASON, fetchFn)
    expect(out.error).toMatch(/motor real não confirmou a pausa/i)
  })

  it('2xx do market sem confirmação applied do motor não é tratado como pausa real', async () => {
    const { fetchFn } = fakeFetch({
      motorStatus: res({
        success: true,
        data: {
          operational: {
            command: { commandId: 'halt-cmd', type: 'HALT_ALL', state: 'published', applied: false },
            db: { haltAllCount: 0 },
          },
        },
      }),
    })
    const out = await orchestrateGlobalHalt('halt', VALID_REASON, fetchFn)
    expect(out.error).toMatch(/não confirmou HALT_ALL aplicado/i)
  })
})

describe('orchestrateGlobalHalt — Retomar C -> B (B4)', () => {
  it('aciona RESUME_ALL no market (C) ANTES de liberar ordens via DELETE (B)', async () => {
    const { fetchFn, calls } = fakeFetch({})
    const out = await orchestrateGlobalHalt('resume', VALID_REASON, fetchFn)

    expect(out.error).toBeNull()
    expect(out.checkCbPreserved).toBe(true) // resume com sucesso checa CB preservado

    const market = calls.find(isMarketPost)
    expect(JSON.parse(market!.body!).type).toBe('RESUME_ALL')

    const cIdx = calls.findIndex(isMarketPost)
    const bIdx = calls.findIndex(isHaltDelete)
    expect(cIdx).toBeGreaterThanOrEqual(0)
    expect(cIdx).toBeLessThan(bIdx)
  })

  it('falha de C (429) ao retomar não libera ordens e mantém estado bloqueado', async () => {
    const { fetchFn, calls } = fakeFetch({ market: res({ success: false }, 429) })
    const out = await orchestrateGlobalHalt('resume', VALID_REASON, fetchFn)

    expect(out.error).toMatch(/Limite de ações por minuto atingido/)
    expect(out.checkCbPreserved).toBe(false)
    expect(calls.some(isHaltDelete)).toBe(false) // B (liberar) não roda se C falhou
  })

  it('falha de B (liberar ordens) após C confirmado é fail-loud', async () => {
    const { fetchFn } = fakeFetch({ globalHaltDelete: res({ success: false }, 500) })
    const out = await orchestrateGlobalHalt('resume', VALID_REASON, fetchFn)
    expect(out.error).toMatch(/liberação de ordens não confirmou/i)
    expect(out.checkCbPreserved).toBe(false)
  })
})

describe('orchestrateGlobalHalt — erro de rede (Zero Silêncio)', () => {
  it('exceção de rede vira mensagem fail-loud, nunca silêncio', async () => {
    const { fetchFn } = fakeFetch({ throwOn: '/api/v1/admin/motor/global-halt' })
    const out = await orchestrateGlobalHalt('halt', VALID_REASON, fetchFn)
    expect(out.error).toMatch(/Erro de rede ao orquestrar/)
  })
})

describe('MotorPageClient — guard estrutural do contrato B4 (reconciliação)', () => {
  const src = readFileSync(
    join(process.cwd(), 'src/app/admin/motor/MotorPageClient.tsx'),
    'utf8'
  )

  it('delega a sequência B/C ao orquestrador puro', () => {
    expect(src).toContain('orchestrateGlobalHalt(flow, reason, fetch)')
  })

  it('reconcilia (GET global-halt) em TODOS os caminhos: chamada incondicional, sem early-return na orquestração', () => {
    // Extrai o corpo de runGlobalHalt e prova que reconcileHaltState() é chamado
    // após a orquestração sem nenhum `return` que pule a reconciliação.
    const start = src.indexOf('const runGlobalHalt =')
    const body = src.slice(start, src.indexOf('\n  }', start))
    expect(body).toContain('await orchestrateGlobalHalt(')
    expect(body).toContain('await reconcileHaltState()')
    // Nenhum early-return dentro de runGlobalHalt: a reconciliação nunca é pulada.
    expect(/\breturn\b/.test(body)).toBe(false)
  })
})
