// ============================================================================
// DECOMISSIONADO (2026-05) — Supabase Auth/DB foram desligados.
// Auth.js (Credentials + JWE) e Prisma (Railway Postgres) substituíram todos
// os usos. Nenhum código de produção importa este módulo; ele permanece apenas
// como ponto de resolução para mocks de testes legados que ainda referenciam
// '@/lib/supabase' via jest.mock(). Qualquer invocação REAL lança para falhar
// alto em vez de mascarar uma regressão silenciosa.
// ============================================================================

function decommissioned(): never {
  throw new Error(
    '[supabase] Cliente Supabase foi decomissionado. Use Auth.js (@/auth) + Prisma (@/lib/prisma).'
  )
}

export async function createSupabaseServerClient(): Promise<never> {
  return decommissioned()
}

// Proxy que lança em qualquer acesso de propriedade — preserva o nome do export
// para mocks de teste sem expor nenhuma API funcional em produção.
export const supabaseAdmin = new Proxy(
  {},
  {
    get() {
      return decommissioned()
    },
  }
) as unknown as Record<string, never>
