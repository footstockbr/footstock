import { classifyTrend, TREND_LABELS } from '@/lib/market/trend'

describe('classifyTrend', () => {
  test('valores positivos retornam up', () => {
    expect(classifyTrend(0.01)).toBe('up')
    expect(classifyTrend(1.5)).toBe('up')
    expect(classifyTrend(100)).toBe('up')
  })

  test('valores negativos retornam down', () => {
    expect(classifyTrend(-0.01)).toBe('down')
    expect(classifyTrend(-1.5)).toBe('down')
    expect(classifyTrend(-100)).toBe('down')
  })

  test('zero e valores dentro do epsilon retornam stable', () => {
    expect(classifyTrend(0)).toBe('stable')
    expect(classifyTrend(0.00005)).toBe('stable')
    expect(classifyTrend(-0.00005)).toBe('stable')
  })

  test('labels de tendência', () => {
    expect(TREND_LABELS.up).toBe('Em alta')
    expect(TREND_LABELS.stable).toBe('Estável')
    expect(TREND_LABELS.down).toBe('Em baixa')
  })

  // Task-018: teste de TREND_SENTIMENT_MAP removido — o mapa derivava sentimento
  // da variacao de preco, substituido pela fonte unica do motor (assets.sentiment_score).
})
