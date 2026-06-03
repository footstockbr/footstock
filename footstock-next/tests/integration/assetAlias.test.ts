/**
 * T-024 — Asset Alias Resolver & realName Leak Prevention
 *
 * Testa:
 * 1. resolveAlias() — lógica de resolução (alias→canônico, canônico→canônico, inexistente→null)
 * 2. Ausência de realName em todos os endpoints públicos de assets
 * 3. Presença de realName no endpoint /api/v1/assets/clubs-for-selection
 * 4. Presença de realName e aliases no endpoint SUPER_ADMIN
 * 5. Normalização case-insensitive do alias
 * 6. Prisma model AssetAlias — schema e campo único
 */

import * as path from 'path'
import * as fs from 'fs'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const WORKSPACE = path.resolve(__dirname, '../../')
const SRC = path.join(WORKSPACE, 'src')

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

// ─── 1. Schema Prisma ────────────────────────────────────────────────────────

describe('T-024 — Schema Prisma', () => {
  const SCHEMA = 'prisma/schema.prisma'

  it('campo displayName existe em Asset com @map("name")', () => {
    expect(fileContains(SCHEMA, '@map("name")')).toBe(true)
    expect(fileContains(SCHEMA, 'displayName')).toBe(true)
  })

  it('campo realName existe em Asset com @map("real_name")', () => {
    expect(fileContains(SCHEMA, 'realName')).toBe(true)
    expect(fileContains(SCHEMA, '@map("real_name")')).toBe(true)
  })

  it('model AssetAlias existe no schema', () => {
    expect(fileContains(SCHEMA, 'model AssetAlias')).toBe(true)
  })

  it('AssetAlias tem constraint unique em alias', () => {
    expect(fileContains(SCHEMA, /alias\s+String\s+@unique/)).toBe(true)
  })

  it('AssetAlias tem relação FK com Asset', () => {
    expect(fileContains(SCHEMA, 'asset Asset @relation')).toBe(true)
  })

  it('Asset tem relação com aliases', () => {
    expect(fileContains(SCHEMA, 'aliases      AssetAlias[]')).toBe(true)
  })
})

// ─── 2. Migration SQL ────────────────────────────────────────────────────────

describe('T-024 — Migration SQL', () => {
  const MIGRATION = 'prisma/migrations/M042-asset-real-name-aliases.sql'

  it('arquivo de migration existe', () => {
    expect(fileExists(MIGRATION)).toBe(true)
  })

  it('migration adiciona coluna real_name', () => {
    expect(fileContains(MIGRATION, 'ADD COLUMN')).toBe(true)
    expect(fileContains(MIGRATION, 'real_name')).toBe(true)
  })

  it('migration cria tabela asset_aliases', () => {
    expect(fileContains(MIGRATION, 'CREATE TABLE')).toBe(true)
    expect(fileContains(MIGRATION, 'asset_aliases')).toBe(true)
  })

  it('migration cria índice em alias + is_active', () => {
    expect(fileContains(MIGRATION, 'CREATE INDEX')).toBe(true)
  })
})

// ─── 3. Seed ─────────────────────────────────────────────────────────────────

describe('T-024 — Seeds', () => {
  it('seed de assetAliases existe', () => {
    expect(fileExists('prisma/seed/assetAliases.ts')).toBe(true)
  })

  it('seed de assetAliases cobre FLA3→URU3 (caso exemplo)', () => {
    expect(fileContains('prisma/seed/assetAliases.ts', "alias: 'FLA3'")).toBe(true)
    expect(fileContains('prisma/seed/assetAliases.ts', "assetTicker: 'URU3'")).toBe(true)
  })

  it('seed de assetAliases cobre BOT3→REG3 (Botafogo)', () => {
    expect(fileContains('prisma/seed/assetAliases.ts', "alias: 'BOT3'")).toBe(true)
    expect(fileContains('prisma/seed/assetAliases.ts', "assetTicker: 'REG3'")).toBe(true)
  })

  it('seed assets.ts usa displayName (não name) para o campo fictício', () => {
    expect(fileContains('prisma/seed/assets.ts', 'displayName: club.displayName')).toBe(true)
  })

  it('seed assets.ts usa realName', () => {
    expect(fileContains('prisma/seed/assets.ts', 'realName: club.realName')).toBe(true)
  })

  it('seed index.ts importa seedAssetAliases', () => {
    expect(fileContains('prisma/seed/index.ts', 'seedAssetAliases')).toBe(true)
  })
})

