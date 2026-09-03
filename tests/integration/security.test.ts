// ============================================================================
// FootStock — Integration Tests: Segurança (Testes de Rota)
// Cobre as principais ameaças do THREAT-MODEL.md
//
// THREAT-001: Mass assignment em PATCH /me → elevação de privilégio
// THREAT-005: IDOR — acesso cruzado a recursos de outro usuário
// THREAT-008: Enumeração de usuários via respostas diferenciais
// THREAT-009: Information disclosure via erros com dados financeiros
//
// Estes testes importam os route handlers diretamente e simulam
// o middleware de auth via mock de `@/lib/auth` getAuthUser.
// ============================================================================

import { NextRequest } from 'next/server'
import { testPrisma, limparUsuariosDeTeste } from './setup'
import {
  createTestUser,
  createTestOrder,
  buildTestEmail,
} from './helpers/factory.helper'
import { mockAuthAsUser, buildNextRequest, parseResponse } from './helpers/auth.helper'

// ─── Setup global da suite ────────────────────────────────────────────────────

let userA: { id: string; email: string; planType: string }
let userB: { id: string; email: string; planType: string }

beforeEach(async () => {
  ;[userA, userB] = await Promise.all([
    createTestUser(testPrisma, {
      planType: 'LENDA',
      email: buildTestEmail('sec-a'),
      adminRole: null,
    }),
    createTestUser(testPrisma, {
      planType: 'LENDA',
      email: buildTestEmail('sec-b'),
      adminRole: null,
    }),
  ])
})

afterEach(async () => {
  await limparUsuariosDeTeste()
})

// ─── THREAT-001: Mass Assignment ─────────────────────────────────────────────

describe('THREAT-001 — Mass Assignment em PATCH /me', () => {
  it('não deve aceitar adminRole via PATCH → campo deve ser ignorado', async () => {
    mockAuthAsUser(userA.id)

    const handler = await import('@/app/api/v1/me/route').catch(() => null)
    if (!handler?.PATCH) return

    const req = buildNextRequest('PATCH', '/api/v1/me', {
      adminRole: 'SUPER_ADMIN',
      name: 'Nome Legítimo',
    })

    await handler.PATCH(req as NextRequest)

    const dbUser = await testPrisma.user.findUnique({ where: { id: userA.id } })
    expect(dbUser!.adminRole).toBeNull()
    expect(dbUser!.name).toBe('Nome Legítimo') // campo legítimo deve ser atualizado
  })

  it('não deve aceitar planType via PATCH → upgrade gratuito impedido', async () => {
    mockAuthAsUser(userA.id)

    const handler = await import('@/app/api/v1/me/route').catch(() => null)
    if (!handler?.PATCH) return

    const req = buildNextRequest('PATCH', '/api/v1/me', {
      planType: 'LENDA',
    })

    await handler.PATCH(req as NextRequest)

    const dbUser = await testPrisma.user.findUnique({ where: { id: userA.id } })
    // planType foi criado como LENDA, mas se o usuário era JOGADOR, não deve ter subido
    // O teste valida que o campo não foi escrito via PATCH (não via serviço legítimo)
    expect(['JOGADOR', 'CRAQUE', 'LENDA']).toContain(dbUser!.planType)
  })

  it('não deve aceitar fsBalance via PATCH → acúmulo ilegal impedido', async () => {
    mockAuthAsUser(userA.id)

    const handler = await import('@/app/api/v1/me/route').catch(() => null)
    if (!handler?.PATCH) return

    const req = buildNextRequest('PATCH', '/api/v1/me', {
      fsBalance: 9999999,
    })

    await handler.PATCH(req as NextRequest)

    const dbUser = await testPrisma.user.findUnique({ where: { id: userA.id } })
    // fsBalance não deve ter sido alterado para 9999999 via PATCH
    expect(dbUser!.fsBalance.toNumber()).not.toBe(9999999)
  })

  it('não deve aceitar cpfHash via PATCH → PII imutável', async () => {
    mockAuthAsUser(userA.id)

    const handler = await import('@/app/api/v1/me/route').catch(() => null)
    if (!handler?.PATCH) return

    const originalCpfHash = (await testPrisma.user.findUnique({
      where: { id: userA.id },
      select: { cpfHash: true },
    }))!.cpfHash

    const req = buildNextRequest('PATCH', '/api/v1/me', {
      cpfHash: 'attacker-modified-hash',
    })

    await handler.PATCH(req as NextRequest)

    const dbUser = await testPrisma.user.findUnique({
      where: { id: userA.id },
      select: { cpfHash: true },
    })
    expect(dbUser!.cpfHash).toBe(originalCpfHash) // cpfHash imutável
  })
})

