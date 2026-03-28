import { formatDate, formatDateTime, formatTime, formatRelativeDate, calcAge } from '../formatDate'

describe('formatDate', () => {
  test('formata data no padrao BR', () => {
    // Usa data com horario explicito para evitar ambiguidade de timezone
    expect(formatDate('2026-03-25T12:00:00Z')).toBe('25/03/2026')
  })

  test('formata data a partir de objeto Date', () => {
    const date = new Date('2024-01-15T12:00:00Z')
    const result = formatDate(date)
    expect(result).toMatch(/15\/01\/2024/)
  })

  test('formata datas de anos diferentes', () => {
    expect(formatDate('2000-12-31T12:00:00Z')).toBe('31/12/2000')
  })
})

describe('formatDateTime', () => {
  test('formata data e hora no padrao BR', () => {
    const result = formatDateTime('2026-03-25T15:30:00Z')
    // O resultado depende do timezone Sao Paulo (UTC-3), entao 15:30 UTC = 12:30 SP
    expect(result).toMatch(/25\/03\/2026/)
    expect(result).toMatch(/\d{2}:\d{2}/)
  })
})

describe('formatTime', () => {
  test('formata apenas hora', () => {
    const result = formatTime('2026-03-25T18:45:00Z')
    expect(result).toMatch(/\d{2}:\d{2}/)
  })
})

describe('formatRelativeDate', () => {
  test('formata como "agora" para datas muito recentes', () => {
    const now = new Date()
    const result = formatRelativeDate(now)
    // Intl.RelativeTimeFormat retorna algo como "agora" ou "ha 0 segundos"
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  test('formata data futura', () => {
    const future = new Date(Date.now() + 120_000) // 2 minutos no futuro
    const result = formatRelativeDate(future)
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  test('formata data antiga como DD/MM/YYYY', () => {
    const old = new Date('2020-01-01T12:00:00Z')
    const result = formatRelativeDate(old)
    // Mais de 30 dias, cai no fallback de formatDate
    expect(result).toMatch(/01\/2020/)
  })
})

describe('calcAge', () => {
  test('calcula idade corretamente', () => {
    const birthDate = new Date()
    birthDate.setFullYear(birthDate.getFullYear() - 20)
    expect(calcAge(birthDate)).toBe(20)
  })

  test('menor de 18 anos retorna valor correto', () => {
    const birthDate = new Date()
    birthDate.setFullYear(birthDate.getFullYear() - 17)
    expect(calcAge(birthDate)).toBe(17)
  })

  test('calcula idade quando aniversario ainda nao chegou no ano atual', () => {
    const today = new Date()
    // Cria data de nascimento com mes futuro
    const futureMonth = today.getMonth() + 2 > 11 ? 0 : today.getMonth() + 2
    const birthDate = new Date(today.getFullYear() - 25, futureMonth, 15)
    // Se o mes do aniversario ainda nao chegou, a idade deve ser 24
    const expectedAge = futureMonth < today.getMonth() ? 25 : 24
    expect(calcAge(birthDate)).toBe(expectedAge)
  })

  test('calcula idade a partir de string ISO', () => {
    const birth = new Date()
    birth.setFullYear(birth.getFullYear() - 30)
    expect(calcAge(birth.toISOString())).toBe(30)
  })
})
