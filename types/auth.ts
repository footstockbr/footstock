// ============================================================================
// Foot Stock — Tipos do módulo de autenticação
// ============================================================================

export interface LoginFormState {
  email: string
  password: string
}

export interface AuthRedirectState {
  isChecking: boolean
  isAuthenticated: boolean | null
}

export interface WebAuthnRegistrationOptions {
  challenge: string
  rpId: string
  userId: string
  userName: string
}
