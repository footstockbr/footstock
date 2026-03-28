import { formatPercent, formatDecimalPercent } from '../formatPercent'

describe('formatPercent', () => {
  test('positivo com sinal +', () => {
    expect(formatPercent(5.5)).toBe('+5,50%')
  })

  test('negativo com sinal -', () => {
    expect(formatPercent(-3.1)).toBe('-3,10%')
  })

  test('zero sem sinal', () => {
    expect(formatPercent(0)).toBe('0,00%')
  })

  test('100% com sinal +', () => {
    expect(formatPercent(100)).toBe('+100,00%')
  })

  test('decimal customizado', () => {
    expect(formatPercent(5.123, 1)).toBe('+5,1%')
  })

  test('valor muito pequeno', () => {
    expect(formatPercent(0.01)).toBe('+0,01%')
  })

  test('protege contra NaN', () => {
    expect(formatPercent(NaN)).toBe('0,00%')
  })

  test('protege contra Infinity', () => {
    expect(formatPercent(Infinity)).toBe('0,00%')
  })
})

describe('formatDecimalPercent', () => {
  test('converte decimal para percentual', () => {
    expect(formatDecimalPercent(0.056)).toBe('+5,60%')
  })

  test('decimal negativo', () => {
    expect(formatDecimalPercent(-0.031)).toBe('-3,10%')
  })

  test('zero', () => {
    expect(formatDecimalPercent(0)).toBe('0,00%')
  })
})
