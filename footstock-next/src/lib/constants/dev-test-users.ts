/**
 * Perfis DEV/teste seedados em dev e prod.
 *
 * Regra canonica: planType e conceito de player. Staff (qualquer adminRole
 * diferente de undefined) NAO recebe planType — fica null no banco e
 * renderiza StaffBadge na UI.
 */
export type DevTestUserProfile = {
  password: string
  name: string
  // planType: opcional — present apenas para players (NORMAL).
  // Ausente para staff (ADMIN, CLUB_PARTNER).
  planType?: 'JOGADOR' | 'CRAQUE' | 'LENDA'
  adminRole?: 'SUPER_ADMIN' | 'ADMINISTRADOR' | 'MONITOR' | 'EDITOR' | 'MODERADOR' | 'CLUB_PARTNER'
  label?: string
  clubId?: string
  clubName?: string
}

const DEV_PASSWORD = process.env.NEXT_PUBLIC_DEV_TEST_PASSWORD ?? 'FootStock@Dev2026!'

export const DEV_TEST_USERS: Record<string, DevTestUserProfile> = {
  // ─── Staff (sem planType) ─────────────────────────────────────────────────
  'superadmin@foot-stock.test': {
    password: DEV_PASSWORD,
    name: 'Super Admin',
    adminRole: 'SUPER_ADMIN',
  },
  'admin@foot-stock.test': {
    password: DEV_PASSWORD,
    name: 'Administrador Teste',
    adminRole: 'ADMINISTRADOR',
  },
  'monitor@foot-stock.test': {
    password: DEV_PASSWORD,
    name: 'Monitor Teste',
    adminRole: 'MONITOR',
  },
  'editor@foot-stock.test': {
    password: DEV_PASSWORD,
    name: 'Editor Teste',
    adminRole: 'EDITOR',
  },
  'moderador@foot-stock.test': {
    password: DEV_PASSWORD,
    name: 'Moderador Teste',
    adminRole: 'MODERADOR',
  },
  // ─── Players (com planType) ───────────────────────────────────────────────
  'craque@foot-stock.test': {
    password: DEV_PASSWORD,
    name: 'Usuário Craque',
    planType: 'CRAQUE',
  },
  'lenda@foot-stock.test': {
    password: DEV_PASSWORD,
    name: 'Usuário Lenda',
    planType: 'LENDA',
    label: 'LENDA / AFILIADO',
  },
  'jogador@foot-stock.test': {
    password: DEV_PASSWORD,
    name: 'Usuário Jogador',
    planType: 'JOGADOR',
  },
  // ─── Institucional (staff de clube; sem planType) ─────────────────────────
  'clube-parceiro@foot-stock.test': {
    password: DEV_PASSWORD,
    name: 'Clube Parceiro FC',
    adminRole: 'CLUB_PARTNER',
    clubId: 'COL3',
    clubName: 'Colorado do Beira-Rio SC',
  },
}

/** True se o profile representa staff (sem planType, com adminRole). */
export function isStaffDevProfile(profile: DevTestUserProfile): boolean {
  return !!profile.adminRole
}
