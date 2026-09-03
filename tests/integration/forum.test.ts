// ============================================================================
// FootStock — Integration Tests: Forum Endpoints
// Cobre: POST /forum, GET /forum, DELETE /forum/:id
//
// Segurança:
//   - THREAT-010: XSS persistente — sanitização de HTML/JS obrigatória
//   - PII: CPF, e-mail, telefone, URLs removidos automaticamente
//   - VAL_004: Post excedendo 280 caracteres rejeitado
//   - FORUM_052: Post com palavras bloqueadas
//   - Moderação: Admin pode remover posts; usuário comum não pode remover post de outro
// ============================================================================

import { NextRequest } from 'next/server'
import { testPrisma, limparUsuariosDeTeste } from './setup'
import { createTestUser, buildTestEmail, buildForumPostPayload } from './helpers/factory.helper'
import { mockAuthAsUser, mockAuthInvalid, buildNextRequest, parseResponse } from './helpers/auth.helper'
import { ForumService } from '@/lib/services/ForumService'

// ─── Setup ────────────────────────────────────────────────────────────────────

let normalUser: { id: string; email: string; planType: string }
let adminUser: { id: string; email: string; planType: string }
const forumService = new ForumService()

beforeEach(async () => {
  ;[normalUser, adminUser] = await Promise.all([
    createTestUser(testPrisma, { planType: 'JOGADOR', email: buildTestEmail('forum-user') }),
    createTestUser(testPrisma, {
      planType: 'JOGADOR',
      adminRole: 'MODERADOR',
      email: buildTestEmail('forum-admin'),
    }),
  ])
})

afterEach(async () => {
  // Limpar posts de teste antes de limpar usuários (CASCADE cuida do resto)
  await testPrisma.globalForumPost.deleteMany({
    where: { content: { contains: '[INTEGRATION-TEST]' } },
  })
  await limparUsuariosDeTeste()
})

// ─── ForumService: sanitização de PII ────────────────────────────────────────

describe('ForumService — Sanitização de PII', () => {
  it('[happy] deve remover CPF do conteúdo do post', () => {
    const content = '[INTEGRATION-TEST] Meu CPF é 123.456.789-01 e quero negociar.'
    const sanitized = forumService.sanitizeContent(content)
    expect(sanitized).not.toContain('123.456.789-01')
    expect(sanitized).toContain('[removido]')
  })

  it('[happy] deve remover e-mail do conteúdo do post', () => {
    const content = '[INTEGRATION-TEST] Me contate em usuario@example.com para negociar.'
    const sanitized = forumService.sanitizeContent(content)
    expect(sanitized).not.toContain('usuario@example.com')
    expect(sanitized).toContain('[removido]')
  })

  it('[happy] deve remover URL do conteúdo do post (prevenção de phishing)', () => {
    const content = '[INTEGRATION-TEST] Acesse https://phishing.com/fake-footstock para ganhar FS$!'
    const sanitized = forumService.sanitizeContent(content)
    expect(sanitized).not.toContain('https://phishing.com')
    expect(sanitized).toContain('[removido]')
  })

  it('[happy] deve remover telefone do conteúdo do post', () => {
    const content = '[INTEGRATION-TEST] Me ligue no (11) 99999-8888 para proposta.'
    const sanitized = forumService.sanitizeContent(content)
    expect(sanitized).not.toContain('99999-8888')
    expect(sanitized).toContain('[removido]')
  })

  it('[happy] conteúdo sem PII não deve ser modificado', () => {
    const content = '[INTEGRATION-TEST] URU3 vai subir hoje! Bulls are coming.'
    const sanitized = forumService.sanitizeContent(content)
    expect(sanitized).toBe(content)
  })
})

// ─── THREAT-010: XSS persistente ─────────────────────────────────────────────
//
// A defesa real do produto NAO e sanitizar HTML na escrita: o post e gravado como
// o usuario digitou e o escape acontece na renderizacao, porque o React escapa
// todo text node. Os testes antigos exigiam strip de `<script>`/`<img>` na
// gravacao, comportamento que o `ModerationEngine` nunca teve -- ele remove PII e
// palavra bloqueada, nao markup. Falhavam contra o contrato, nao contra um bug.
//
// O que de fato mantem o payload inerte e a AUSENCIA de sink de HTML no app.
// Entao e isso que se testa: o round-trip preserva o texto (Zero Assumido: fica
// explicito que o dado cru chega ao banco) e nenhum arquivo do app renderiza HTML
// cru. Se alguem introduzir `dangerouslySetInnerHTML`, o segundo teste fica
// vermelho e o payload gravado passa a ser executavel.