// ─── 4. resolveAlias helper ──────────────────────────────────────────────────

describe('T-024 — resolveAlias helper', () => {
  const FILE = 'src/lib/utils/resolve-alias.ts'

  it('arquivo resolve-alias.ts existe', () => {
    expect(fileExists(FILE)).toBe(true)
  })

  it('usa server-only', () => {
    expect(fileContains(FILE, "import 'server-only'")).toBe(true)
  })

  it('função resolveAlias é exportada', () => {
    expect(fileContains(FILE, 'export async function resolveAlias')).toBe(true)
  })

  it('retorna null (não throw) para ticker não encontrado', () => {
    expect(fileContains(FILE, 'return null')).toBe(true)
    expect(fileNotContains(FILE, 'throw new Error')).toBe(true)
  })

  it('normaliza ticker para maiúsculas', () => {
    expect(fileContains(FILE, '.toUpperCase()')).toBe(true)
  })

  it('verifica asset canônico antes do alias', () => {
    const content = fs.readFileSync(path.join(WORKSPACE, FILE), 'utf-8')
    const canonicalIdx = content.indexOf('asset.findUnique')
    const aliasIdx = content.indexOf('assetAlias.findUnique')
    expect(canonicalIdx).toBeGreaterThan(-1)
    expect(aliasIdx).toBeGreaterThan(canonicalIdx)
  })
})

// ─── 5. Ausência de realName em endpoints públicos ───────────────────────────

describe('T-024 — Leakage de realName em endpoints públicos', () => {
  const PUBLIC_ENDPOINTS = [
    'src/app/api/v1/market/assets/route.ts',
    'src/app/api/v1/market/[ticker]/route.ts',
  ]

  const AUTH_ENDPOINTS = [
    'src/app/api/v1/assets/route.ts',
    'src/app/api/v1/assets/[ticker]/route.ts',
    'src/app/api/v1/portfolio/route.ts',
    'src/app/api/v1/positions/short/[id]/route.ts',
  ]

  for (const endpoint of [...PUBLIC_ENDPOINTS, ...AUTH_ENDPOINTS]) {
    it(`${endpoint} NÃO retorna realName`, () => {
      expect(fileNotContains(endpoint, 'realName')).toBe(true)
    })
  }

  it('endpoint clubs-for-selection RETORNA realName (único endpoint público autorizado)', () => {
    expect(fileContains(
      'src/app/api/v1/assets/clubs-for-selection/route.ts',
      'realName'
    )).toBe(true)
  })

  it('endpoint admin/assets/[ticker] RETORNA realName (SUPER_ADMIN only)', () => {
    expect(fileContains(
      'src/app/api/v1/admin/assets/[ticker]/route.ts',
      'realName'
    )).toBe(true)
  })
})

// ─── 6. resolveAlias aplicado em endpoints [ticker] ──────────────────────────

describe('T-024 — resolveAlias aplicado nos endpoints', () => {
  it('assets/[ticker]/route.ts importa resolveAlias', () => {
    expect(fileContains(
      'src/app/api/v1/assets/[ticker]/route.ts',
      'resolve-alias'
    )).toBe(true)
  })

  it('market/[ticker]/route.ts importa resolveAlias', () => {
    expect(fileContains(
      'src/app/api/v1/market/[ticker]/route.ts',
      'resolve-alias'
    )).toBe(true)
  })
})

// ─── 7. Consistência displayName nos endpoints ───────────────────────────────

