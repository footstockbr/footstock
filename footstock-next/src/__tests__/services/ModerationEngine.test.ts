// ============================================================================
// Foot Stock — ModerationEngine.test.ts (T-028)
// Testes unitários: sanitização PII + engine de regras de conteúdo
// ============================================================================

import { sanitizePost, ModerationEngine } from '@/lib/services/ModerationEngine'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock Redis — sem I/O real nos testes unitários
jest.mock('@/lib/redis', () => ({
  redisPublisher: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    setex: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
  },
}))

// Mock Prisma — regras retornadas do banco
const mockFindMany = jest.fn()
jest.mock('@/lib/prisma', () => ({
  prisma: {
    contentModerationRule: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const OLD_ACCOUNT = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 dias
const NEW_ACCOUNT = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) // 2 dias

function makeEngine(enabledRules: string[] = []): ModerationEngine {
  const allRules = [
    {
      id: 'rule-1',
      name: 'new_user_with_links',
      description: 'Novo usuário com links',
      pattern: '\\[LINK REMOVIDO\\]',
      isEnabled: enabledRules.includes('new_user_with_links'),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'rule-2',
      name: 'spam_frequency',
      description: 'Spam frequente',
      pattern: '^$',
      isEnabled: enabledRules.includes('spam_frequency'),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'rule-3',
      name: 'false_promises',
      description: 'Promessas falsas',
      pattern:
        '(?:ganho|lucro|retorno|rendimento)\\s+(?:garantido|certo|assegurado)|(?:100%|200%|300%|500%)\\s+(?:de\\s+)?(?:lucro|ganho|retorno)',
      isEnabled: enabledRules.includes('false_promises'),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'rule-4',
      name: 'residual_pii',
      description: 'Dados pessoais residuais',
      pattern:
        '(?:meu\\s+cpf|meu\\s+cnpj|meu\\s+telefone|meu\\s+celular|meu\\s+e-?mail)\\s*[:\\-]?\\s*\\d',
      isEnabled: enabledRules.includes('residual_pii'),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'rule-5',
      name: 'foreign_spam',
      description: 'Spam estrangeiro',
      pattern:
        '\\b(?:click here|buy now|sign up|free money|make money|earn cash|crypto investment|double your|guaranteed profit|limited offer|act now)\\b',
      isEnabled: enabledRules.includes('foreign_spam'),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]

  mockFindMany.mockResolvedValue(allRules)
  return new ModerationEngine()
}

// ---------------------------------------------------------------------------
// 1. Testes de Sanitização (sempre ativa)
// ---------------------------------------------------------------------------

describe('sanitizePost — sempre ativa', () => {
  describe('CPF', () => {
    it('substitui CPF formatado por [REDACTED]', () => {
      const { sanitized } = sanitizePost('Meu CPF é 123.456.789-09 ok')
      expect(sanitized).toContain('[REDACTED]')
      expect(sanitized).not.toContain('123.456.789-09')
    })

    it('substitui CPF sem pontuação por [REDACTED]', () => {
      const { sanitized } = sanitizePost('cpf: 12345678909')
      expect(sanitized).toContain('[REDACTED]')
      expect(sanitized).not.toContain('12345678909')
    })

    it('marca wasSanitized como true', () => {
      const { wasSanitized } = sanitizePost('CPF: 123.456.789-09')
      expect(wasSanitized).toBe(true)
    })
  })

  describe('CNPJ', () => {
    it('substitui CNPJ formatado por [REDACTED]', () => {
      const { sanitized } = sanitizePost('empresa 12.345.678/0001-90')
      expect(sanitized).toContain('[REDACTED]')
      expect(sanitized).not.toContain('12.345.678/0001-90')
    })
  })

  describe('Telefone', () => {
    it('substitui telefone por [REDACTED]', () => {
      const { sanitized } = sanitizePost('me liga no (11) 99999-8888')
      expect(sanitized).toContain('[REDACTED]')
    })
  })

  describe('E-mail', () => {
    it('substitui e-mail por [REDACTED]', () => {
      const { sanitized } = sanitizePost('me manda email: joao@email.com')
      expect(sanitized).toContain('[REDACTED]')
      expect(sanitized).not.toContain('joao@email.com')
    })
  })

  describe('URLs', () => {
    it('substitui URL https por [LINK REMOVIDO]', () => {
      const { sanitized } = sanitizePost('acesse https://site.com/path agora')
      expect(sanitized).toContain('[LINK REMOVIDO]')
      expect(sanitized).not.toContain('https://site.com/path')
    })

    it('substitui URL http por [LINK REMOVIDO]', () => {
      const { sanitized } = sanitizePost('veja http://example.com')
      expect(sanitized).toContain('[LINK REMOVIDO]')
    })

    it('substitui URL www. por [LINK REMOVIDO]', () => {
      const { sanitized } = sanitizePost('acesse www.site.com.br')
      expect(sanitized).toContain('[LINK REMOVIDO]')
      expect(sanitized).not.toContain('www.site.com.br')
    })
  })

  describe('Conteúdo sem PII', () => {
    it('não altera conteúdo sem dados sensíveis', () => {
      const content = 'Achei o VALE3 interessante hoje.'
      const { sanitized, wasSanitized } = sanitizePost(content)
      expect(sanitized).toBe(content)
      expect(wasSanitized).toBe(false)
    })

    it('preserva contentRaw como original', () => {
      const content = 'CPF: 123.456.789-09'
      const { contentRaw } = sanitizePost(content)
      expect(contentRaw).toBe(content)
    })
  })

  describe('Sanitização independente das regras', () => {
    it('sanitiza mesmo com todas as 5 regras desabilitadas', async () => {
      const engine = makeEngine([]) // nenhuma regra habilitada
      const result = await engine.process('CPF: 123.456.789-09', 'user-1', OLD_ACCOUNT)
      expect(result.sanitized).toContain('[REDACTED]')
      expect(result.isFlagged).toBe(false) // não flagrado pelas regras
    })
  })
})

// ---------------------------------------------------------------------------
// 2. Testes do Engine de Regras
// ---------------------------------------------------------------------------

describe('ModerationEngine — applyRules', () => {
  beforeEach(() => {
    mockFindMany.mockClear()
  })

  describe('Regra: new_user_with_links', () => {
    it('flaga novo usuário (<7 dias) que posta link', async () => {
      const engine = makeEngine(['new_user_with_links'])
      const result = await engine.process(
        'confira https://link.com', // URL → sanitizada para [LINK REMOVIDO]
        'user-new',
        NEW_ACCOUNT
      )
      expect(result.isFlagged).toBe(true)
      expect(result.flaggedBy).toContain('new_user_with_links')
    })

    it('não flaga usuário antigo (>=7 dias) com link', async () => {
      const engine = makeEngine(['new_user_with_links'])
      const result = await engine.process('confira https://link.com', 'user-old', OLD_ACCOUNT)
      expect(result.isFlagged).toBe(false)
    })

    it('não flaga novo usuário sem link', async () => {
      const engine = makeEngine(['new_user_with_links'])
      const result = await engine.process('post normal sem links', 'user-new', NEW_ACCOUNT)
      expect(result.isFlagged).toBe(false)
    })
  })

  describe('Regra: false_promises', () => {
    it('flaga "lucro garantido"', async () => {
      const engine = makeEngine(['false_promises'])
      const result = await engine.process('lucro garantido neste ativo!', 'user-1', OLD_ACCOUNT)
      expect(result.isFlagged).toBe(true)
      expect(result.flaggedBy).toContain('false_promises')
    })

    it('flaga "ganho garantido"', async () => {
      const engine = makeEngine(['false_promises'])
      const result = await engine.process('ganho garantido aqui', 'user-1', OLD_ACCOUNT)
      expect(result.isFlagged).toBe(true)
    })

    it('flaga "retorno 300%"', async () => {
      const engine = makeEngine(['false_promises'])
      const result = await engine.process('retorno de 300% de ganho', 'user-1', OLD_ACCOUNT)
      expect(result.isFlagged).toBe(true)
    })

    it('não flaga post normal sobre ações', async () => {
      const engine = makeEngine(['false_promises'])
      const result = await engine.process('PETR4 está interessante hoje', 'user-1', OLD_ACCOUNT)
      expect(result.isFlagged).toBe(false)
    })
  })

  describe('Regra: foreign_spam', () => {
    it('flaga post com "click here"', async () => {
      const engine = makeEngine(['foreign_spam'])
      const result = await engine.process('click here to win!', 'user-1', OLD_ACCOUNT)
      expect(result.isFlagged).toBe(true)
      expect(result.flaggedBy).toContain('foreign_spam')
    })

    it('flaga post com "make money"', async () => {
      const engine = makeEngine(['foreign_spam'])
      const result = await engine.process('make money fast!', 'user-1', OLD_ACCOUNT)
      expect(result.isFlagged).toBe(true)
    })

    it('não flaga post em português', async () => {
      const engine = makeEngine(['foreign_spam'])
      const result = await engine.process('Achei interessante o movimento do IBOV', 'user-1', OLD_ACCOUNT)
      expect(result.isFlagged).toBe(false)
    })
  })

  describe('Regras desabilitadas', () => {
    it('não flaga quando regra está desabilitada', async () => {
      const engine = makeEngine([]) // nenhuma regra
      const result = await engine.process('click here make money', 'user-1', OLD_ACCOUNT)
      expect(result.isFlagged).toBe(false)
      expect(result.flaggedBy).toHaveLength(0)
    })
  })

  describe('Múltiplas regras', () => {
    it('retorna todas as regras que fizeram match em flaggedBy', async () => {
      const engine = makeEngine(['false_promises', 'foreign_spam'])
      const result = await engine.process(
        'click here — lucro garantido!',
        'user-1',
        OLD_ACCOUNT
      )
      expect(result.isFlagged).toBe(true)
      expect(result.flaggedBy).toContain('false_promises')
      expect(result.flaggedBy).toContain('foreign_spam')
    })
  })
})

// ---------------------------------------------------------------------------
// 3. Testes de Cache e Fallback
// ---------------------------------------------------------------------------

describe('ModerationEngine — cache e fallback', () => {
  const { redisPublisher: mockRedis } = jest.requireMock('@/lib/redis')

  beforeEach(() => {
    mockFindMany.mockClear()
    jest.resetModules() // limpar cache em memória entre testes
  })

  it('invalida cache Redis ao chamar invalidateCache()', async () => {
    const engine = makeEngine([])
    await engine.invalidateCache()
    expect(mockRedis.del).toHaveBeenCalledWith('content_moderation:rules')
  })

  it('funciona com Redis indisponível (fallback para DB)', async () => {
    mockRedis.get.mockRejectedValueOnce(new Error('Redis down'))
    mockFindMany.mockResolvedValue([])

    const engine = new ModerationEngine()
    const result = await engine.process('test', 'user-1', OLD_ACCOUNT)
    expect(result.isFlagged).toBe(false)
  })

  it('funciona com DB indisponível (retorna sem flagrar)', async () => {
    mockRedis.get.mockResolvedValueOnce(null)
    mockFindMany.mockRejectedValueOnce(new Error('DB down'))

    const engine = new ModerationEngine()
    const result = await engine.process('click here', 'user-1', OLD_ACCOUNT)
    // Sem regras carregadas, não pode flagrar
    expect(result.isFlagged).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 4. Testes de Acceptance Criteria (T-028)
// ---------------------------------------------------------------------------

describe('Acceptance Criteria (T-028)', () => {
  it('AC-1: Post com CPF salvo com [REDACTED]', () => {
    const { sanitized } = sanitizePost('Meu CPF é 123.456.789-09')
    expect(sanitized).toContain('[REDACTED]')
    expect(sanitized).not.toContain('123.456.789-09')
  })

  it('AC-2: Post com URL salvo com [LINK REMOVIDO]', () => {
    const { sanitized } = sanitizePost('acesse https://malicioso.com')
    expect(sanitized).toContain('[LINK REMOVIDO]')
  })

  it('AC-3: Sanitização ocorre mesmo com todas as 5 regras desabilitadas', async () => {
    const engine = makeEngine([])
    const { sanitized, isFlagged } = await engine.process(
      'CPF: 123.456.789-09',
      'user-1',
      OLD_ACCOUNT
    )
    expect(sanitized).toContain('[REDACTED]')
    expect(isFlagged).toBe(false) // não flagrado pelas regras (todas off)
  })

  it('AC-4: Regra new_user_with_links + novo usuário + link = FLAGGED', async () => {
    const engine = makeEngine(['new_user_with_links'])
    const { isFlagged, flaggedBy } = await engine.process(
      'veja https://link.com',
      'new-user',
      NEW_ACCOUNT
    )
    expect(isFlagged).toBe(true)
    expect(flaggedBy).toContain('new_user_with_links')
  })
})