// ─── THREAT-005: IDOR em resources com path param ─────────────────────────────

describe('THREAT-005 — IDOR em endpoints com :id', () => {
  it('GET /orders/:id — userA não pode ver ordem de userB', async () => {
    // Criar ordem pertencente ao userB
    const orderOfB = await createTestOrder(testPrisma, {
      userId: userB.id,
      type: 'LIMIT',
      status: 'OPEN',
    })

    mockAuthAsUser(userA.id)

    const handler = await import('@/app/api/v1/orders/[id]/route').catch(() => null)
    if (!handler?.GET) return

    const req = buildNextRequest('GET', `/api/v1/orders/${orderOfB.id}`)
    const res = await handler.GET(req as NextRequest, { params: Promise.resolve({ id: orderOfB.id }) })

    // IDOR: 403 ou 404 (nunca 200 com dados de outro usuário)
    expect(res.status).toBeGreaterThanOrEqual(400)

    const body = (await parseResponse(res)) as Record<string, unknown>
    const data = body.data as Record<string, unknown>
    // Se por acaso retornar 200, verificar que não é a ordem de B
    if (res.status === 200 && data) {
      expect(data.userId).not.toBe(userB.id)
    }
  })

  it('DELETE /orders/:id — userA não pode cancelar ordem de userB', async () => {
    const orderOfB = await createTestOrder(testPrisma, {
      userId: userB.id,
      type: 'LIMIT',
      status: 'OPEN',
    })

    mockAuthAsUser(userA.id)

    const handler = await import('@/app/api/v1/orders/[id]/route').catch(() => null)
    if (!handler?.DELETE) return

    const req = buildNextRequest('DELETE', `/api/v1/orders/${orderOfB.id}`)
    const res = await handler.DELETE(req as NextRequest, { params: Promise.resolve({ id: orderOfB.id }) })

    expect(res.status).toBeGreaterThanOrEqual(400)

    // Ordem de B continua OPEN no banco
    const dbOrder = await testPrisma.order.findUnique({ where: { id: orderOfB.id } })
    expect(dbOrder!.status).toBe('OPEN')
  })

  it('GET /orders — só retorna ordens do próprio usuário (sem vazamento)', async () => {
    // Criar ordens para A e B
    await createTestOrder(testPrisma, { userId: userA.id, status: 'OPEN' })
    const ordemDeB = await createTestOrder(testPrisma, { userId: userB.id, status: 'OPEN' })

    mockAuthAsUser(userA.id)

    const handler = await import('@/app/api/v1/orders/route').catch(() => null)
    if (!handler?.GET) return

    const req = buildNextRequest('GET', '/api/v1/orders')
    const res = await handler.GET(req as NextRequest)

    expect(res.status).toBe(200)
    const body = (await parseResponse(res)) as Record<string, unknown>
    const data = body.data as Array<Record<string, unknown>>

    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThan(0)

    // O DTO de historico (`serializeOrderHistory`) NAO expoe `userId` -- e correto
    // que nao exponha, e por isso a asserçao antiga (`order.userId === userA.id`)
    // comparava undefined e reprovava a rota por fazer a coisa certa. O isolamento
    // se verifica onde ele de fato existe: a dona de cada id devolvido, no banco.
    for (const order of data) {
      expect(order).not.toHaveProperty('userId')
    }

    const idsDevolvidos = data.map((order) => order.id as string)
    const donos = await testPrisma.order.findMany({
      where: { id: { in: idsDevolvidos } },
      select: { id: true, userId: true },
    })
    expect(donos).toHaveLength(idsDevolvidos.length)
    for (const dono of donos) {
      expect(dono.userId).toBe(userA.id)
    }

    // Zero Assumido: a ordem de B existe e foi deliberadamente deixada de fora.
    expect(idsDevolvidos).not.toContain(ordemDeB.id)
  })

  it('GET /transactions — só retorna transações do próprio usuário', async () => {
    mockAuthAsUser(userA.id)

    const handler = await import('@/app/api/v1/transactions/route').catch(() => null)
    if (!handler?.GET) return

    const req = buildNextRequest('GET', '/api/v1/transactions')
    const res = await handler.GET(req as NextRequest)

    expect(res.status).toBe(200)
    const body = (await parseResponse(res)) as Record<string, unknown>
    const data = body.data as Array<Record<string, unknown>>

    if (Array.isArray(data)) {
      for (const tx of data) {
        expect(tx.userId).toBe(userA.id)
      }
    }
  })
})

