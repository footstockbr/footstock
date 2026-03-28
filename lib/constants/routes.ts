// ============================================================================
// Foot Stock — Rotas da aplicação (27 rotas)
// ============================================================================

export const ROUTES = {
  // ---- Autenticação ----
  LOGIN: '/login',
  REGISTER: '/registro',
  FORGOT_PASSWORD: '/esqueci-senha',
  RESET_PASSWORD: '/redefinir-senha',

  // ---- Dashboard ----
  HOME: '/',
  DASHBOARD: '/dashboard',
  PORTFOLIO: '/portfolio',
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

  // ---- Perfil e Configurações ----
  PERFIL: '/perfil',
  CONFIGURACOES: '/configuracoes',
  ASSINATURA: '/assinatura',
  NOTIFICACOES: '/notificacoes',

  // ---- Admin ----
  ADMIN: '/admin',
  ADMIN_USUARIOS: '/admin/usuarios',
  ADMIN_ATIVOS: '/admin/ativos',
  ADMIN_NOTICIAS: '/admin/noticias',
} as const;
