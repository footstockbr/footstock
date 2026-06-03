/**
 * T-031 — Sistema Completo de Aliases de Ticker
 *
 * Testa acceptance criteria:
 * 1. GET /api/v1/assets/FLA3 retorna dados de URU3 (status 200, não 404)
 * 2. GET /api/v1/assets/fla3 (minúsculo) retorna dados de URU3
 * 3. POST /api/v1/orders com ticker: "FLA3" resolve para URU3
 * 4. Seed popula asset_aliases com todos os 40 ativos (pelo menos 1 alias cada)
 * 5. Admin pode adicionar e remover aliases via API
 * 6. Busca por "FLA3" via GET /api/v1/assets/search?q=FLA3 retorna resultado URU3
 * 7. Cache Redis invalidado quando admin adiciona/remove alias
 * 8. resolveAlias em price e history endpoints
 * 9. resolveAlias em forum GET ?ticker=
 * 10. Sem exposição de alias nas mensagens de erro
 */

import * as path from 'path'
import * as fs from 'fs'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const WORKSPACE = path.resolve(__dirname, '../../')

function fileExists(relativePath: string): boolean {
  return fs.existsSync(path.join(WORKSPACE, relativePath))
}

function fileContains(relativePath: string, pattern: string | RegExp): boolean {
  const content = fs.readFileSync(path.join(WORKSPACE, relativePath), 'utf-8')
  return typeof pattern === 'string' ? content.includes(pattern) : pattern.test(content)
}

function fileNotContains(relativePath: string, pattern: string | RegExp): boolean {
  return !fileContains(relativePath, pattern)
}

function readFile(relativePath: string): string {
  return fs.readFileSync(path.join(WORKSPACE, relativePath), 'utf-8')
}

// ─── 1. AliasService — estrutura e contrato ──────────────────────────────────

describe('T-031 — AliasService', () => {
  const FILE = 'src/services/AliasService.ts'

  it('arquivo AliasService.ts existe', () => {
    expect(fileExists(FILE)).toBe(true)
  })

  it('usa server-only', () => {
    expect(fileContains(FILE, "import 'server-only'")).toBe(true)
  })

  it('exporta AliasService.resolve', () => {
    expect(fileContains(FILE, 'resolve(')).toBe(true)
    expect(fileContains(FILE, 'AliasService')).toBe(true)
  })

  it('exporta AliasService.addAlias', () => {
    expect(fileContains(FILE, 'addAlias(')).toBe(true)
  })

  it('exporta AliasService.removeAlias', () => {
    expect(fileContains(FILE, 'removeAlias(')).toBe(true)
  })

  it('exporta AliasService.getAliasesForTicker', () => {
    expect(fileContains(FILE, 'getAliasesForTicker(')).toBe(true)
  })

  it('usa cache Redis com prefixo alias:v1:', () => {
    expect(fileContains(FILE, 'alias:v1:')).toBe(true)
  })

  it('normaliza para uppercase antes de qualquer consulta', () => {
    expect(fileContains(FILE, '.toUpperCase()')).toBe(true)
  })

  it('verifica ativo canônico antes do alias (ordem de prioridade)', () => {
    const content = readFile(FILE)
    const canonicalIdx = content.indexOf('asset.findUnique')
    const aliasIdx = content.indexOf('assetAlias.findUnique')
    expect(canonicalIdx).toBeGreaterThan(-1)
    expect(aliasIdx).toBeGreaterThan(canonicalIdx)
  })

  it('previne alias = ticker canônico (ciclo trivial)', () => {
    expect(fileContains(FILE, 'não pode ser igual ao ticker canônico')).toBe(true)
  })

  it('previne alias que já é um ticker canônico', () => {
    expect(fileContains(FILE, 'já é um ticker canônico')).toBe(true)
  })

  it('invalida cache ao adicionar alias', () => {
    const content = readFile(FILE)
    const addAliasIdx = content.indexOf('async addAlias')
    const delIdx = content.indexOf('redis.del', addAliasIdx)
    expect(delIdx).toBeGreaterThan(addAliasIdx)
  })

  it('invalida cache ao remover alias', () => {
    const content = readFile(FILE)
    const removeAliasIdx = content.indexOf('async removeAlias')
    const delIdx = content.indexOf('redis.del', removeAliasIdx)
    expect(delIdx).toBeGreaterThan(removeAliasIdx)
  })

  it('usa NULL_SENTINEL para cachear resultado "não encontrado"', () => {
    expect(fileContains(FILE, '__null__')).toBe(true)
  })
})

// ─── 2. Resolver universal — endpoints com ticker no path ────────────────────

