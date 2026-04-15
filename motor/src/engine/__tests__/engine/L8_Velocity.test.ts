/**
 * @jest-environment node
 */
import { L8_VelocityCap } from '../../layers/L8_VelocityCap'

describe('L8_VelocityCap', () => {
  const l8 = new L8_VelocityCap()

  test('applyLayer retorna delta zero (apenas applyCap é o hot path)', () => {
    const result = l8.applyLayer({} as never, {} as never, 0)
    expect(result.deltaPrice).toBe(0)
  })

  test('applyCap: delta dentro do cap passa sem alteração', () => {
    // maxTickChange=0.0035 (0.35%), currentPrice=100 → maxChange=0.35
    const capped = l8.applyCap(0.10, 100, 0.0035)
    expect(capped).toBe(0.10)
  })

  test('applyCap: delta acima do cap é truncado (positivo)', () => {
    // maxTickChange=0.0035, currentPrice=100, maxChange=0.35
    // delta=1.0 → capped=0.35
    const capped = l8.applyCap(1.0, 100, 0.0035)
    expect(capped).toBeCloseTo(0.35, 10)
  })

  test('applyCap: delta abaixo do cap é truncado (negativo)', () => {
    const capped = l8.applyCap(-1.0, 100, 0.0035)
    expect(capped).toBeCloseTo(-0.35, 10)
  })

  test('applyCap: cap absoluto de 0.35% (maxTickChange=0.0035)', () => {
    const price       = 28.50
    const maxChange   = price * 0.0035  // 0.09975
    const bigPositive = l8.applyCap(1000, price, 0.0035)
    const bigNegative = l8.applyCap(-1000, price, 0.0035)

    expect(bigPositive).toBeCloseTo(maxChange, 10)
    expect(bigNegative).toBeCloseTo(-maxChange, 10)
  })

  test('excesso não é carregado para o próximo tick (descartado)', () => {
    // Chama applyCap duas vezes com delta grande
    const cap1 = l8.applyCap(5.0, 100, 0.0035)
    const cap2 = l8.applyCap(5.0, 100, 0.0035)

    // Ambos devem retornar o mesmo valor cappado (sem acumulação)
    expect(cap1).toBe(cap2)
    expect(cap1).toBeCloseTo(0.35, 10)
  })

  test('layer name é L8_VelocityCap', () => {
    const result = l8.applyLayer({} as never, {} as never, 0)
    expect(result.layer).toBe('L8_VelocityCap')
  })
})
