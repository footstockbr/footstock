// ============================================================================
// Testes — ticker-fallback (espelho do core determinístico do footstock-next)
// Valida precisão (denylist + colisão) e recall (os 4 títulos reportados).
// Guarda de paridade: o AMBIGUITY_DENYLIST DEVE casar com o core do Next.
// ============================================================================

import { buildAliasIndex, resolveFromIndex, AMBIGUITY_DENYLIST } from '../ticker-fallback'

// Roster reduzido espelhando o search_text real do DB (subset suficiente p/ os casos).
const ROSTER = [
  { ticker: 'TRI3', searchText: 'sao paulo, spfc, tricolor paulista, soberano, morumbi' },
  { ticker: 'POR3', searchText: 'palmeiras, alviverde, porco, verdao, palmeirenses' },
  { ticker: 'GAL3', searchText: 'atletico-mg, atletico mineiro, galo, mineiro' },
  { ticker: 'COE3', searchText: 'america-mg, coelho, america mineiro, americano' },
  { ticker: 'LEP3', searchText: 'fortaleza, leao do pici, tricolor cearense, leao' },
  { ticker: 'LEA3', searchText: 'vitoria, leao, leao da barra, vitoria ba' },
  { ticker: 'COX3', searchText: 'coritiba, coxa, coxa-branca' },
  { ticker: 'PEI3', searchText: 'santos, peixe, vila belmiro' },
  { ticker: 'TIG3', searchText: 'criciuma, tigre, carvoeiro' },
  { ticker: 'TIS3', searchText: 'vila nova, tigre, coloradinho' },
]

const index = buildAliasIndex(ROSTER)
const resolve = (t: string) => resolveFromIndex(t, index)?.ticker ?? null

describe('ticker-fallback — recall (4 títulos reportados)', () => {
  it('São Paulo ... vence Fortaleza ... sub-20 → TRI3 (sujeito à esquerda)', () => {
    expect(resolve('São Paulo perde pênalti, mas vence Fortaleza sob chuva pelo Brasileiro sub-20')).toBe('TRI3')
  })
  it('Lateral retorna antes ao Palmeiras → POR3', () => {
    expect(resolve('Lateral retorna antes ao Palmeiras e participa de treinos na Academia')).toBe('POR3')
  })
  it('São Paulo empata com o América-MG ... sub-17 → TRI3', () => {
    expect(resolve('São Paulo empata com o América-MG e segue em jejum no Brasileiro sub-17')).toBe('TRI3')
  })
  it('Palmeiras bate Atlético-MG ... sub-17 → POR3', () => {
    expect(resolve('Palmeiras bate Atlético-MG em jogo de sete gols e segue 100% no Brasileirão sub-17')).toBe('POR3')
  })
})

describe('ticker-fallback — precisão (toxic → null)', () => {
  it('"Vitória do Bayern sobre o Real Madrid" → null (vitoria denied)', () => {
    expect(resolve('Vitória do Bayern sobre o Real Madrid deixa clara a diferença')).toBeNull()
  })
  it('"Rafael Leão" → null (leao colidido entre LEP3/LEA3...)', () => {
    expect(resolve('Concorrência por Rafael Leão aumenta com gigante inglês')).toBeNull()
  })
  it('"Lesão na coxa" → null (coxa parte do corpo)', () => {
    expect(resolve('Lesão na coxa tira atacante da Copa do Mundo')).toBeNull()
  })
  it('"futebol americano" → null (americano adjetivo)', () => {
    expect(resolve('Por que o futebol americano cresce no Brasil')).toBeNull()
  })
  it('"Neymar dos Santos" → null (santos sobrenome)', () => {
    expect(resolve('Neymar dos Santos é destaque no Chelsea')).toBeNull()
  })
  it('"tigre" sozinho → null (colide TIG3/TIS3)', () => {
    expect(resolve('O tigre rugiu na rodada')).toBeNull()
  })
})

describe('ticker-fallback — paridade do denylist com o core do Next', () => {
  it('contém os tokens tóxicos canônicos', () => {
    // 'leao'/'athletic' são suprimidos por COLISÃO (não denylist); os abaixo entram
    // explicitamente no denylist e devem casar byte-a-byte com o core do Next.
    expect(AMBIGUITY_DENYLIST.has('vitoria')).toBe(true)
    expect(AMBIGUITY_DENYLIST.has('santos')).toBe(true)
    expect(AMBIGUITY_DENYLIST.has('coxa')).toBe(true)
    expect(AMBIGUITY_DENYLIST.has('americano')).toBe(true)
    expect(AMBIGUITY_DENYLIST.has('sport')).toBe(true)
    expect(AMBIGUITY_DENYLIST.has('flamengo')).toBe(false)
  })
})