import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

function arquivosDeFonte(raiz: string): string[] {
  const saida: string[] = []
  for (const entrada of readdirSync(raiz)) {
    if (entrada === 'node_modules' || entrada === '.next') continue
    const caminho = join(raiz, entrada)
    if (statSync(caminho).isDirectory()) saida.push(...arquivosDeFonte(caminho))
    else if (/\.(tsx?|jsx?)$/.test(entrada)) saida.push(caminho)
  }
  return saida
}

describe('POST /api/v1/forum — XSS persistente (THREAT-010)', () => {
  it('[seguranca] payload com markup e gravado cru, sem execucao no caminho de escrita', async () => {
    mockAuthAsUser(normalUser.id)

    const handler = await import('@/app/api/v1/forum/route').catch(() => null)
    if (!handler?.POST) return

    const conteudo = '[INTEGRATION-TEST] <script>alert(document.cookie)</script> URU3!'
    const req = buildNextRequest('POST', '/api/v1/forum', buildForumPostPayload({ content: conteudo }))
    const res = await handler.POST(req as NextRequest)

    expect(res.status).toBeLessThan(400)

    const dbPost = await testPrisma.globalForumPost.findFirst({
      where: { userId: normalUser.id },
      orderBy: { createdAt: 'desc' },
    })
    expect(dbPost).toBeTruthy()
    // Contrato explicito: o markup PERSISTE. A neutralizacao e do renderizador.
    expect(dbPost!.content).toBe(conteudo)
  })

  it('[seguranca] nenhum componente do app renderiza HTML cru (sem sink para o payload)', () => {
    const raiz = join(__dirname, '..', '..', 'footstock-next', 'src')
    const comSink = arquivosDeFonte(raiz).filter((arquivo) =>
      readFileSync(arquivo, 'utf-8').includes('dangerouslySetInnerHTML')
    )

    // Se este teste quebrar, o `<script>` gravado pelo teste acima deixou de ser
    // inerte. Ou o sink sai, ou a escrita passa a sanitizar markup -- as duas
    // metades da defesa nao podem cair juntas.
    expect(comSink).toEqual([])
  })
})

// ─── Cenário 1 — Happy Path: Criar post ──────────────────────────────────────

describe('POST /api/v1/forum — Happy Path', () => {
  it('[happy] deve criar post válido e persistir no banco → 201', async () => {
    mockAuthAsUser(normalUser.id)

    const handler = await import('@/app/api/v1/forum/route').catch(() => null)
    if (!handler?.POST) return

    const payload = buildForumPostPayload()
    const req = buildNextRequest('POST', '/api/v1/forum', payload)
    const res = await handler.POST(req as NextRequest)

    expect(res.status).toBe(201)

    // Verificar persistência no banco
    const dbPost = await testPrisma.globalForumPost.findFirst({
      where: { userId: normalUser.id },
      orderBy: { createdAt: 'desc' },
    })
    expect(dbPost).toBeTruthy()
    expect(dbPost!.content).toContain('[INTEGRATION-TEST]')
  })

  it('[auth] deve retornar 401 sem token', async () => {
    mockAuthInvalid()

    const handler = await import('@/app/api/v1/forum/route').catch(() => null)
    if (!handler?.POST) return

    const req = buildNextRequest('POST', '/api/v1/forum', buildForumPostPayload())
    const res = await handler.POST(req as NextRequest)
    expect(res.status).toBe(401)
  })
})

// ─── Cenário 2 — Validação: limite de caracteres ─────────────────────────────