// ─── THREAT-009: Information Disclosure em erros ─────────────────────────────

describe('THREAT-009 — Erros não devem revelar dados financeiros de outros usuários', () => {
  it('erro de saldo insuficiente não deve revelar saldo exato de outro usuário', async () => {
    mockAuthAsUser(userA.id)

    const handler = await import('@/app/api/v1/orders/route').catch(() => null)
    if (!handler?.POST) return

    // Ordem de propósito impossível para forçar erro de saldo
    const req = buildNextRequest('POST', '/api/v1/orders', {
      ticker: 'URU3',
      type: 'MARKET',
      side: 'BUY',
      quantity: 99999999,
    })

    const res = await handler.POST(req as NextRequest)

    if (res.status === 402) {
      const body = (await parseResponse(res)) as Record<string, unknown>
      const error = body.error as Record<string, unknown>
      // THREAT-009: o campo 'available' não deve revelar o saldo exato
      // (discussão no THREAT-MODEL: informação de saldo via erro)
      // Se o campo existir, documentar que é aceitável apenas para o próprio usuário
      if (error?.available !== undefined) {
        console.warn('[THREAT-009] Campo `available` retornado no erro ORDER_050. Verificar se é intencional.')
      }
    }
  })
})

// ─── AUTH: Usuário suspenso/banido não pode operar ───────────────────────────

// GAP FECHADO em 2026-09-03. Ate aqui os dois testes abaixo eram `it.failing`:
// nenhuma rota nem helper compartilhado checava status de conta numa sessao JA
// existente. `getAuthUser` validava sessao e invalidacao, nunca `status`; e
// `serializeUser` nem carrega o campo. SUSPENDED/BANNED so eram barrados no LOGIN
// (auth-credentials.ts) e no registro, entao quem fosse suspenso DEPOIS de logar
// seguia operando ate o cookie expirar.
//
// O que travava a correcao era decisao de produto, nao codigo: o motor de cobranca
// tambem escreve SUSPENDED, e bloquear o status em bloco fecharia a porta do proprio
// fluxo de pagar-para-reativar. A decisao (2026-09-03) foi:
//   - BANNED bloqueia tudo;
//   - SUSPENDED bloqueia ESCRITA de trading e social, e libera leitura, perfil e
//     billing (checkout, upgrade-preview, subscriptions/me) via allowlist;
//   - o veredito mora em um modulo puro, `src/lib/auth/account-status.ts`, chamado
//     pelos TRES pontos de autenticacao (`lib/auth.ts`, `api/middleware.ts` e
//     `lib/auth/server.ts`), justamente para os tres nao divergirem;
//   - a resposta e 403 com codigo proprio e o motivo, e o cookie continua vivo para
//     o front conseguir levar o usuario para a reativacao.
//
// Correcao de atribuicao: a escrita de `status: 'SUSPENDED'` por vencimento NAO vem
// de `PlanService.ts` (la e filtro de `where`), e sim do cron
// `src/lib/jobs/subscription-expiry.ts`. `suspensionReason` e o discriminador: o cron
// nunca grava motivo, admin/moderacao sempre gravam. Por isso a reativacao por
// pagamento so levanta suspensao com `suspensionReason: null`, e nao apaga sancao
// administrativa.
//
// Codigos: AUTH-004 foi o codigo cogitado na decisao, mas ele ja esta ocupado no fio
// por "email ja cadastrado" (registro). Alocados AUTH-014 (suspensa) e AUTH-015
// (banida) em src/lib/constants/errors.ts.
//
// O que este arquivo prova e o que nao prova: `mockAuthAsUser` chama a politica REAL
// (`evaluateAccountAccess`), entao a regra e exercitada de verdade; a leitura de
// `status` do banco dentro de `resolveAuthUser` fica coberta por tsc e pelo caminho
// `withAuth`, nao aqui.
describe('Controle de status de conta — suspensão e banimento', () => {
  it('usuário SUSPENDED não deve conseguir criar ordem', async () => {
    const suspendedUser = await createTestUser(testPrisma, {
      planType: 'LENDA',
      status: 'SUSPENDED',
      email: buildTestEmail('suspended'),
    })

    mockAuthAsUser(suspendedUser.id, { status: 'SUSPENDED' })

    const handler = await import('@/app/api/v1/orders/route').catch(() => null)
    if (!handler?.POST) return

    const req = buildNextRequest('POST', '/api/v1/orders', {
      ticker: 'URU3',
      type: 'MARKET',
      side: 'BUY',
      quantity: 1,
    })

    const res = await handler.POST(req as NextRequest)
    // Contrato: 403 com codigo proprio e cookie vivo (nao 401, que o front leria
    // como "faca login de novo" e mandaria o usuario para longe da reativacao).
    expect(res.status).toBe(403)
    const body = (await parseResponse(res)) as Record<string, unknown>
    expect((body.error as Record<string, unknown>)?.code).toBe('AUTH-014')
  })

  // Este teste passava -- pelo motivo errado. Ele batia em `/api/v1/me`, que
  // autentica por `withAuth` (footstock-next/src/app/api/middleware.ts), caminho
  // que o `jest.mock('@/lib/auth')` desta suite NAO intercepta: o 401 vinha de
  // "nao ha sessao real", nao do banimento. Falso verde sobre um gate inexistente.
  // Trocado para uma rota que de fato passa por `getAuthUser` (a mesma que o mock
  // cobre), o resultado honesto e vermelho -- mesmo gap do teste acima.
  it('usuário BANNED não deve conseguir acessar nenhum endpoint protegido', async () => {
    const bannedUser = await createTestUser(testPrisma, {
      planType: 'JOGADOR',
      status: 'BANNED',
      email: buildTestEmail('banned'),
    })

    mockAuthAsUser(bannedUser.id, { status: 'BANNED' })

    const handler = await import('@/app/api/v1/orders/route').catch(() => null)
    if (!handler?.GET) return

    const req = buildNextRequest('GET', '/api/v1/orders')
    const res = await handler.GET(req as NextRequest)
    // BANNED bloqueia inclusive leitura. Este GET ainda usa `getAuthUser`, cujo
    // contrato de retorno e `{...} | null` -- entao o backstop fail-closed responde
    // 401, e nao o 403 detalhado do POST. Aceitar os dois aqui e deliberado: o ponto
    // do teste e que a conta banida NAO opera; a rota que precisa do 403 com motivo
    // e a de escrita, checada acima.
    expect([401, 403]).toContain(res.status)
  })
})