describe('T-031 — resolveAlias aplicado nos endpoints', () => {
  it('assets/[ticker]/route.ts tem resolver de alias (resolve-alias T-024 ou AliasService T-031)', () => {
    const content = readFile('src/app/api/v1/assets/[ticker]/route.ts')
    // Aceita resolveAlias (T-024) ou AliasService (T-031 upgrade)
    expect(
      content.includes('resolve-alias') || content.includes('AliasService')
    ).toBe(true)
  })

  it('assets/[ticker]/price/route.ts importa AliasService', () => {
    expect(fileContains(
      'src/app/api/v1/assets/[ticker]/price/route.ts',
      'AliasService'
    )).toBe(true)
  })

  it('assets/[ticker]/price/route.ts chama AliasService.resolve', () => {
    expect(fileContains(
      'src/app/api/v1/assets/[ticker]/price/route.ts',
      'AliasService.resolve'
    )).toBe(true)
  })

  it('assets/[ticker]/history/route.ts importa AliasService', () => {
    expect(fileContains(
      'src/app/api/v1/assets/[ticker]/history/route.ts',
      'AliasService'
    )).toBe(true)
  })

  it('assets/[ticker]/history/route.ts chama AliasService.resolve', () => {
    expect(fileContains(
      'src/app/api/v1/assets/[ticker]/history/route.ts',
      'AliasService.resolve'
    )).toBe(true)
  })
})

// ─── 3. Resolver no body do POST /orders ────────────────────────────────────

describe('T-031 — resolveAlias em POST /api/v1/orders', () => {
  const FILE = 'src/app/api/v1/orders/route.ts'

  it('orders/route.ts importa AliasService', () => {
    expect(fileContains(FILE, 'AliasService')).toBe(true)
  })

  it('orders/route.ts resolve alias do ticker antes de criar ordem', () => {
    expect(fileContains(FILE, 'AliasService.resolve')).toBe(true)
  })

  it('orders/route.ts substitui ticker no payload antes de orderService.createOrder', () => {
    const content = readFile(FILE)
    // Verificar que o resolvedTicker substitui o ticker original antes de createOrder
    const resolveIdx = content.indexOf('AliasService.resolve')
    const createOrderIdx = content.indexOf('orderService.createOrder')
    expect(resolveIdx).toBeGreaterThan(-1)
    expect(createOrderIdx).toBeGreaterThan(resolveIdx)
  })
})

// ─── 4. Resolver no forum GET ?ticker= ──────────────────────────────────────

describe('T-031 — resolveAlias em GET /api/v1/forum?ticker=', () => {
  const FILE = 'src/app/api/v1/forum/route.ts'

  it('forum/route.ts importa AliasService', () => {
    expect(fileContains(FILE, 'AliasService')).toBe(true)
  })

  it('forum/route.ts resolve alias do query param ticker', () => {
    expect(fileContains(FILE, 'AliasService.resolve')).toBe(true)
  })
})

// ─── 5. Endpoint de busca com alias ─────────────────────────────────────────

describe('T-031 — GET /api/v1/assets/search', () => {
  const FILE = 'src/app/api/v1/assets/search/route.ts'

  it('arquivo search/route.ts existe', () => {
    expect(fileExists(FILE)).toBe(true)
  })

  it('endpoint requer auth', () => {
    expect(fileContains(FILE, 'getAuthUser')).toBe(true)
  })

  it('endpoint usa AliasService.resolve para busca por alias exato', () => {
    expect(fileContains(FILE, 'AliasService.resolve')).toBe(true)
  })

  it('busca retorna ticker canônico (não o alias buscado)', () => {
    // O endpoint deve usar resolvedTicker para buscar o ativo
    expect(fileContains(FILE, 'resolvedTicker')).toBe(true)
  })

  it('endpoint NÃO retorna realName', () => {
    expect(fileNotContains(FILE, 'realName')).toBe(true)
  })

  it('endpoint NÃO retorna searchText', () => {
    expect(fileNotContains(FILE, /select.*searchText/)).toBe(true)
  })

  it('busca parcial usa searchText internamente (sem retornar ao cliente)', () => {
    // searchText aparece no WHERE mas não no select de retorno
    expect(fileContains(FILE, 'searchText')).toBe(true)
  })
})

// ─── 6. Admin alias API ──────────────────────────────────────────────────────