describe('T-024 — Consistência displayName (não name) nos endpoints', () => {
  const ENDPOINTS_MUST_USE_DISPLAY_NAME = [
    'src/app/api/v1/assets/route.ts',
    'src/app/api/v1/assets/[ticker]/route.ts',
    'src/app/api/v1/market/assets/route.ts',
    'src/app/api/v1/market/[ticker]/route.ts',
    'src/app/api/v1/admin/assets/route.ts',
    'src/app/api/v1/admin/assets/[ticker]/halt/route.ts',
  ]

  for (const endpoint of ENDPOINTS_MUST_USE_DISPLAY_NAME) {
    it(`${endpoint} usa displayName (não name legacy)`, () => {
      expect(fileContains(endpoint, 'displayName')).toBe(true)
    })
  }
})

// ─── 8. Step3ClubSelect — realName na UI ─────────────────────────────────────

describe('T-024 — Step3ClubSelect', () => {
  const FILE = 'src/components/auth/register/Step3ClubSelect.tsx'

  it('componente busca do endpoint clubs-for-selection', () => {
    expect(fileContains(FILE, '/api/v1/assets/clubs-for-selection')).toBe(true)
  })

  it('componente exibe realName (não displayName) na listagem', () => {
    expect(fileContains(FILE, 'club.realName')).toBe(true)
  })

  it('componente NÃO usa mais CLUBS hardcoded para filtrar', () => {
    // CLUBS ainda pode ser importado por outros motivos mas não deve ser usado para filtrar
    // Verificamos que filteredClubs usa clubs (do estado) e não CLUBS (constante)
    const content = fs.readFileSync(path.join(WORKSPACE, FILE), 'utf-8')
    // O filter deve ser sobre 'clubs' (state) e incluir realName
    expect(content).toMatch(/clubs\.filter.*realName/s)
  })
})

// ─── 9. Admin ClubEditor — exibe realName ────────────────────────────────────

describe('T-024 — Admin ClubEditor', () => {
  const FILE = 'src/components/admin/ClubEditor.tsx'

  it('interface AssetItem tem campo realName', () => {
    expect(fileContains(FILE, 'realName: string | null')).toBe(true)
  })

  it('tabela exibe realName no admin', () => {
    expect(fileContains(FILE, 'asset.realName')).toBe(true)
  })
})

// ─── 10. CLUBS constant tem realName ─────────────────────────────────────────

