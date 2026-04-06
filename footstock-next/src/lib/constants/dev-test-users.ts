export type DevTestUserProfile = {
  password: string
  name: string
  planType: 'JOGADOR' | 'CRAQUE' | 'LENDA'
  adminRole?: 'SUPER_ADMIN' | 'ADMINISTRADOR' | 'MONITOR' | 'EDITOR' | 'MODERADOR' | 'CLUB_PARTNER'
  label?: string
  clubId?: string
  clubName?: string
}

const DEV_PASSWORD = process.env.NEXT_PUBLIC_DEV_TEST_PASSWORD ?? 'FootStock@Dev2026!'

export const DEV_TEST_USERS: Record<string, DevTestUserProfile> = {
  'superadmin@foot-stock.test': {
    password: DEV_PASSWORD,
    name: 'Super Admin',
    planType: 'LENDA',
    adminRole: 'SUPER_ADMIN',
  },
  'admin@foot-stock.test': {
    password: DEV_PASSWORD,
    name: 'Administrador Teste',
    planType: 'LENDA',
    adminRole: 'ADMINISTRADOR',
  },
  'monitor@foot-stock.test': {
    password: DEV_PASSWORD,
    name: 'Monitor Teste',
    planType: 'LENDA',
    adminRole: 'MONITOR',
  },
  'editor@foot-stock.test': {
    password: DEV_PASSWORD,
    name: 'Editor Teste',
    planType: 'LENDA',
    adminRole: 'EDITOR',
  },
  'moderador@foot-stock.test': {
    password: DEV_PASSWORD,
    name: 'Moderador Teste',
    planType: 'LENDA',
    adminRole: 'MODERADOR',
  },
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
  'clube-parceiro@foot-stock.test': {
    password: DEV_PASSWORD,
    name: 'Clube Parceiro FC',
    planType: 'JOGADOR',
    adminRole: 'CLUB_PARTNER',
    clubId: 'COL3',
    clubName: 'Colorado do Beira-Rio SC',
  },
}