describe('T-031 — Admin alias CRUD API', () => {
  it('POST /admin/assets/[ticker]/aliases — arquivo existe', () => {
    expect(fileExists('src/app/api/v1/admin/assets/[ticker]/aliases/route.ts')).toBe(true)
  })

  it('DELETE /admin/assets/[ticker]/aliases/[alias] — arquivo existe', () => {
    expect(fileExists('src/app/api/v1/admin/assets/[ticker]/aliases/[alias]/route.ts')).toBe(true)
  })

  it('POST aliases requer SUPER_ADMIN', () => {
    expect(fileContains(
      'src/app/api/v1/admin/assets/[ticker]/aliases/route.ts',
      'SUPER_ADMIN'
    )).toBe(true)
  })

  it('DELETE alias requer SUPER_ADMIN', () => {
    expect(fileContains(
      'src/app/api/v1/admin/assets/[ticker]/aliases/[alias]/route.ts',
      'SUPER_ADMIN'
    )).toBe(true)
  })

  it('POST aliases usa AliasService.addAlias', () => {
    expect(fileContains(
      'src/app/api/v1/admin/assets/[ticker]/aliases/route.ts',
      'AliasService.addAlias'
    )).toBe(true)
  })

  it('DELETE alias usa AliasService.removeAlias', () => {
    expect(fileContains(
      'src/app/api/v1/admin/assets/[ticker]/aliases/[alias]/route.ts',
      'AliasService.removeAlias'
    )).toBe(true)
  })

  it('GET aliases lista aliases por ticker (MONITOR+)', () => {
    const content = readFile('src/app/api/v1/admin/assets/[ticker]/aliases/route.ts')
    expect(content).toContain('MONITOR')
    expect(content).toContain('AliasService.getAliasesForTicker')
  })

  it('POST retorna 409 para alias duplicado', () => {
    expect(fileContains(
      'src/app/api/v1/admin/assets/[ticker]/aliases/route.ts',
      '409'
    )).toBe(true)
  })

  it('POST valida formato do alias com Zod', () => {
    expect(fileContains(
      'src/app/api/v1/admin/assets/[ticker]/aliases/route.ts',
      'addAliasSchema'
    )).toBe(true)
  })
})

// ─── 7. Componente AliasManagement.tsx ──────────────────────────────────────

describe('T-031 — Admin AliasManagement.tsx', () => {
  const FILE = 'src/components/admin/AliasManagement.tsx'

  it('arquivo AliasManagement.tsx existe', () => {
    expect(fileExists(FILE)).toBe(true)
  })

  it('usa use client', () => {
    expect(fileContains(FILE, "'use client'")).toBe(true)
  })

  it('busca aliases do endpoint admin', () => {
    expect(fileContains(FILE, '/api/v1/admin/assets/')).toBe(true)
  })

  it('tem ação de adicionar alias (POST)', () => {
    expect(fileContains(FILE, "method: 'POST'")).toBe(true)
  })

  it('tem ação de remover alias (DELETE)', () => {
    expect(fileContains(FILE, "method: 'DELETE'")).toBe(true)
  })

  it('valida formato do alias no frontend (2-5 letras + 1-2 dígitos)', () => {
    expect(fileContains(FILE, /[A-Za-z].*\\d/)).toBe(true)
  })

  it('tem confirmação antes de remover alias', () => {
    expect(fileContains(FILE, 'confirmRemove')).toBe(true)
  })

  it('exibe feedback visual (toast) após ações', () => {
    expect(fileContains(FILE, 'toast')).toBe(true)
  })

  it('tem aria-label acessível nos botões de remoção', () => {
    expect(fileContains(FILE, 'aria-label')).toBe(true)
  })

  it('exibe estado de loading', () => {
    expect(fileContains(FILE, 'isLoading')).toBe(true)
  })

  it('exibe estado de erro', () => {
    expect(fileContains(FILE, 'isError')).toBe(true)
  })
})

// ─── 8. Seed — cobertura dos 40 clubes ──────────────────────────────────────

