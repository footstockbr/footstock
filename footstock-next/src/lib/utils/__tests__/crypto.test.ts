const SALT = 'test-salt-min-32-characters-here!!'

describe('hashCPF', () => {
  const OLD_ENV = process.env

  beforeAll(() => {
    process.env = { ...OLD_ENV, CPF_HASH_SALT: SALT }
  })

  afterAll(() => {
    process.env = OLD_ENV
  })

  test('CPF com pontuação igual ao sem pontuação', () => {
    jest.resetModules()
    const { hashCPF } = require('../crypto')
    expect(hashCPF('529.982.247-25')).toBe(hashCPF('52998224725'))
  })

  test('resultado é SHA-256 hex de 64 chars', () => {
    jest.resetModules()
    const { hashCPF } = require('../crypto')
    const hash = hashCPF('52998224725')
    expect(hash).toHaveLength(64)
    expect(/^[a-f0-9]+$/.test(hash)).toBe(true)
  })

  test('CPFs diferentes geram hashes diferentes', () => {
    jest.resetModules()
    const { hashCPF } = require('../crypto')
    expect(hashCPF('52998224725')).not.toBe(hashCPF('11111111111'))
  })

  test('resultado é determinístico (mesma entrada = mesmo hash)', () => {
    jest.resetModules()
    const { hashCPF } = require('../crypto')
    expect(hashCPF('52998224725')).toBe(hashCPF('52998224725'))
  })

  test('lança erro quando CPF_HASH_SALT não está configurado', () => {
    jest.resetModules()
    process.env.CPF_HASH_SALT = ''
    const { hashCPF } = require('../crypto')
    expect(() => hashCPF('52998224725')).toThrow('CPF_HASH_SALT não configurado')
    process.env.CPF_HASH_SALT = SALT
  })
})

describe('sha256', () => {
  test('retorna string de 64 chars para qualquer input', () => {
    jest.resetModules()
    const { sha256 } = require('../crypto')
    expect(sha256('test')).toHaveLength(64)
  })
})

describe('generateSecureToken', () => {
  test('retorna string hexadecimal com comprimento correto (default 32)', () => {
    jest.resetModules()
    const { generateSecureToken } = require('../crypto')
    const token = generateSecureToken()
    expect(token).toHaveLength(64) // 32 bytes = 64 hex chars
    expect(/^[a-f0-9]+$/.test(token)).toBe(true)
  })

  test('tokens distintos a cada chamada', () => {
    jest.resetModules()
    const { generateSecureToken } = require('../crypto')
    expect(generateSecureToken()).not.toBe(generateSecureToken())
  })
})
