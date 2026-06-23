// ============================================================================
// Testes unitários — resolveTickerFromText + utilitários
// Rastreabilidade: hardening 2026-05-24 (word-boundary, NFD, ticker-drift)
// ============================================================================

// ─── Mocks obrigatórios (devem preceder todos os imports do módulo) ─────────

jest.mock('server-only', () => ({}))

const mockAssetFindMany = jest.fn()

jest.mock('@/lib/prisma', () => ({
  prisma: {
    asset: {
      findMany: (...args: unknown[]) => mockAssetFindMany(...args),
    },
  },
}))

import {
  resolveTickerFromText,
  resolveByPlayersAndCoach,
  isActiveTicker,
  normalize,
  ACTIVE_TICKERS,
  CANONICAL_TEAM_ALIASES,
} from '@/lib/utils/resolve-ticker'

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Configura mockAssetFindMany para retornar searchText como se fosse o DB */
function mockDb(rows: Array<{ ticker: string; searchText: string }>) {
  mockAssetFindMany.mockResolvedValue(
    rows.map((r) => ({ ticker: r.ticker, searchText: r.searchText }))
  )
}

function mockDbUnavailable() {
  mockAssetFindMany.mockRejectedValue(new Error('DB unavailable'))
}

// ─── Suite principal ─────────────────────────────────────────────────────────