describe('T-024 — CLUBS constant', () => {
  const FILE = 'src/lib/constants/clubs.ts'

  it('ClubOption interface tem campo realName', () => {
    expect(fileContains(FILE, 'realName: string')).toBe(true)
  })

  it('CLUBS array popula realName para todos os clubes', () => {
    // Pos-refactor: CLUBS deriva realName do mapa REAL_NAMES (Record<ticker, name>).
    // Contar entradas do mapa em vez de literais `realName:` no arquivo.
    const content = fs.readFileSync(path.join(WORKSPACE, FILE), 'utf-8')
    const realNameEntries = content.match(/^\s+[A-Z]{3}[34]:\s+'/gm)
    expect(realNameEntries).not.toBeNull()
    expect(realNameEntries!.length).toBeGreaterThanOrEqual(40)
  })
})

// ─── 11. Endpoint clubs-for-selection — segurança ────────────────────────────

describe('T-024 — clubs-for-selection endpoint', () => {
  const FILE = 'src/app/api/v1/assets/clubs-for-selection/route.ts'

  it('arquivo existe', () => {
    expect(fileExists(FILE)).toBe(true)
  })

  it('aplica rate limiting', () => {
    expect(fileContains(FILE, 'RateLimit')).toBe(true)
  })

  it('retorna realName e displayName', () => {
    expect(fileContains(FILE, 'realName')).toBe(true)
    expect(fileContains(FILE, 'displayName')).toBe(true)
  })

  it('NÃO retorna searchText', () => {
    expect(fileNotContains(FILE, 'searchText')).toBe(true)
  })
})

// ─── T-031: Resolver universal em todos os endpoints ─────────────────────────

describe('T-031 — AliasService', () => {
  const FILE = 'src/services/AliasService.ts'

  it('AliasService.ts existe em src/services/', () => {
    expect(fileExists(FILE)).toBe(true)
  })

  it('usa server-only', () => {
    expect(fileContains(FILE, "import 'server-only'")).toBe(true)
  })

  it('método resolve() exportado', () => {
    expect(fileContains(FILE, 'async resolve(')).toBe(true)
  })

  it('método addAlias() exportado', () => {
    expect(fileContains(FILE, 'async addAlias(')).toBe(true)
  })

  it('método removeAlias() exportado', () => {
    expect(fileContains(FILE, 'async removeAlias(')).toBe(true)
  })

  it('método getAliasesForTicker() exportado', () => {
    expect(fileContains(FILE, 'async getAliasesForTicker(')).toBe(true)
  })

  it('usa cache Redis com TTL', () => {
    expect(fileContains(FILE, 'setex')).toBe(true)
    expect(fileContains(FILE, 'CACHE_TTL')).toBe(true)
  })

  it('invalida cache ao adicionar alias', () => {
    const content = fs.readFileSync(path.join(WORKSPACE, FILE), 'utf-8')
    const addIdx = content.indexOf('async addAlias(')
    const delIdx = content.indexOf('redis.del(', addIdx)
    expect(delIdx).toBeGreaterThan(addIdx)
  })

  it('invalida cache ao remover alias', () => {
    const content = fs.readFileSync(path.join(WORKSPACE, FILE), 'utf-8')
    const removeIdx = content.indexOf('async removeAlias(')
    const delIdx = content.indexOf('redis.del(', removeIdx)
    expect(delIdx).toBeGreaterThan(removeIdx)
  })

  it('previne alias circular (alias === ticker)', () => {
    expect(fileContains(FILE, 'normalizedAlias === normalizedTicker')).toBe(true)
  })

  it('previne alias que é ticker canônico', () => {
    expect(fileContains(FILE, 'já é um ticker canônico')).toBe(true)
  })

  it('normaliza para maiúsculas', () => {
    expect(fileContains(FILE, '.toUpperCase()')).toBe(true)
  })

  it('schema addAliasSchema exportado (validação Zod)', () => {
    expect(fileContains(FILE, 'export const addAliasSchema')).toBe(true)
  })
})

describe('T-031 — resolveAlias aplicado em price e history', () => {
  it('assets/[ticker]/price/route.ts aplica resolução de alias', () => {
    expect(fileContains(
      'src/app/api/v1/assets/[ticker]/price/route.ts',
      'AliasService'
    )).toBe(true)
  })

  it('assets/[ticker]/history/route.ts aplica resolução de alias', () => {
    expect(fileContains(
      'src/app/api/v1/assets/[ticker]/history/route.ts',
      'AliasService'
    )).toBe(true)
  })
})

describe('T-031 — resolveAlias em OrderService', () => {
  const FILE = 'src/lib/services/OrderService.ts'

  it('OrderService importa AliasService', () => {
    expect(fileContains(FILE, 'AliasService')).toBe(true)
  })

  it('OrderService resolve alias antes de buscar ativo', () => {
    const content = fs.readFileSync(path.join(WORKSPACE, FILE), 'utf-8')
    const resolveIdx = content.indexOf('AliasService.resolve(')
    const findIdx = content.indexOf('asset.findUnique(')
    expect(resolveIdx).toBeGreaterThan(-1)
    expect(findIdx).toBeGreaterThan(resolveIdx)
  })
})

describe('T-031 — resolveAlias no Forum', () => {
  const FILE = 'src/app/api/v1/forum/route.ts'

  it('forum route importa AliasService', () => {
    expect(fileContains(FILE, 'AliasService')).toBe(true)
  })

  it('forum GET resolve alias do query param ticker', () => {
    expect(fileContains(FILE, 'AliasService.resolve')).toBe(true)
  })
})

describe('T-031 — Admin endpoint de aliases', () => {
  it('GET /api/v1/admin/assets/[ticker]/aliases existe', () => {
    expect(fileExists('src/app/api/v1/admin/assets/[ticker]/aliases/route.ts')).toBe(true)
  })

  it('endpoint GET lista aliases', () => {
    expect(fileContains(
      'src/app/api/v1/admin/assets/[ticker]/aliases/route.ts',
      'export async function GET'
    )).toBe(true)
  })

  it('endpoint POST adiciona alias', () => {
    expect(fileContains(
      'src/app/api/v1/admin/assets/[ticker]/aliases/route.ts',
      'export async function POST'
    )).toBe(true)
  })

  it('DELETE /api/v1/admin/assets/[ticker]/aliases/[alias] existe', () => {
    expect(fileExists('src/app/api/v1/admin/assets/[ticker]/aliases/[alias]/route.ts')).toBe(true)
  })

  it('endpoint DELETE remove alias', () => {
    expect(fileContains(
      'src/app/api/v1/admin/assets/[ticker]/aliases/[alias]/route.ts',
      'export async function DELETE'
    )).toBe(true)
  })

  it('admin endpoint requer SUPER_ADMIN', () => {
    expect(fileContains(
      'src/app/api/v1/admin/assets/[ticker]/aliases/route.ts',
      'SUPER_ADMIN'
    )).toBe(true)
  })
})

describe('T-031 — AliasManagement componente admin', () => {
  const FILE = 'src/components/admin/AliasManagement.tsx'

  it('componente AliasManagement existe', () => {
    expect(fileExists(FILE)).toBe(true)
  })

  it('é client component', () => {
    expect(fileContains(FILE, "'use client'")).toBe(true)
  })

  it('usa useQuery para carregar aliases', () => {
    expect(fileContains(FILE, 'useQuery')).toBe(true)
  })

  it('usa useMutation para adicionar alias', () => {
    expect(fileContains(FILE, 'useMutation')).toBe(true)
  })

  it('valida formato de alias antes de enviar', () => {
    expect(fileContains(FILE, 'ALIAS_REGEX')).toBe(true)
  })

  it('tem confirmação antes de remover alias', () => {
    expect(fileContains(FILE, 'confirmRemove')).toBe(true)
  })

  it('tem feedback visual (toast) em sucesso e erro', () => {
    expect(fileContains(FILE, 'toast')).toBe(true)
    expect(fileContains(FILE, "'success'")).toBe(true)
    expect(fileContains(FILE, "'error'")).toBe(true)
  })

  it('input tem aria-label acessível', () => {
    expect(fileContains(FILE, 'aria-label')).toBe(true)
  })

  it('mostra estado loading', () => {
    expect(fileContains(FILE, 'isLoading')).toBe(true)
  })

  it('mostra estado error', () => {
    expect(fileContains(FILE, 'isError')).toBe(true)
  })

  it('mostra estado empty (nenhum alias)', () => {
    expect(fileContains(FILE, 'Nenhum alias')).toBe(true)
  })
})

describe('T-031 — ClubEditor integra AliasManagement', () => {
  const FILE = 'src/components/admin/ClubEditor.tsx'

  it('ClubEditor importa AliasManagement', () => {
    expect(fileContains(FILE, 'AliasManagement')).toBe(true)
  })

  it('ClubEditor tem botão para abrir aliases', () => {
    expect(fileContains(FILE, 'aliasTickerOpen')).toBe(true)
  })
})

describe('T-031 — Óbvios não ditos: segurança e comportamento', () => {
  it('AliasService nunca lança exceção para ticker não encontrado (retorna null)', () => {
    expect(fileContains('src/services/AliasService.ts', 'return null')).toBe(true)
    // Garantir que mensagens de erro não expõem resolução de alias
    expect(fileNotContains(
      'src/app/api/v1/assets/[ticker]/price/route.ts',
      'resolvido para'
    )).toBe(true)
  })

  it('NULL_SENTINEL previne cache miss infinito para aliases inexistentes', () => {
    expect(fileContains('src/services/AliasService.ts', 'NULL_SENTINEL')).toBe(true)
  })

  it('seed de aliases não executa em produção', () => {
    expect(fileContains(
      'prisma/seed/assetAliases.ts',
      'NODE_ENV'
    )).toBe(true)
  })
})
