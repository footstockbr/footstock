// ============================================================================
// Foot Stock — Rotas da aplicação (42 rotas)
// ============================================================================

export const ROUTES = {
  // ---- Autenticação ----
  LOGIN: '/',
  REGISTER: '/registro',
  FORGOT_PASSWORD: '/esqueci-senha',
  RESET_PASSWORD: '/redefinir-senha',

  // ---- Dashboard ----
  HOME: '/',
  DASHBOARD: '/dashboard',
  PORTFOLIO: '/carteira',
  HISTORICO: '/historico',

  // ---- Mercado ----
  MERCADO: '/mercado',
  MERCADO_TICKER: (ticker: string) => `/mercado/${ticker}` as const,

  // ---- Ordens ----
  ORDENS: '/ordens',
  NOVA_ORDEM: '/ordens/nova',

  // ---- Ligas ----
  LIGAS: '/ligas',
  LIGA_DETALHE: (id: string) => `/ligas/${id}` as const,
  LIGA_CRIAR: '/ligas/criar',
  RANKING: '/ranking',

  // ---- Notícias ----
  NOTICIAS: '/noticias',
  NOTICIA_DETALHE: (slug: string) => `/noticias/${slug}` as const,

  // ---- Fórum ----
  FORUM: '/forum',
  FORUM_TOPICO: (id: string) => `/forum/${id}` as const,

  // ---- Glossário ----
  GLOSSARIO: '/glossario',

  // ---- Perfil e Configurações ----
  PERFIL: '/perfil',
  CONFIGURACOES: '/configuracoes',
  ASSINATURA: '/assinatura',
  NOTIFICACOES: '/notificacoes',

  // ---- Legal / Público ----
  PRIVACY: '/privacy',
  TERMS: '/terms',
  TERMOS: '/termos',
  ONBOARDING: '/onboarding',

  // ---- Assessor IA ----
  ASSESSOR: '/assessor',

  // ---- Planos ----
  PLANOS: '/planos',
  PLANOS_HISTORICO: '/planos/historico',

  // ---- Admin ----
  ADMIN: '/admin',
  ADMIN_LOGIN: '/admin/login',
  ADMIN_LOGIN_WITH_REASON: (reason: string) => `/admin/login?reason=${reason}` as const,
  ADMIN_USUARIOS: '/admin/usuarios',
  ADMIN_ATIVOS: '/admin/ativos',
  ADMIN_NOTICIAS: '/admin/noticias',
  ADMIN_ENGAJAMENTO: '/admin/engajamento',
  ADMIN_MOTOR: '/admin/motor',
  ADMIN_FINANCEIRO: '/admin/financeiro',
  ADMIN_MODERACAO: '/admin/moderacao',
  ADMIN_PATROCINADORES: '/admin/patrocinadores',

  // ---- Clube Parceiro ----
  CLUB: '/club',
  CLUB_LOGIN: '/club/login',

  // ---- Afiliado ----
  AFFILIATE: '/affiliate',

  // ---- Inbox / Notificações ----
  INBOX: '/inbox',
} as const;
