/**
 * Testes unitários — cron GET /api/cron/reconcile-null-tickers (hardening 2026-06-23).
 * Safety-net que re-resolve o ticker de notícias publicadas ainda "sem time".
 */

import { NextRequest } from 'next/server'

jest.mock('@/lib/env', () => ({ env: { CRON_SECRET: 'cron-secret-123' } }))

const newsFindMany = jest.fn()
const newsUpdate = jest.fn()
const assetFindUnique = jest.fn()
jest.mock('@/lib/prisma', () => ({
  prisma: {
    news: {
      findMany: (...a: unknown[]) => newsFindMany(...a),
      update: (...a: unknown[]) => newsUpdate(...a),
    },
    asset: { findUnique: (...a: unknown[]) => assetFindUnique(...a) },
  },
}))

const resolveTickerFromTitle = jest.fn()
jest.mock('@/lib/utils/resolve-ticker', () => ({
  resolveTickerFromTitle: (...a: unknown[]) => resolveTickerFromTitle(...a),
}))

import { GET } from '@/app/api/cron/reconcile-null-tickers/route'

const AUTH = 'Bearer cron-secret-123'

function req(opts: { auth?: string; query?: string } = {}): NextRequest {
  const headers: Record<string, string> = {}
  if (opts.auth !== undefined) headers['authorization'] = opts.auth
  return new NextRequest(`http://localhost:3000/api/cron/reconcile-null-tickers${opts.query ?? ''}`, {
    method: 'GET',
    headers,
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  newsFindMany.mockResolvedValue([])
  newsUpdate.mockResolvedValue({ id: 'x' })
  assetFindUnique.mockResolvedValue({ id: 'asset-1' })
})

describe('reconcile-null-tickers — auth', () => {
  it('401 sem Authorization', async () => {
    const res = await GET(req())
    expect(res.status).toBe(401)
  })
  it('401 com secret errado', async () => {
    const res = await GET(req({ auth: 'Bearer wrong' }))
    expect(res.status).toBe(401)
  })
})

describe('reconcile-null-tickers — só notícias publicadas sem ticker', () => {
  it('filtra is_published=true e ticker null/empty', async () => {
    await GET(req({ auth: AUTH }))
    const arg = newsFindMany.mock.calls[0][0] as { where: Record<string, unknown> }
    expect(arg.where.isPublished).toBe(true)
    expect(arg.where.OR).toEqual([{ ticker: null }, { ticker: '' }])
  })
})

describe('reconcile-null-tickers — resolução', () => {
  it('linka ticker + assetIds quando o título resolve', async () => {
    newsFindMany.mockResolvedValue([{ id: 'n1', title: 'Palmeiras vence o clássico' }])
    resolveTickerFromTitle.mockResolvedValue('POR3')

    const res = await GET(req({ auth: AUTH }))
    const body = await res.json()

    expect(resolveTickerFromTitle).toHaveBeenCalledWith('Palmeiras vence o clássico')
    expect(newsUpdate).toHaveBeenCalledWith({
      where: { id: 'n1' },
      data: { ticker: 'POR3', assetIds: ['asset-1'] },
    })
    expect(body.reconciled).toBe(1)
    expect(body.no_match).toBe(0)
    expect(body.success).toBe(true)
  })

  it('conta no_match e NÃO atualiza quando o título não resolve (seleção/exterior)', async () => {
    newsFindMany.mockResolvedValue([{ id: 'n2', title: 'Cristiano Ronaldo brilha por Portugal na Copa' }])
    resolveTickerFromTitle.mockResolvedValue(null)

    const res = await GET(req({ auth: AUTH }))
    const body = await res.json()

    expect(newsUpdate).not.toHaveBeenCalled()
    expect(body.reconciled).toBe(0)
    expect(body.no_match).toBe(1)
  })

  it('grava ticker mesmo sem asset correspondente (assetIds vazio)', async () => {
    newsFindMany.mockResolvedValue([{ id: 'n3', title: 'Vasco anuncia reforço' }])
    resolveTickerFromTitle.mockResolvedValue('CRZ3')
    assetFindUnique.mockResolvedValue(null)

    await GET(req({ auth: AUTH }))
    expect(newsUpdate).toHaveBeenCalledWith({
      where: { id: 'n3' },
      data: { ticker: 'CRZ3' },
    })
  })
})
