import {
  expectedToken,
  isTokenValid,
  isReasonValid,
  normalizeReason,
  validateGlobalHaltConfirm,
  REASON_MIN,
  REASON_MAX,
} from '@/lib/utils/global-halt-confirm'

describe('global-halt-confirm — token por fluxo', () => {
  it('exige PAUSAR no fluxo de pausa e RETOMAR no de retomada', () => {
    expect(expectedToken('halt')).toBe('PAUSAR')
    expect(expectedToken('resume')).toBe('RETOMAR')
  })

  it('aceita token exato (com whitespace de borda tolerado)', () => {
    expect(isTokenValid('halt', 'PAUSAR')).toBe(true)
    expect(isTokenValid('halt', '  PAUSAR  ')).toBe(true)
    expect(isTokenValid('resume', 'RETOMAR')).toBe(true)
  })

  it('rejeita token do outro fluxo e variações inválidas', () => {
    // token do fluxo errado não confirma (copy não-ambígua entre pausar e retomar)
    expect(isTokenValid('halt', 'RETOMAR')).toBe(false)
    expect(isTokenValid('resume', 'PAUSAR')).toBe(false)
    expect(isTokenValid('halt', 'pausar')).toBe(false)
    expect(isTokenValid('halt', 'PAUSA')).toBe(false)
    expect(isTokenValid('halt', '')).toBe(false)
  })
})

describe('global-halt-confirm — motivo 10..500 (espelha backend)', () => {
  it('rejeita motivo curto (< 10)', () => {
    expect(isReasonValid('curto')).toBe(false)
    expect(isReasonValid('a'.repeat(REASON_MIN - 1))).toBe(false)
  })

  it('aceita motivo no limite inferior e superior', () => {
    expect(isReasonValid('a'.repeat(REASON_MIN))).toBe(true)
    expect(isReasonValid('a'.repeat(REASON_MAX))).toBe(true)
  })

  it('rejeita motivo acima de 500', () => {
    expect(isReasonValid('a'.repeat(REASON_MAX + 1))).toBe(false)
  })

  it('valida sobre o valor normalizado (trim) que será enviado', () => {
    // 9 chars úteis + espaços não passa: o backend recebe o valor trimado
    expect(normalizeReason('   nove cars   ')).toBe('nove cars')
    expect(isReasonValid('   nove cars   ')).toBe(false)
    expect(isReasonValid('   motivo valido aqui   ')).toBe(true)
  })
})

describe('global-halt-confirm — validateGlobalHaltConfirm (canSubmit + erros)', () => {
  it('só habilita submit quando token E motivo são válidos', () => {
    const ok = validateGlobalHaltConfirm('halt', 'PAUSAR', 'motivo operacional valido')
    expect(ok.tokenOk).toBe(true)
    expect(ok.reasonOk).toBe(true)
    expect(ok.canSubmit).toBe(true)
    expect(ok.tokenError).toBeNull()
    expect(ok.reasonError).toBeNull()
  })

  it('token incorreto bloqueia submit e expõe erro (sem efeito colateral)', () => {
    const v = validateGlobalHaltConfirm('halt', 'PAUSA', 'motivo operacional valido')
    expect(v.canSubmit).toBe(false)
    expect(v.tokenError).toContain('PAUSAR')
  })

  it('motivo curto bloqueia submit e expõe erro com a contagem', () => {
    const v = validateGlobalHaltConfirm('resume', 'RETOMAR', 'curto')
    expect(v.canSubmit).toBe(false)
    expect(v.reasonError).toContain('mínimo')
  })

  it('campos vazios não gritam erro prematuro, mas mantêm submit bloqueado', () => {
    const v = validateGlobalHaltConfirm('halt', '', '')
    expect(v.tokenError).toBeNull()
    expect(v.reasonError).toBeNull()
    expect(v.canSubmit).toBe(false)
  })

  it('motivo longo demais bloqueia submit e sinaliza máximo', () => {
    const v = validateGlobalHaltConfirm('halt', 'PAUSAR', 'a'.repeat(REASON_MAX + 1))
    expect(v.canSubmit).toBe(false)
    expect(v.reasonError).toContain('máximo')
  })
})
