// ============================================================================
// Foot Stock — Barrel Export de Lib (server-safe, sem side effects)
// ============================================================================
//
// IMPORTANTE: NÃO exportar:
// - ./api/client (axios com side effects — importar direto de @/lib/api/client)
// - ./prisma (server-only — importar direto de @/lib/prisma)
// - ./auth/session (Supabase client singleton — importar direto de @/lib/auth/session)
// - componentes React (importar de @/components/*)
// ============================================================================

// Enums
export * from './enums'

// Constantes
export * from './constants'

// Auth (funções puras, sem side effects)
export * from './auth/canAccess'
export * from './auth/planAccess'

// Utils
export * from './utils/cn'
export * from './utils/formatDate'
export * from './utils/formatCurrency'
export * from './utils/formatPercent'
export * from './utils/validators'
export * from './utils/planGuard'

// Guards
export * from './guards'

// API errors (tipos e funções puras)
export * from './api/errors'
