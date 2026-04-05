const SALT = 'test-salt-min-32-characters-here!!'
const HMAC_SECRET = 'test-hmac-secret-min-32-chars-ok!!'

describe('hashCPF', () => {
  const OLD_ENV = process.env

  afterEach(() => {
    process.env = { ...OLD_ENV }
    jest.resetModules()
  })

  describe('modo HMAC-SHA256 (HMAC_CPF_SECRET configurado)', () => {
    beforeEach(() => {
      process.env = { ...OLD_ENV, HMAC_CPF_SECRET: HMAC_SECRET }
    })

    test('CPF com pontuação igual ao sem pontuação', () => {
      const { hashCPF } = require('../crypto')
      expect(hashCPF('529.982.247-25')).toBe(hashCPF('52998224725'))
    })

    test('resultado é hex de 64 chars', () => {
      const { hashCPF } = require('../crypto')
      const hash = hashCPF('52998224725')
      expect(hash).toHaveLength(64)
      expect(/^[a-f0-9]+$/.test(hash)).toBe(true)
    })

    test('CPFs diferentes geram hashes diferentes', () => {
      const { hashCPF } = require('../crypto')
      expect(hashCPF('52998224725')).not.toBe(hashCPF('11111111111'))
    })

    test('resultado é determinístico (mesma entrada = mesmo hash)', () => {
      const { hashCPF } = require('../crypto')
      expect(hashCPF('52998224725')).toBe(hashCPF('52998224725'))
    })

    test('HMAC gera hash diferente do SHA-256+salt legado', () => {
      const { hashCPF: hashHMAC } = require('../crypto')
      const hmacHash = hashHMAC('52998224725')

      jest.resetModules()
      delete process.env.HMAC_CPF_SECRET
      process.env.CPF_HASH_SALT = SALT
      const { hashCPF: hashLegacy } = require('../crypto')
      const legacyHash = hashLegacy('52998224725')

      expect(hmacHash).not.toBe(legacyHash)
    })
  })

  describe('modo legado SHA-256+salt (apenas CPF_HASH_SALT)', () => {
    beforeEach(() => {
      process.env = { ...OLD_ENV, CPF_HASH_SALT: SALT }
      delete process.env.HMAC_CPF_SECRET
    })

    test('CPF com pontuação igual ao sem pontuação', () => {
      const { hashCPF } = require('../crypto')
      expect(hashCPF('529.982.247-25')).toBe(hashCPF('52998224725'))
    })

    test('resultado é hex de 64 chars', () => {
      const { hashCPF } = require('../crypto')
      const hash = hashCPF('52998224725')
      expect(hash).toHaveLength(64)
      expect(/^[a-f0-9]+$/.test(hash)).toBe(true)
    })

    test('emite console.warn sobre migração', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation()
      const { hashCPF } = require('../crypto')
      hashCPF('52998224725')
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('HMAC_CPF_SECRET')
      )
      warnSpy.mockRestore()
    })
  })

  describe('nenhum secret configurado', () => {
    beforeEach(() => {
      process.env = { ...OLD_ENV }
      delete process.env.HMAC_CPF_SECRET
      delete process.env.CPF_HASH_SALT
    })

    test('lança erro quando nenhum secret está configurado', () => {
      const { hashCPF } = require('../crypto')
      expect(() => hashCPF('52998224725')).toThrow('CPF_HASH_SALT não configurado')
    })
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
