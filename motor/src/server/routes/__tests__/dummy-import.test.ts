import { RedisClientService } from '../../../services/RedisClientService'
import { PriceBuffer } from '../../../lib/PriceBuffer'

test('dummy', () => {
  expect(RedisClientService).toBeDefined()
  expect(PriceBuffer).toBeDefined()
})