describe('resolveTickerFromText', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Default: DB sem dados (força fallback para Passo 2)
    mockDb([])
  })

  // ─── Entrada inválida ──────────────────────────────────────────────────────

  test('[ENTRADA] texto vazio → null', async () => {
    expect(await resolveTickerFromText('')).toBeNull()
  })

  test('[ENTRADA] texto só espaços → null', async () => {
    expect(await resolveTickerFromText('   ')).toBeNull()
  })

  test('[ENTRADA] texto sem clube → null', async () => {
    expect(await resolveTickerFromText('Rodada do campeonato aconteceu ontem')).toBeNull()
  })

  // ─── Passo 2: aliases hardcoded (DB vazio) ─────────────────────────────────

  test('[PASSO2] "flamengo" → URU3', async () => {
    expect(await resolveTickerFromText('Flamengo vence por 3 a 0')).toBe('URU3')
  })

  test('[PASSO2] "palmeiras" → POR3', async () => {
    expect(await resolveTickerFromText('Palmeiras conquista mais um título')).toBe('POR3')
  })

  test('[PASSO2] "corinthians" → TIM3', async () => {
    expect(await resolveTickerFromText('Corinthians contrata novo atacante')).toBe('TIM3')
  })

  test('[PASSO2] "gremio" (sem acento) → IMO3', async () => {
    expect(await resolveTickerFromText('Grêmio enfrenta rival gaúcho')).toBe('IMO3')
  })

  test('[PASSO2][HARDENING] bare "vitoria" (substantivo comum) NÃO resolve LEA3', async () => {
    // 'vitoria' está no AMBIGUITY_DENYLIST (= vitória/vitory). Linkar toda notícia
    // com a palavra "vitória" ao Vitória-BA seria um falso-positivo massivo.
    // "Vitória vence o Bahia" → casa 'bahia' (BMP3), NÃO 'vitoria'.
    expect(await resolveTickerFromText('Vitória do Bayern sobre o Real Madrid foi clara')).toBeNull()
  })

  test('[PASSO2][HARDENING] forma composta "leao da barra" → LEA3', async () => {
    expect(await resolveTickerFromText('Leão da Barra vence o clássico baiano')).toBe('LEA3')
  })

  test('[PASSO2] "fortaleza" (ticker LEP3, não FOR3 ghost) → LEP3', async () => {
    expect(await resolveTickerFromText('Fortaleza lidera o Nordeste')).toBe('LEP3')
  })

  test('[PASSO2] "juventude" (ticker IND3) → IND3', async () => {
    expect(await resolveTickerFromText('Juventude conquista acesso à Série A')).toBe('IND3')
  })

  // ─── Word-boundary: false positives eliminados ────────────────────────────

  test('[WB] "esportes" NÃO dispara "sport" → null', async () => {
    // "sport" foi removido dos aliases; "sport recife" exige a forma completa
    expect(await resolveTickerFromText('Veja as últimas do mundo dos esportes hoje')).toBeNull()
  })

  test('[WB] "intercontinental" NÃO dispara "inter" → null', async () => {
    // "inter" standalone foi removido; apenas "inter de porto alegre" mapeia COL3
    expect(await resolveTickerFromText('Torneio intercontinental começa esta semana')).toBeNull()
  })

  test('[WB] "influência" NÃO dispara "flu" → null', async () => {
    // "flu" removido; usar "fluminense" para GUE3
    expect(await resolveTickerFromText('O jogador tem muita influência no vestiário')).toBeNull()
  })

  test('[WB] "sport recife" (forma composta) → LEI3', async () => {
    expect(await resolveTickerFromText('Sport Recife negocia atacante')).toBe('LEI3')
  })

  test('[WB] alias composto "rubro-negro" → URU3 (hífen é separador válido)', async () => {
    expect(await resolveTickerFromText('O rubro-negro se prepara para a final')).toBe('URU3')
  })

  // ─── Normalização NFD ─────────────────────────────────────────────────────

  test('[NFD] texto com acento → normalizado e resolvido', async () => {
    // "gávea" não é alias, mas "flamengo" está no texto
    expect(await resolveTickerFromText('Flamengo treina na Gávea com novos reforços')).toBe('URU3')
  })

  test('[NFD] alias com ç/ã sobrevive após normalize()', () => {
    // normalize remove diacríticos: 'são paulo' → 'sao paulo'
    expect(normalize('São Paulo FC')).toBe('sao paulo fc')
    expect(normalize('ação')).toBe('acao')
    expect(normalize('Grêmio')).toBe('gremio')
  })

  // ─── Passo 1: DB tem prioridade sobre Passo 2 ─────────────────────────────

  test('[PASSO1] DB searchText tem prioridade sobre hardcoded', async () => {
    // DB retorna "flamengo" mapeado para PAN3 (inconsistente, mas DB vence)
    mockDb([{ ticker: 'PAN3', searchText: 'flamengo' }])
    expect(await resolveTickerFromText('Flamengo joga hoje')).toBe('PAN3')
  })

  test('[PASSO1] DB indisponível → cai para Passo 2', async () => {
    mockDbUnavailable()
    // Texto com um único clube para evitar ambiguidade de sort-by-length
    expect(await resolveTickerFromText('Flamengo goleia adversário no Maracanã')).toBe('URU3')
  })

  test('[PASSO1] Alias mais longo do DB vence alias mais curto', async () => {
    mockDb([
      { ticker: 'URU3', searchText: 'flamengo,rubro negro carioca' },
      { ticker: 'BMP3', searchText: 'bahia' },
    ])
    // "rubro negro carioca" (18 chars) > "flamengo" (8 chars), ambos mapeiam URU3
    expect(await resolveTickerFromText('O rubro negro carioca domina o campeonato')).toBe('URU3')
  })

  // ─── Colisão de aliases: mais longo vence ────────────────────────────────

  test('[COLUSAO] "tricolor carioca" (GUE3) vence "tricolor" ambíguo', async () => {
    // Tricolor pode ser Bahia, São Paulo ou Grêmio — versão composta é unívoca
    expect(await resolveTickerFromText('O tricolor carioca passou das laranjeiras')).toBe('GUE3')
  })

  test('[COLUSAO] "atletico mineiro" (GAL3) resolve antes de "atletico"', async () => {
    expect(await resolveTickerFromText('Atlético Mineiro vence na Arena MRV')).toBe('GAL3')
  })

  // ─── isActiveTicker ───────────────────────────────────────────────────────

  test('[ACTIVE] ticker real → true', () => {
    expect(isActiveTicker('URU3')).toBe(true)
    expect(isActiveTicker('uru3')).toBe(true)   // case-insensitive
    expect(isActiveTicker('LEP3')).toBe(true)   // tickers corrigidos (não FOR3)
    expect(isActiveTicker('LEA3')).toBe(true)   // não VIT3
    expect(isActiveTicker('IND3')).toBe(true)   // não JUV3
  })

  test('[ACTIVE] ticker ghost → false', () => {
    expect(isActiveTicker('FOR3')).toBe(false)  // ghost — era alias errado de Fortaleza
    expect(isActiveTicker('VIT3')).toBe(false)  // ghost — era alias errado de Vitória
    expect(isActiveTicker('JUV3')).toBe(false)  // ghost — era alias errado de Juventude
    expect(isActiveTicker('XXXX')).toBe(false)
    expect(isActiveTicker('')).toBe(false)
  })

  test('[ACTIVE] todos os aliases em CANONICAL_TEAM_ALIASES apontam para tickers em ACTIVE_TICKERS', () => {
    for (const ticker of Object.keys(CANONICAL_TEAM_ALIASES)) {
      expect(ACTIVE_TICKERS.has(ticker)).toBe(true)
    }
  })
})

// ─── resolveByPlayersAndCoach ────────────────────────────────────────────────

