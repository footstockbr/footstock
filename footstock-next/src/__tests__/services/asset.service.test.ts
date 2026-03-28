import { AssetService } from '@/services/asset.service'

describe('AssetService', () => {
  let service: AssetService

  beforeEach(() => {
    service = new AssetService()
  })

  describe('findAll', () => {
    it('should return empty array (stub)', async () => {
      const result = await service.findAll()
      expect(Array.isArray(result)).toBe(true)
    })
  })

  describe('findByTicker', () => {
    it('should return null (stub)', async () => {
      const result = await service.findByTicker('URU3')
      expect(result).toBeNull()
    })
  })

  describe('getPriceHistory', () => {
    it('should return empty array (stub)', async () => {
      const result = await service.getPriceHistory('URU3', '1h', 100)
      expect(Array.isArray(result)).toBe(true)
    })
  })
})
