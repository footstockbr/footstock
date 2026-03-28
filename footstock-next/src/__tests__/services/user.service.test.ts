import { UserService } from '@/services/user.service'

describe('UserService', () => {
  let service: UserService

  beforeEach(() => {
    service = new UserService()
  })

  describe('requestDeletion', () => {
    it('should throw Not implemented (stub)', async () => {
      await expect(service.requestDeletion('test-id')).rejects.toThrow('Not implemented')
    })
  })

  describe('exportData', () => {
    it('should throw Not implemented (stub)', async () => {
      await expect(service.exportData('test-id')).rejects.toThrow('Not implemented')
    })
  })
})
