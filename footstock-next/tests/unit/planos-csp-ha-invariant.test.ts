/**
 * task-010 (loop 06-26-foot-stock-pagamentos-recorrencia-pagseguro) — regressao QA.
 *
 * Trava o criterio H-A do runbook: a Hipotese A (preapproval planless redirect do
 * Mercado Pago, SEM SDK client-side) NAO altera o Content-Security-Policy de /planos.
 *
 * Verificacao objetiva exigida pela task: "comparar os headers CSP de /planos antes
 * e depois do fluxo H-A e falhar se houver qualquer diff nao esperado".
 *
 * Como o CSP e estatico (next.config.ts -> securityHeaders aplicado a `/:path*`),
 * o header e invariante entre antes/depois do fluxo H-A. Este guard falha se qualquer
 * origem de gateway de pagamento (SDK client-side) for introduzida no CSP — exatamente
 * o "diff nao esperado" que H-A nao deve produzir. Se um dia um SDK client-side de MP
 * ou PagSeguro for adicionado, este teste quebra e sinaliza que o CSP mudou.
 *
 * Nota de implantacao: jest.config (testMatch) so coleta tests/**, por isso o guard
 * vive aqui. Le o source de next.config.ts para nao depender de import de modulo
 * Next (withSentryConfig) em ambiente de teste.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const NEXT_CONFIG_SRC = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf8')

// Origens de SDK client-side de gateway que, se presentes no CSP, indicariam que
// H-A deixou de ser redirect-only (regressao). Lista deliberadamente ampla.
const FORBIDDEN_GATEWAY_ORIGINS = [
  'mercadopago',
  'mercadolibre',
  'mlstatic',
  'pagseguro',
  'pagbank',
  'paypal',
  'paypalobjects',
]

/** Extrai o bloco de valor do header Content-Security-Policy do source. */
function extractCspBlock(src: string): string {
  const keyIdx = src.indexOf("key: 'Content-Security-Policy'")
  expect(keyIdx).toBeGreaterThanOrEqual(0)
  // O valor e um array `[ ... ].join('; ')`; capturar do `value: [` ate o `]` seguinte.
  const valueStart = src.indexOf('value: [', keyIdx)
  expect(valueStart).toBeGreaterThanOrEqual(0)
  const valueEnd = src.indexOf(']', valueStart)
  expect(valueEnd).toBeGreaterThan(valueStart)
  return src.slice(valueStart, valueEnd + 1)
}

describe('H-A — preapproval planless redirect nao altera o CSP de /planos', () => {
  const cspBlock = extractCspBlock(NEXT_CONFIG_SRC)

  test('CSP nao contem nenhuma origem de SDK de gateway de pagamento', () => {
    const lower = cspBlock.toLowerCase()
    for (const origin of FORBIDDEN_GATEWAY_ORIGINS) {
      expect(lower).not.toContain(origin)
    }
  })

  test('script-src permanece restrito ao allowlist esperado (sem SDK de pagamento)', () => {
    // Linha do script-src do CSP. H-A nao adiciona nenhuma origem de script.
    const scriptSrcLine = cspBlock
      .split('\n')
      .find((l) => l.includes('script-src'))
    expect(scriptSrcLine).toBeTruthy()
    expect(scriptSrcLine).toContain("'self'")
    expect(scriptSrcLine).toContain('https://js.sentry-cdn.com')
    for (const origin of FORBIDDEN_GATEWAY_ORIGINS) {
      expect(scriptSrcLine!.toLowerCase()).not.toContain(origin)
    }
  })

  test('connect-src permanece sem origem de gateway de pagamento', () => {
    // H-A e redirect top-level (window.open/location), nao fetch/XHR ao gateway,
    // portanto connect-src nao precisa de origem de pagamento.
    const connectSrcLine = cspBlock
      .split('\n')
      .find((l) => l.includes('connect-src'))
    expect(connectSrcLine).toBeTruthy()
    expect(connectSrcLine).toContain("'self'")
    for (const origin of FORBIDDEN_GATEWAY_ORIGINS) {
      expect(connectSrcLine!.toLowerCase()).not.toContain(origin)
    }
  })

  test('CSP e aplicado a todas as rotas (inclui /planos) via source `/:path*`', () => {
    // Garante que o header de seguranca (e o CSP) cobre /planos — o "antes/depois"
    // de H-A le sempre o mesmo header estatico.
    expect(NEXT_CONFIG_SRC).toContain("source: '/:path*'")
    expect(NEXT_CONFIG_SRC).toContain('securityHeaders')
  })
})