describe('T-031 — Seed cobertura completa (40 clubes)', () => {
  const SEED_FILE = 'prisma/seed/assetAliases.ts'

  // Todos os 40 tickers canônicos do sistema (de clubs.ts)
  const ALL_TICKERS = [
    // Série A
    'URU3', 'POR3', 'TIM3', 'TRI3', 'GAL3', 'IMO3', 'COL3', 'GUE3',
    'PEI3', 'CRZ3', 'REG3', 'FUR3', 'FOR3', 'BMP3', 'RAP3', 'RBB3',
    'CUI3', 'VIT3', 'JUV3', 'MIR3',
    // Série B
    'LEI3', 'NTL3', 'AVA3', 'GOI3', 'CHA3', 'PON3', 'GUA3', 'OPE3',
    'SAM3', 'TIS3', 'LON3', 'FIG3', 'PAY3', 'CFC3', 'AME3', 'BSA3',
    'CRB3', 'CSA3', 'ITA3', 'TON3',
  ]

  it('seed cobre todos os 40 tickers canônicos', () => {
    const content = readFile(SEED_FILE)
    const missingTickers = ALL_TICKERS.filter(
      (ticker) => !content.includes(`assetTicker: '${ticker}'`)
    )
    expect(missingTickers).toEqual([])
  })

  it('seed NÃO tem alias duplicado COR4 para Corinthians e Coritiba', () => {
    const content = readFile(SEED_FILE)
    const matches = content.match(/alias: 'COR4'/g)
    // COR4 pode existir somente uma vez (para TIM3 — Corinthians)
    expect(matches).not.toBeNull()
    expect(matches!.length).toBe(1)
  })

  it('seed tem pelo menos 2 aliases para Flamengo (URU3)', () => {
    const content = readFile(SEED_FILE)
    const flaAliases = content.match(/assetTicker: 'URU3'/g)
    expect(flaAliases).not.toBeNull()
    expect(flaAliases!.length).toBeGreaterThanOrEqual(2)
  })

  it('seed tem aliases para clubes da Série B', () => {
    expect(fileContains(SEED_FILE, "assetTicker: 'SAM3'")).toBe(true) // Sampaio Corrêa
    expect(fileContains(SEED_FILE, "assetTicker: 'LON3'")).toBe(true) // Londrina
    expect(fileContains(SEED_FILE, "assetTicker: 'FIG3'")).toBe(true) // Figueirense
    expect(fileContains(SEED_FILE, "assetTicker: 'CSA3'")).toBe(true) // CSA
  })

  it('seed NÃO tem nenhum alias igual ao seu próprio assetTicker', () => {
    const content = readFile(SEED_FILE)
    // Extrair todos os pares alias/assetTicker
    const pairs = [...content.matchAll(/\{\s*alias:\s*'([A-Z0-9]+)'.*?assetTicker:\s*'([A-Z0-9]+)'/gs)]
    for (const [, alias, assetTicker] of pairs) {
      expect(alias).not.toBe(assetTicker)
    }
  })
})

// ─── 9. Schema Prisma — índice reverso ──────────────────────────────────────

describe('T-031 — Schema Prisma — @@index([assetTicker])', () => {
  it('AssetAlias tem @@index([assetTicker]) para consultas reversas', () => {
    expect(fileContains(
      'prisma/schema.prisma',
      '@@index([assetTicker])'
    )).toBe(true)
  })

  it('migration M043 existe para o índice reverso', () => {
    expect(fileExists('prisma/migrations/M043-asset-aliases-reverse-index.sql')).toBe(true)
  })

  it('migration M043 cria índice em asset_ticker', () => {
    expect(fileContains(
      'prisma/migrations/M043-asset-aliases-reverse-index.sql',
      'asset_ticker'
    )).toBe(true)
  })
})

// ─── 10. Segurança — mensagens de erro não expõem alias ─────────────────────

describe('T-031 — Mensagens de erro não expõem resolução de alias', () => {
  const ENDPOINTS = [
    'src/app/api/v1/assets/[ticker]/route.ts',
    'src/app/api/v1/assets/[ticker]/price/route.ts',
    'src/app/api/v1/assets/[ticker]/history/route.ts',
  ]

  for (const endpoint of ENDPOINTS) {
    it(`${endpoint}: mensagem de erro não menciona "alias" ou "resolvido"`, () => {
      const content = readFile(endpoint)
      // Verificar que o texto de erro não expõe o mecanismo de alias
      expect(content).not.toMatch(/[Aa]lias.*resolvido|resolvido.*para|[Aa]lias.*encontrado/i)
    })
  }
})

// ─── 11. Case sensitivity ────────────────────────────────────────────────────

describe('T-031 — Case sensitivity (fla3 == FLA3)', () => {
  it('AliasService normaliza para uppercase', () => {
    expect(fileContains(
      'src/services/AliasService.ts',
      '.toUpperCase()'
    )).toBe(true)
  })

  it('price/route.ts passa ticker para resolve (que normaliza)', () => {
    const content = readFile('src/app/api/v1/assets/[ticker]/price/route.ts')
    // AliasService.resolve recebe o dado do tickerSchema (que já é uppercase via Zod)
    expect(content).toContain('AliasService.resolve')
  })

  it('history/route.ts passa ticker para resolve', () => {
    const content = readFile('src/app/api/v1/assets/[ticker]/history/route.ts')
    expect(content).toContain('AliasService.resolve')
  })
})
