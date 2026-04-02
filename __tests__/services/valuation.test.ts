import { ValuationService } from '@/lib/services/ValuationService'

describe('ValuationService', () => {
  it('should apply equity floor of 10%', () => {
    const equity = ValuationService.calculateEquity(1000, 1500) // dívida > EV
    expect(equity).toBe(100) // 10% of EV
  })

  it('should return EV minus debt when positive', () => {
    const equity = ValuationService.calculateEquity(1000, 400)
    expect(equity).toBe(600)
  })

  it('should calculate supply from float and IPO', () => {
    const supply = ValuationService.calculateInitialSupply(5_000_000, 25)
    expect(supply).toBe(200_000)
  })

  it('should calculate float correctly', () => {
    const float = ValuationService.calculateFloat(10_000, 0.3)
    expect(float).toBe(3_000)
  })

  it('should run full pipeline', () => {
    const result = ValuationService.calculate({
      revenue: 200_000,
      debt: 50_000,
      equity: 80_000,
      freeFloat: 0.25,
    })
    expect(result.ev).toBeGreaterThan(0)
    expect(result.equityValue).toBeGreaterThanOrEqual(result.ev * 0.10)
    expect(result.float).toBeLessThanOrEqual(result.equityValue)
    expect(result.ipoPrice).toBeGreaterThanOrEqual(5)
    expect(result.ipoPrice).toBeLessThanOrEqual(50)
    expect(result.initialSupply).toBeGreaterThan(0)
  })

  it('should throw if IPO price is 0', () => {
    expect(() => ValuationService.calculateInitialSupply(1000, 0)).toThrow()
  })
})
