import { formatFS, formatBRL, formatNumber } from '../formatCurrency'

describe('formatFS', () => {
  test('formata valor padrao com separadores BR', () => {
    expect(formatFS(1234.56)).toBe('FS$1.234,56')
  })

  test('formata zero', () => {
    expect(formatFS(0)).toBe('FS$0,00')
  })

  test('formata valor negativo', () => {
    expect(formatFS(-500)).toBe('FS$-500,00')
  })

  test('formata valor grande', () => {
    expect(formatFS(1000000)).toBe('FS$1.000.000,00')
  })

  test('protege contra NaN', () => {
    expect(formatFS(NaN)).toBe('FS$0,00')
  })

  test('protege contra Infinity', () => {
    expect(formatFS(Infinity)).toBe('FS$0,00')
  })

  test('formata com compact para valores >= 1000', () => {
    const result = formatFS(1500, { compact: true })
    expect(result).toMatch(/^FS\$/)
    // Compact notation em pt-BR pode gerar "1,5 mil" ou similar
    expect(result.length).toBeGreaterThan(3)
  })

  test('compact nao altera valores < 1000', () => {
    expect(formatFS(500, { compact: true })).toBe('FS$500,00')
  })
})

describe('formatBRL', () => {
  test('formata em reais com prefixo R$', () => {
    const result = formatBRL(19.9)
    expect(result).toContain('R$')
    expect(result).toContain('19,90')
  })

  test('formata valor zero', () => {
    const result = formatBRL(0)
    expect(result).toContain('R$')
    expect(result).toContain('0,00')
  })

  test('formata valor negativo', () => {
    const result = formatBRL(-100)
    expect(result).toContain('R$')
    expect(result).toContain('100')
  })

  test('formata valor grande', () => {
    const result = formatBRL(1234.56)
    expect(result).toContain('R$')
    expect(result).toContain('1.234,56')
  })

  test('protege contra NaN', () => {
    const result = formatBRL(NaN)
    expect(result).toContain('R$')
    expect(result).toContain('0,00')
  })
})

describe('formatNumber', () => {
  test('formata numero inteiro com separador de milhar', () => {
    expect(formatNumber(10000)).toBe('10.000')
  })

  test('formata com casas decimais', () => {
    expect(formatNumber(1234.5678, 2)).toBe('1.234,57')
  })

  test('formata zero', () => {
    expect(formatNumber(0)).toBe('0')
  })
})