describe('resolveByPlayersAndCoach', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('[P3] nome de jogador no texto → ticker do asset', async () => {
    mockAssetFindMany.mockResolvedValue([
      { ticker: 'URU3', players: 'Gabigol, Pedro, Arrascaeta', coachName: 'Tite' },
    ])
    expect(await resolveByPlayersAndCoach('Pedro marca gol no último minuto')).toBe('URU3')
  })

  test('[P3] nome do técnico no texto → ticker do asset', async () => {
    mockAssetFindMany.mockResolvedValue([
      { ticker: 'URU3', players: null, coachName: 'Filipe Luis' },
    ])
    expect(await resolveByPlayersAndCoach('Filipe Luis fala após a vitória')).toBe('URU3')
  })

  test('[P3] texto sem jogadores/técnicos → null', async () => {
    mockAssetFindMany.mockResolvedValue([
      { ticker: 'URU3', players: 'Gabigol', coachName: null },
    ])
    expect(await resolveByPlayersAndCoach('Rodada do campeonato aconteceu')).toBeNull()
  })

  test('[P3] stop-tokens (da, do, de, fc) não geram match', async () => {
    mockAssetFindMany.mockResolvedValue([
      { ticker: 'URU3', players: 'João da Silva', coachName: null },
    ])
    // "da" e tokens < 4 chars não devem disparar match
    expect(await resolveByPlayersAndCoach('O time da semana foi anunciado')).toBeNull()
  })

  test('[P3] DB indisponível → null (sem exceção)', async () => {
    mockAssetFindMany.mockRejectedValue(new Error('Network error'))
    await expect(resolveByPlayersAndCoach('Pedro marca gol')).resolves.toBeNull()
  })

  test('[P3] texto vazio → null imediato (sem chamar DB)', async () => {
    expect(await resolveByPlayersAndCoach('')).toBeNull()
    expect(mockAssetFindMany).not.toHaveBeenCalled()
  })
})

// ─── Hardening 2026-06-23: precisão-acima-de-recall ──────────────────────────
// Valida o comportamento real contra os títulos de prod que motivaram o fix.
describe('resolveTickerFromText — hardening precisão (2026-06-23)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockDb([]) // força Passo 2 (canonical, já alinhado ao DB)
  })

  // ── RECALL: os 4 títulos reportados como "sem time" DEVEM resolver ao sujeito
  test('[RECALL] "São Paulo perde pênalti, mas vence Fortaleza ... sub-20" → TRI3', async () => {
    expect(await resolveTickerFromText('São Paulo perde pênalti, mas vence Fortaleza sob chuva pelo Brasileiro sub-20')).toBe('TRI3')
  })
  test('[RECALL] "Lateral retorna antes ao Palmeiras ..." → POR3', async () => {
    expect(await resolveTickerFromText('Lateral retorna antes ao Palmeiras e participa de treinos na Academia')).toBe('POR3')
  })
  test('[RECALL] "São Paulo empata com o América-MG ... sub-17" → TRI3 (sujeito, posição à esquerda)', async () => {
    expect(await resolveTickerFromText('São Paulo empata com o América-MG e segue em jejum no Brasileiro sub-17')).toBe('TRI3')
  })
  test('[RECALL] "Palmeiras bate Atlético-MG ... sub-17" → POR3 (sujeito, posição à esquerda)', async () => {
    expect(await resolveTickerFromText('Palmeiras bate Atlético-MG em jogo de sete gols e segue 100% no Brasileirão sub-17')).toBe('POR3')
  })

  // ── PRECISÃO: substantivos comuns / sobrenomes / partes do corpo → null
  test('[PRECISAO] "futebol americano" NÃO resolve COE3 (americano = adjetivo)', async () => {
    expect(await resolveTickerFromText('Por que o futebol americano cresce no Brasil')).toBeNull()
  })
  test('[PRECISAO] "Rafael Leão" NÃO resolve (leao = colisão entre 5 times)', async () => {
    expect(await resolveTickerFromText('Concorrência por Rafael Leão aumenta com entrada de gigante inglês')).toBeNull()
  })
  test('[PRECISAO] "Lesão na coxa" NÃO resolve COX3 (coxa = parte do corpo)', async () => {
    expect(await resolveTickerFromText('Lesão na coxa deve deixar atacante fora da Copa do Mundo')).toBeNull()
  })
  test('[PRECISAO] "Santos" (sobrenome) NÃO resolve PEI3 sozinho', async () => {
    expect(await resolveTickerFromText('Neymar dos Santos é destaque no Chelsea')).toBeNull()
  })

  // ── COLISÃO: aliases ambíguos auto-suprimidos; formas únicas resolvem
  test('[COLISAO] "tigre" sozinho NÃO resolve (colide TIG3/TIS3/TIV3)', async () => {
    expect(await resolveTickerFromText('O tigre rugiu mais alto na rodada')).toBeNull()
  })
  test('[COLISAO] "criciuma" (forma única) → TIG3', async () => {
    expect(await resolveTickerFromText('Criciúma vence e segue invicto')).toBe('TIG3')
  })
  test('[COLISAO] "tricolor" sozinho NÃO resolve (colide BMP3/GUE3/IMO3/LEP3)', async () => {
    expect(await resolveTickerFromText('O tricolor conquista título inédito na temporada')).toBeNull()
  })

  // ── DRIFT FIX: DRA3 é Atlético Goianiense no DB (canonical re-sincronizado)
  test('[DRIFT] "Atlético Goianiense" → DRA3 (não Goiás)', async () => {
    expect(await resolveTickerFromText('Atlético Goianiense bate rival no Brasileirão')).toBe('DRA3')
  })
  test('[DRIFT] "Goiás" → PER3', async () => {
    expect(await resolveTickerFromText('Goiás conquista acesso à Série A')).toBe('PER3')
  })
})
