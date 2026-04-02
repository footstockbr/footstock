/**
 * Testes unitarios — hashCPF (SHA-256 + salt)
 * Cobertura: determinismo, normalizacao, fail-fast sem salt, unicidade
 */

const SALT = 'test-salt-minimum-32-characters-here!!'

describe('hashCPF', () => {
  const OLD_ENV = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...OLD_ENV, CPF_HASH_SALT: SALT }
  })

  afterEach(() => {
    process.env = OLD_ENV
  })

  test('CPF com pontuacao gera mesmo hash que sem pontuacao', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { hashCPF } = require('../crypto')
    expect(hashCPF('529.982.247-25')).toBe(hashCPF('52998224725'))
  })

  test('resultado e SHA-256 hex com 64 caracteres lowercase', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { hashCPF } = require('../crypto')
    const hash = hashCPF('52998224725')
    expect(hash).toHaveLength(64)
    expect(/^[a-f0-9]+$/.test(hash)).toBe(true)
  })

  test('CPFs diferentes geram hashes diferentes', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { hashCPF } = require('../crypto')
    expect(hashCPF('52998224725')).not.toBe(hashCPF('11144477735'))
  })

  test('resultado e deterministico (mesma entrada → mesmo hash)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { hashCPF } = require('../crypto')
    const hash1 = hashCPF('52998224725')
    const hash2 = hashCPF('52998224725')
    expect(hash1).toBe(hash2)
  })

  test('lanca Error descritivo quando CPF_HASH_SALT nao esta configurado', () => {
    delete process.env.CPF_HASH_SALT
    jest.resetModules()
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { hashCPF } = require('../crypto')
    expect(() => hashCPF('52998224725')).toThrow('CPF_HASH_SALT não configurado')
  })
})
