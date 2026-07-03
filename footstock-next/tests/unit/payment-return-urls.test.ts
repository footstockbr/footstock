/**
 * Testes unitarios — URLs de retorno do gateway + normalizacao de params (incidente 2026-07-03).
 *
 * O Mercado Pago anexou `?preapproval_id=...` a uma back_url que ja tinha query string,
 * malformando o retorno (`?sub=...&plan=CRAQUE?preapproval_id=...`). Contratos cobertos:
 *  - successUrl e PATH-BASED (sem query propria) — qualquer anexo do gateway vira query valida.
 *  - normalizeGatewayReturnParam corta lixo anexado pelo gateway no valor do param.
 */

import { buildGatewayReturnUrls } from '@/lib/services/payment-return-urls'
import { normalizeGatewayReturnParam } from '@/lib/payments/gateway-return-params'

const APP = 'https://www.footstock.com.br'
const SUB = 'cmr591yns000601lb7r4ol2bd'

describe('buildGatewayReturnUrls — successUrl path-based (incidente 2026-07-03)', () => {
  it('happy: successUrl carrega o subId no PATH e nao tem query string propria', () => {
    const { successUrl } = buildGatewayReturnUrls(APP, SUB)
    expect(successUrl).toBe(`${APP}/planos/sucesso/${SUB}`)
    expect(successUrl).not.toContain('?')
  })

  it('happy: anexo estilo MP (`?preapproval_id=`) sobre a successUrl produz URL valida', () => {
    const { successUrl } = buildGatewayReturnUrls(APP, SUB)
    const returned = new URL(`${successUrl}?preapproval_id=3a0f8ce376424815b0217e731b308604`)
    expect(returned.pathname).toBe(`/planos/sucesso/${SUB}`)
    expect(returned.searchParams.get('preapproval_id')).toBe('3a0f8ce376424815b0217e731b308604')
  })

  it('failure/pending mantem o formato ?payment= consumido por /planos', () => {
    const { failureUrl, pendingUrl } = buildGatewayReturnUrls(APP, SUB)
    expect(failureUrl).toBe(`${APP}/planos?payment=failed`)
    expect(pendingUrl).toBe(`${APP}/planos?payment=pending&sub=${SUB}`)
  })
})

describe('normalizeGatewayReturnParam — tolerancia a lixo anexado pelo gateway', () => {
  it('happy: valor limpo passa intacto', () => {
    expect(normalizeGatewayReturnParam('CRAQUE')).toBe('CRAQUE')
    expect(normalizeGatewayReturnParam('failed')).toBe('failed')
  })

  it('sad: corta `?` anexado (caso real do incidente — plan=CRAQUE?preapproval_id=...)', () => {
    expect(normalizeGatewayReturnParam('CRAQUE?preapproval_id=3a0f8ce3')).toBe('CRAQUE')
    expect(normalizeGatewayReturnParam('LENDA?preapproval_id=xyz')).toBe('LENDA')
    expect(normalizeGatewayReturnParam('failed?collection_id=123')).toBe('failed')
  })

  it('sad: corta `&` e `#` anexados', () => {
    expect(normalizeGatewayReturnParam('pending&status=x')).toBe('pending')
    expect(normalizeGatewayReturnParam('success#frag')).toBe('success')
  })

  it('sad: null/undefined/vazio viram string vazia (sem throw)', () => {
    expect(normalizeGatewayReturnParam(null)).toBe('')
    expect(normalizeGatewayReturnParam(undefined)).toBe('')
    expect(normalizeGatewayReturnParam('')).toBe('')
  })

  it('sad: valor que COMECA com separador vira vazio (nao vaza lixo)', () => {
    expect(normalizeGatewayReturnParam('?preapproval_id=abc')).toBe('')
  })

  it('sad: param duplicado (array do Next searchParams) usa o primeiro valor (review codex F5)', () => {
    expect(normalizeGatewayReturnParam(['CRAQUE?preapproval_id=x', 'LENDA'])).toBe('CRAQUE')
    expect(normalizeGatewayReturnParam(['success?x=y'])).toBe('success')
    expect(normalizeGatewayReturnParam([])).toBe('')
  })
})
