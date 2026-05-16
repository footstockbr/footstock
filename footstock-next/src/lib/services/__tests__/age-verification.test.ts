 
// Mock do validators para controlar calcAge
jest.mock('@/lib/utils/validators', () => ({
  calcAge: jest.fn().mockReturnValue(25), // adulto por padrão
}))

describe('verifyAge', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    const { calcAge } = require('@/lib/utils/validators')
    calcAge.mockReturnValue(25) // reset para adulto
  })

  test('retorna isAdult false para menor de 18', () => {
    const { calcAge } = require('@/lib/utils/validators')
    calcAge.mockReturnValue(17)
    const { verifyAge } = require('../age-verification')
    const result = verifyAge('2010-01-01')
    expect(result.isAdult).toBe(false)
    expect(result.verified).toBe(true)
    expect(result.method).toBe('self_declaration')
  })

  test('retorna isAdult true para usuário com 18 anos exatos', () => {
    const { calcAge } = require('@/lib/utils/validators')
    calcAge.mockReturnValue(18)
    const { verifyAge } = require('../age-verification')
    const result = verifyAge('2008-01-01')
    expect(result.isAdult).toBe(true)
    expect(result.verified).toBe(true)
    expect(result.method).toBe('self_declaration')
  })

  test('retorna isAdult true para adulto acima de 18', () => {
    const { verifyAge } = require('../age-verification')
    const result = verifyAge('2000-01-01')
    expect(result.isAdult).toBe(true)
    expect(result.verified).toBe(true)
    expect(result.method).toBe('self_declaration')
  })

  test('verificação é sempre síncrona e não faz chamadas externas', () => {
    const fetchSpy = jest.spyOn(global, 'fetch')
    const { verifyAge } = require('../age-verification')
    verifyAge('2000-01-01')
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})