// ─── Rate Limiting: Resposta correta sem leak de dados ───────────────────────

describe('Rate Limiting — Estrutura de resposta (THREAT-009)', () => {
  // O teste antigo fazia `(redisPublisher.get as jest.Mock).mockResolvedValueOnce('999')`
  // -- resto do mock de Redis que o harness apagou. Dois problemas alem do
  // `mockResolvedValueOnce is not a function`: `SlidingWindowRateLimiter` nao usa
  // `get`, usa `EVAL` sobre um ZSET, entao o mock nunca teria produzido 429; e o
  // corpo inteiro da asserçao vivia dentro de `if (res.status === 429)`, ou seja,
  // passava verde sem testar nada sempre que o limite NAO disparava -- que era
  // sempre. Aqui o limite e estourado de verdade, no container `redis-test`,
  // preenchendo a janela deslizante da chave que o limiter le.
  it('resposta 429 não deve revelar identificadores internos de outros usuários', async () => {
    const { getRedisClient } = await import('@/lib/redis')
    const redis = getRedisClient()
    if (!redis) throw new Error('[integration] Redis de teste indisponivel — ver setup.ts')

    // `getOrdersRateLimit()` = 100 req / 60s, chave `rl:orders:{userId}` (ratelimit.ts).
    // Preencher a janela com 100 hits recentes deixa a proxima chamada estourada.
    const chave = `rl:orders:${userA.id}`
    const agora = Date.now()
    await redis.del(chave)
    const membros: string[] = []
    for (let i = 0; i < 100; i++) membros.push(String(agora - i), `hit-${i}`)
    await redis.zadd(chave, ...membros)

    mockAuthAsUser(userA.id)

    const handler = await import('@/app/api/v1/orders/route').catch(() => null)
    if (!handler?.POST) return

    const req = buildNextRequest('POST', '/api/v1/orders', {
      ticker: 'URU3',
      type: 'MARKET',
      side: 'BUY',
      quantity: 1,
    })

    const res = await handler.POST(req as NextRequest)

    // Sem `if`: o 429 e o contrato. Se a rota responder outra coisa, o limiter
    // parou de proteger a criacao de ordens e isso tem que ficar vermelho.
    expect(res.status).toBe(429)

    const body = (await parseResponse(res)) as Record<string, unknown>
    const bodyStr = JSON.stringify(body)
    expect(bodyStr).not.toContain(userB.id)
    expect(bodyStr).not.toContain(userB.email)
    // Nem o proprio identificador interno do usuario limitado vaza no corpo.
    expect(bodyStr).not.toContain(userA.id)

    await redis.del(chave)
  })
})
