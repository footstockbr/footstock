import { readFileSync } from 'fs'
import { join } from 'path'
import {
  evaluateAccountAccess,
  isAccountBlocked,
  ACCOUNT_BLOCKED_CODES,
  __SUSPENDED_WRITE_ALLOWLIST,
} from '@/lib/auth/account-status'

// Politica de status de conta em sessao JA EMITIDA (decisao 2026-09-03).
// O modulo e puro de proposito: e a unica fonte de verdade consumida pelos TRES
// pontos de autenticacao do app, e testa-lo aqui e o que impede os tres de
// divergirem sem ninguem perceber.

describe('evaluateAccountAccess — conta liberada', () => {
  it('ACTIVE passa em leitura e em escrita', () => {
    expect(evaluateAccountAccess({ status: 'ACTIVE' }, { method: 'POST', pathname: '/api/v1/orders' })).toBeNull()
    expect(evaluateAccountAccess({ status: 'ACTIVE' }, { method: 'GET', pathname: '/api/v1/orders' })).toBeNull()
  })

  it('status ausente é tratado como ACTIVE (usuário legado, sem coluna preenchida)', () => {
    expect(evaluateAccountAccess({}, { method: 'POST', pathname: '/api/v1/orders' })).toBeNull()
    expect(evaluateAccountAccess({ status: null }, { method: 'POST' })).toBeNull()
  })
})

describe('evaluateAccountAccess — BANNED', () => {
  it('barra até leitura: banimento é terminal e não tem auto-serviço de saída', () => {
    const r = evaluateAccountAccess({ status: 'BANNED' }, { method: 'GET', pathname: '/api/v1/orders' })
    expect(r).toMatchObject({ code: ACCOUNT_BLOCKED_CODES.BANNED, httpStatus: 403 })
  })

  it('barra o caminho de pagamento também — pagar não é saída de banimento', () => {
    expect(isAccountBlocked({ status: 'BANNED' }, { method: 'POST', pathname: '/api/v1/payments/checkout' })).toBe(true)
  })

  it('propaga o motivo registrado pela moderação', () => {
    const r = evaluateAccountAccess({ status: 'BANNED', suspensionReason: 'multi-conta' }, { method: 'GET' })
    expect(r?.reason).toBe('multi-conta')
  })
})

describe('evaluateAccountAccess — SUSPENDED', () => {
  it('bloqueia escrita de trading', () => {
    const r = evaluateAccountAccess({ status: 'SUSPENDED' }, { method: 'POST', pathname: '/api/v1/orders' })
    expect(r).toMatchObject({ code: ACCOUNT_BLOCKED_CODES.SUSPENDED, httpStatus: 403 })
  })

  it('bloqueia escrita social (fórum e ligas)', () => {
    expect(isAccountBlocked({ status: 'SUSPENDED' }, { method: 'POST', pathname: '/api/v1/forum' })).toBe(true)
    expect(isAccountBlocked({ status: 'SUSPENDED' }, { method: 'POST', pathname: '/api/v1/leagues' })).toBe(true)
  })

  it('libera leitura: o usuário precisa ver o próprio patrimônio para decidir se paga', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS', 'get']) {
      expect(isAccountBlocked({ status: 'SUSPENDED' }, { method, pathname: '/api/v1/orders' })).toBe(false)
    }
  })

  it('libera a escrita do caminho de pagamento (senão o estado não teria saída)', () => {
    expect(isAccountBlocked({ status: 'SUSPENDED' }, { method: 'POST', pathname: '/api/v1/payments/checkout' })).toBe(false)
    expect(isAccountBlocked({ status: 'SUSPENDED' }, { method: 'POST', pathname: '/api/v1/subscriptions/upgrade-preview' })).toBe(false)
  })

  it('a allowlist casa por segmento, não por prefixo de string solto', () => {
    // '/api/v1/paymentsX' NAO pode entrar por parecer com '/api/v1/payments'.
    expect(isAccountBlocked({ status: 'SUSPENDED' }, { method: 'POST', pathname: '/api/v1/paymentsX/burlar' })).toBe(true)
    expect(isAccountBlocked({ status: 'SUSPENDED' }, { method: 'POST', pathname: '/api/v1/payments' })).toBe(false)
  })

  it('fail-closed: sem método e sem pathname, trata como mutação e barra', () => {
    expect(isAccountBlocked({ status: 'SUSPENDED' }, {})).toBe(true)
    expect(isAccountBlocked({ status: 'SUSPENDED' })).toBe(true)
  })
})

describe('censo dos pontos de autenticação', () => {
  // Guarda de Zero Órfãos: a politica so vale se TODO caminho que resolve
  // identidade a consultar. Sao tres modulos distintos, dois deles com uma funcao
  // homonima `getAuthUser` -- exatamente o tipo de duplicidade que faz um deles
  // ser esquecido numa proxima mudanca.
  const PONTOS_DE_AUTENTICACAO = [
    'src/lib/auth.ts',
    'src/app/api/middleware.ts',
    'src/lib/auth/server.ts',
  ]

  it.each(PONTOS_DE_AUTENTICACAO)('%s consulta a política de status de conta', (arquivo) => {
    const fonte = readFileSync(join(process.cwd(), arquivo), 'utf-8')
    expect(fonte).toContain('evaluateAccountAccess')
  })

  it('a allowlist não cresceu para dentro de trading ou social sem revisão', () => {
    expect([...__SUSPENDED_WRITE_ALLOWLIST]).toEqual([
      '/api/v1/payments',
      '/api/v1/subscriptions',
      '/api/v1/users/me',
      '/api/v1/auth',
      '/api/v1/notifications',
      '/api/v1/push',
    ])
  })
})
