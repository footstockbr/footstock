// ============================================================================
// Unitário de `normalizeNewsText` (T-10, item 011 do loop
// 08-18-foot-stock-motor-noticias-analise).
// Um `test` por CLASSE de entrada, com o nome dizendo qual classe é.
// ============================================================================

import { normalizeNewsText, DEGENERATE_LITERALS } from '../news-text'

describe('normalizeNewsText - ausência disfarçada vira undefined', () => {
  it('não-string devolve undefined', () => {
    expect(normalizeNewsText(undefined)).toBeUndefined()
    expect(normalizeNewsText(null)).toBeUndefined()
    expect(normalizeNewsText(42)).toBeUndefined()
    expect(normalizeNewsText({ texto: 'x' })).toBeUndefined()
    expect(normalizeNewsText([])).toBeUndefined()
  })

  it('string vazia ou só com espaço em branco devolve undefined', () => {
    expect(normalizeNewsText('')).toBeUndefined()
    expect(normalizeNewsText('   ')).toBeUndefined()
    expect(normalizeNewsText('\n\t ')).toBeUndefined()
  })

  it('literal degenerado devolve undefined, em qualquer caixa e com espaço em volta', () => {
    expect(normalizeNewsText('null')).toBeUndefined()
    expect(normalizeNewsText('NULL')).toBeUndefined()
    expect(normalizeNewsText(' null ')).toBeUndefined()
    expect(normalizeNewsText('undefined')).toBeUndefined()
    expect(normalizeNewsText('Undefined')).toBeUndefined()
  })

  it('markup sem conteúdo real devolve undefined', () => {
    expect(normalizeNewsText('<p></p>')).toBeUndefined()
    expect(normalizeNewsText('<p>&nbsp;</p>')).toBeUndefined()
    expect(normalizeNewsText('<br/>')).toBeUndefined()
    expect(normalizeNewsText('<p>null</p>')).toBeUndefined()
  })
})

describe('normalizeNewsText - conteúdo real sobrevive', () => {
  it('devolve o texto trimado', () => {
    expect(normalizeNewsText('Texto real')).toBe('Texto real')
    expect(normalizeNewsText('  Texto real  ')).toBe('Texto real')
  })

  it('preserva as tags do valor original (decisão 4: não é sanitização de HTML)', () => {
    expect(normalizeNewsText('<p>Texto real</p>')).toBe('<p>Texto real</p>')
  })

  it('entidade que vira texto real não é considerada ausência', () => {
    expect(normalizeNewsText('&amp;')).toBe('&amp;')
  })
})

describe('normalizeNewsText - conjunto de literais é fechado', () => {
  // Esta suite é a trava contra ampliação silenciosa do conjunto. T-01 mediu
  // três classes em produção e achou duas; nada além de `null`/`undefined`
  // tem evidência, e ampliar sem medição é inventar regra.
  it.each(['nan', 'none', 'nil', 'n/a', '-'])('%s é texto, não ausência', valor => {
    expect(normalizeNewsText(valor)).toBe(valor)
  })

  it('DEGENERATE_LITERALS contém exatamente null e undefined', () => {
    expect([...DEGENERATE_LITERALS].sort()).toEqual(['null', 'undefined'])
  })
})
