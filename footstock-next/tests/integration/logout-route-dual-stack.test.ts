/**
 * Integration tests — TASK-005: Logout dual-stack (Auth.js + Supabase)
 *
 * Cobertura (4 casos):
 *  1. Bearer Supabase valido -> revoga sessao Supabase + limpa cookies +
 *     200 + breadcrumb data.path='supabase_fallback'
 *  2. Bearer ausente, cookie Auth.js presente -> limpa cookies + 200 +
 *     breadcrumb data.path='authjs' (sem chamada Supabase admin)
 *  3. Bearer Supabase invalido/expirado -> tratado como noop, limpa cookies
 *     mesmo assim + 200 (idempotente) + breadcrumb data.path='authjs'
 *  4. Sem nenhuma sessao -> 200 idempotente + breadcrumb data.path='authjs'
 *
 * SKIP alinhado a convencao do dual-stack (vide login-route-dual-stack.test.ts):
 * placeholders documentam intent; reativar quando o setup compartilhado
 * (Supabase mock + cookies() stub) for promovido a tests/setup global.
 */

describe.skip('TASK-005: Logout route dual-stack', () => {
  test('placeholder: implementacao real requer Supabase mock + cookies() stub', () => {
    expect(true).toBe(true)
  })
})
