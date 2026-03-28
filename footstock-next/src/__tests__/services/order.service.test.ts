import { OrderService } from '@/services/order.service'

describe('OrderService', () => {
  let service: OrderService

  beforeEach(() => {
    service = new OrderService()
  })

  describe('findAll', () => {
    it('should return empty result (stub)', async () => {
      const result = await service.findAll('user-id')
      expect(Array.isArray(result.orders)).toBe(true)
      expect(result.total).toBe(0)
    })
  })

  describe('findById', () => {
    it('should return null (stub)', async () => {
      const result = await service.findById('order-id', 'user-id')
      expect(result).toBeNull()
    })
  })

  describe('create', () => {
    it('should throw Not implemented (stub)', async () => {
      await expect(
        service.create('user-id', { ticker: 'URU3', type: 'MARKET', side: 'BUY', quantity: 10 })
      ).rejects.toThrow('Not implemented')
    })
  })

  describe('cancel', () => {
    it('should throw Not implemented (stub)', async () => {
      await expect(service.cancel('order-id', 'user-id')).rejects.toThrow('Not implemented')
    })
  })
})
