// ============================================================================
// Foot Stock — Storage Keys (localStorage / sessionStorage / cookies)
// ============================================================================

export const STORAGE_KEYS = {
  // ---- localStorage ----
  LOCAL: {
    /** Chave de flag WebAuthn por email — indica se passkey está habilitada */
    WEBAUTHN_ENABLED: (email: string) => `webauthn_enabled:${email}` as const,
  },

  // ---- Cookies ----
  COOKIES: {
    SESSION: 'session',
    ADMIN_SESSION: 'admin_session',
    CLUB_SESSION: 'club_session',
  },
} as const;
