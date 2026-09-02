/**
 * Regressao 2026-09-02 — ALWAYS_ON_TYPES tinha DUAS definicoes.
 *
 * `src/lib/repositories/NotificationRepository.ts` decide o que e ESCRITO
 * (`upsertPreference` faz early-return em tipo always-on) e
 * `src/app/api/v1/users/me/notification-preferences/route.ts` decidia, com uma
 * copia literal propria, o que a TELA mostra (`isUrgent`, e o `continue` do PUT).
 *
 * Enquanto as duas listas eram identicas o defeito ficou latente. Ao tornar
 * ORDER_CANCELLED always-on so no repositorio, a rota passou a oferecer o toggle
 * como editavel: o PUT nao pulava o tipo, chamava `upsertPreference`, que
 * descartava a escrita em silencio, e a resposta 200 devolvia o estado antigo com
 * `isUrgent:false`. O front exibia "Preferencias salvas." e o toggle voltava.
 *
 * Estes testes travam a fonte unica. Se alguem redeclarar a lista na rota, o
 * teste de origem do modulo quebra ANTES de o toggle mentir de novo em producao.
 *
 * `@/lib/prisma` e mockado: o modulo real importa 'server-only' e abre conexao no
 * import.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

jest.mock('@/lib/auth', () => ({ getAuthUser: jest.fn() }))

const upsertPreference = jest.fn()
const getPreferences = jest.fn()

jest.mock('@/lib/prisma', () => ({ prisma: {} }))

import { getAuthUser } from '@/lib/auth'
import { ALWAYS_ON_TYPES, notificationRepository } from '@/lib/repositories/NotificationRepository'
import { GET, PUT } from '@/app/api/v1/users/me/notification-preferences/route'

const mockGetAuthUser = getAuthUser as jest.Mock
const AUTH = { user: { id: 'u1', name: 'Tester', email: 't@t.com', planType: 'JOGADOR' } }

type PrefRow = { notificationType: string; inAppEnabled: boolean; pushEnabled: boolean; emailEnabled: boolean; isUrgent: boolean }

function putRequest(body: unknown) {
  return { json: async () => body } as unknown as Parameters<typeof PUT>[0]
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetAuthUser.mockResolvedValue(AUTH)
  getPreferences.mockResolvedValue({})
  ;(notificationRepository as unknown as Record<string, unknown>).upsertPreference = upsertPreference
  ;(notificationRepository as unknown as Record<string, unknown>).getPreferences = getPreferences
})

describe('ALWAYS_ON_TYPES — fonte unica repositorio <-> rota', () => {
  test('a rota importa a lista e nao redeclara um Set proprio', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/app/api/v1/users/me/notification-preferences/route.ts'),
      'utf8'
    )
    expect(src).toMatch(/import\s*\{[^}]*\bALWAYS_ON_TYPES\b[^}]*\}\s*from\s*'@\/lib\/repositories\/NotificationRepository'/)
    // Qualquer `const ALWAYS_ON_TYPES = ...` na rota recria a divergencia.
    expect(src).not.toMatch(/(?:const|let|var)\s+ALWAYS_ON_TYPES\s*=/)
  })

  test('ORDER_CANCELLED e ORDER_EXECUTED sao always-on no mesmo Set', () => {
    expect(ALWAYS_ON_TYPES.has('ORDER_EXECUTED')).toBe(true)
    expect(ALWAYS_ON_TYPES.has('ORDER_CANCELLED')).toBe(true)
  })
})

describe('GET /notification-preferences', () => {
  test('devolve isUrgent:true e canais ligados para ORDER_CANCELLED', async () => {
    // Estado herdado: o usuario tinha desligado in-app antes de o tipo virar urgente.
    getPreferences.mockResolvedValue({
      ORDER_CANCELLED: { inApp: false, push: false, email: false },
    })

    const res = await GET()
    const body = await res.json()
    const row = (body.data as PrefRow[]).find((r) => r.notificationType === 'ORDER_CANCELLED')

    expect(row).toBeDefined()
    expect(row!.isUrgent).toBe(true)
    // A tela precisa concordar com a entrega: isChannelEnabled devolve true para
    // always-on independente do que esta salvo. Mostrar o toggle desligado era a
    // UI mentindo na direcao oposta — usuario ve "desligado" e recebe assim mesmo.
    expect(row!.inAppEnabled).toBe(true)
    expect(row!.pushEnabled).toBe(true)
    expect(row!.emailEnabled).toBe(true)
  })

  test('tipo nao urgente continua respeitando o que esta salvo', async () => {
    getPreferences.mockResolvedValue({
      MARGIN_CALL_WARNING: { inApp: false, push: false, email: true },
    })

    const res = await GET()
    const body = await res.json()
    const row = (body.data as PrefRow[]).find((r) => r.notificationType === 'MARGIN_CALL_WARNING')

    expect(row).toBeDefined()
    expect(row!.isUrgent).toBe(false)
    expect(row!.inAppEnabled).toBe(false)
    expect(row!.emailEnabled).toBe(true)
  })
})

describe('PUT /notification-preferences', () => {
  test('nao tenta persistir ORDER_CANCELLED (sem escrita descartada em silencio)', async () => {
    const res = await PUT(
      putRequest([{ notificationType: 'ORDER_CANCELLED', inAppEnabled: false }])
    )

    expect(res.status).toBe(200)
    expect(upsertPreference).not.toHaveBeenCalled()

    const body = await res.json()
    const row = (body.data as PrefRow[]).find((r) => r.notificationType === 'ORDER_CANCELLED')
    expect(row!.isUrgent).toBe(true)
    expect(row!.inAppEnabled).toBe(true)
  })

  test('tipo nao urgente continua sendo persistido', async () => {
    const res = await PUT(putRequest([{ notificationType: 'MARGIN_CALL_WARNING', inAppEnabled: false }]))

    expect(res.status).toBe(200)
    expect(upsertPreference).toHaveBeenCalledTimes(1)
    expect(upsertPreference).toHaveBeenCalledWith('u1', 'MARGIN_CALL_WARNING', {
      inApp: false,
      push: undefined,
      email: undefined,
    })
  })
})
