export type DevTestUserProfile = {
  password: string
  name: string
  planType: 'JOGADOR' | 'CRAQUE' | 'LENDA'
  adminRole?: 'SUPER_ADMIN' | 'ADMINISTRADOR' | 'MONITOR' | 'EDITOR' | 'MODERADOR' | 'CLUB_PARTNER'
  /** Rótulo exibido no botão de login rápido. Padrão: adminRole ?? planType */
  label?: string
  /** Para CLUB_PARTNER: ticker do clube associado (ex: "COL3") */
  clubId?: string
  clubName?: string
}

// Senha dos usuários de teste — visível nos botões da tela de login de qualquer forma.
// Para sobrescrever: NEXT_PUBLIC_DEV_TEST_PASSWORD no .env.local.
const DEV_PASSWORD = process.env.NEXT_PUBLIC_DEV_TEST_PASSWORD ?? 'FootStock@Dev2026!'

export const DEV_TEST_USERS: Record<string, DevTestUserProfile> = {
  'superadmin@foot-stock.test': {
    password: DEV_PASSWORD,
    name: 'Super Admin',
    planType: 'JOGADOR',
    adminRole: 'SUPER_ADMIN',
  },
  'admin@foot-stock.test': {
    password: DEV_PASSWORD,
    name: 'Administrador Teste',
    planType: 'JOGADOR',
    adminRole: 'ADMINISTRADOR',
  },
  'monitor@foot-stock.test': {
    password: DEV_PASSWORD,
    name: 'Monitor Teste',
    planType: 'JOGADOR',
    adminRole: 'MONITOR',
  },
  'editor@foot-stock.test': {
    password: DEV_PASSWORD,
    name: 'Editor Teste',
    planType: 'JOGADOR',
    adminRole: 'EDITOR',
  },
  'moderador@foot-stock.test': {
    password: DEV_PASSWORD,
    name: 'Moderador Teste',
    planType: 'JOGADOR',
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
