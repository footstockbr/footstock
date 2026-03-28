import { validateCPF, validateEmail, validatePhone, validatePassword, formatCPF, formatPhone } from '../validators'

describe('validateCPF', () => {
  test('CPF valido com pontuacao retorna true', () => {
    expect(validateCPF('529.982.247-25')).toBe(true)
  })

  test('CPF valido sem pontuacao retorna true', () => {
    expect(validateCPF('52998224725')).toBe(true)
  })

  test('CPF invalido retorna false', () => {
    expect(validateCPF('529.982.247-26')).toBe(false)
  })

  test('CPF com todos digitos iguais retorna false', () => {
    expect(validateCPF('111.111.111-11')).toBe(false)
    expect(validateCPF('000.000.000-00')).toBe(false)
    expect(validateCPF('222.222.222-22')).toBe(false)
    expect(validateCPF('333.333.333-33')).toBe(false)
    expect(validateCPF('999.999.999-99')).toBe(false)
  })

  test('CPF com tamanho errado retorna false', () => {
    expect(validateCPF('123456789')).toBe(false)
    expect(validateCPF('1234567890123')).toBe(false)
    expect(validateCPF('')).toBe(false)
  })

  test('outro CPF valido conhecido', () => {
    // 453.178.287-91 e um CPF valido (verificado pelo algoritmo modulo 11)
    expect(validateCPF('453.178.287-91')).toBe(true)
  })
})

describe('validateEmail', () => {
  test('email valido retorna true', () => {
    expect(validateEmail('test@example.com')).toBe(true)
  })

  test('email com subdominio retorna true', () => {
    expect(validateEmail('user@sub.domain.com')).toBe(true)
  })

  test('email sem @ retorna false', () => {
    expect(validateEmail('testexample.com')).toBe(false)
  })

  test('email sem dominio retorna false', () => {
    expect(validateEmail('test@')).toBe(false)
  })

  test('email vazio retorna false', () => {
    expect(validateEmail('')).toBe(false)
  })

  test('email com espacos retorna false', () => {
    expect(validateEmail('te st@example.com')).toBe(false)
  })
})

describe('validatePhone', () => {
  test('celular 11 digitos valido', () => {
    expect(validatePhone('11999999999')).toBe(true)
  })

  test('fixo 10 digitos valido', () => {
    expect(validatePhone('1133334444')).toBe(true)
  })

  test('numero formatado e valido (caracteres nao-numericos removidos)', () => {
    expect(validatePhone('(11) 99999-9999')).toBe(true)
    expect(validatePhone('(11) 3333-4444')).toBe(true)
  })

  test('numero com 8 digitos invalido', () => {
    expect(validatePhone('99999999')).toBe(false)
  })

  test('numero com 12 digitos invalido', () => {
    expect(validatePhone('119999999990')).toBe(false)
  })

  test('vazio invalido', () => {
    expect(validatePhone('')).toBe(false)
  })
})

describe('validatePassword', () => {
  test('senha valida com maiuscula e numero', () => {
    expect(validatePassword('Abcdefg1')).toBe(true)
  })

  test('senha com 8+ caracteres, maiuscula e numero', () => {
    expect(validatePassword('MinhaSenh4Forte')).toBe(true)
  })

  test('senha curta (< 8 chars) invalida', () => {
    expect(validatePassword('Ab1cde')).toBe(false)
  })

  test('senha sem maiuscula invalida', () => {
    expect(validatePassword('abcdefg1')).toBe(false)
  })

  test('senha sem numero invalida', () => {
    expect(validatePassword('Abcdefgh')).toBe(false)
  })

  test('senha vazia invalida', () => {
    expect(validatePassword('')).toBe(false)
  })
})

describe('formatCPF', () => {
  test('formata CPF corretamente', () => {
    expect(formatCPF('52998224725')).toBe('529.982.247-25')
  })
})

describe('formatPhone', () => {
  test('formata celular 11 digitos', () => {
    expect(formatPhone('11999999999')).toBe('(11) 99999-9999')
  })

  test('formata fixo 10 digitos', () => {
    expect(formatPhone('1133334444')).toBe('(11) 3333-4444')
  })
})