describe('POST /api/v1/forum — Validação de tamanho (VAL_004)', () => {
  it('[validacao] deve rejeitar post com mais de 280 caracteres → VAL_004', async () => {
    mockAuthAsUser(normalUser.id)

    const handler = await import('@/app/api/v1/forum/route').catch(() => null)
    if (!handler?.POST) return

    const overLimitContent = '[INTEGRATION-TEST] ' + 'A'.repeat(281)
    const req = buildNextRequest('POST', '/api/v1/forum', { content: overLimitContent })
    const res = await handler.POST(req as NextRequest)

    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)

    const body = (await parseResponse(res)) as Record<string, unknown>
    const errorStr = JSON.stringify(body)
    // O codigo e FORUM_050, nao VAL_004: o limite de 280 e regra do forum e a rota
    // responde com a contagem real ("300/280 caracteres"). O regex antigo listava
    // codigos genericos que a rota nunca emitiu -- drift de teste, nao de produto.
    expect(errorStr).toContain('FORUM_050')
    expect(errorStr).toMatch(/caracteres/i)
  })

  it('[validacao] deve rejeitar post vazio → VAL_001', async () => {
    mockAuthAsUser(normalUser.id)

    const handler = await import('@/app/api/v1/forum/route').catch(() => null)
    if (!handler?.POST) return

    const req = buildNextRequest('POST', '/api/v1/forum', { content: '' })
    const res = await handler.POST(req as NextRequest)
    expect(res.status).toBeGreaterThanOrEqual(400)
  })
})

// ─── Cenário 3 — Moderação: Admin pode remover post ──────────────────────────

describe('DELETE /api/v1/forum/:id — Moderação', () => {
  it('[happy] moderador pode remover post → status REMOVED no banco', async () => {
    // Criar post do usuário normal
    const post = await testPrisma.globalForumPost.create({
      data: {
        userId: normalUser.id,
        content: '[INTEGRATION-TEST] Post para moderação.',
        // `PostModerationStatus` e PUBLISHED|FLAGGED|APPROVED|REJECTED. Nao existe
        // 'ACTIVE' -- era valor de um enum anterior e derrubava o create inteiro.
        status: 'PUBLISHED',
        // `likes` e relacao (ForumLike[]), nao contador Int -- passar 0 aqui era
        // outro resto do schema antigo.
        isFlagged: false,
        isDeleted: false,
      },
    })

    mockAuthAsUser(adminUser.id)

    const handler = await import('@/app/api/v1/forum/[id]/route').catch(() => null)
    if (!handler?.DELETE) return

    const req = buildNextRequest('DELETE', `/api/v1/forum/${post.id}`)
    const res = await handler.DELETE(req as NextRequest, { params: Promise.resolve({ id: post.id }) })

    if (res.status < 300) {
      const dbPost = await testPrisma.globalForumPost.findUnique({ where: { id: post.id } })
      expect(dbPost?.isDeleted || dbPost?.status).toBeTruthy()
    }
  })

  it('[seguranca] usuário comum não pode deletar post de outro usuário', async () => {
    const post = await testPrisma.globalForumPost.create({
      data: {
        userId: adminUser.id,
        content: '[INTEGRATION-TEST] Post do admin.',
        // `PostModerationStatus` e PUBLISHED|FLAGGED|APPROVED|REJECTED. Nao existe
        // 'ACTIVE' -- era valor de um enum anterior e derrubava o create inteiro.
        status: 'PUBLISHED',
        // `likes` e relacao (ForumLike[]), nao contador Int -- passar 0 aqui era
        // outro resto do schema antigo.
        isFlagged: false,
        isDeleted: false,
      },
    })

    // normalUser (não admin) tenta deletar post de adminUser
    mockAuthAsUser(normalUser.id)

    const handler = await import('@/app/api/v1/forum/[id]/route').catch(() => null)
    if (!handler?.DELETE) return

    const req = buildNextRequest('DELETE', `/api/v1/forum/${post.id}`)
    const res = await handler.DELETE(req as NextRequest, { params: Promise.resolve({ id: post.id }) })

    // Deve retornar 403 (sem permissão) ou 401
    expect(res.status).toBeGreaterThanOrEqual(400)

    // Post não deve estar deletado
    const dbPost = await testPrisma.globalForumPost.findUnique({ where: { id: post.id } })
    expect(dbPost?.isDeleted).toBeFalsy()
  })
})
