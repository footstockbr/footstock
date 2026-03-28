export const ROUTES = {
  // Auth
  HOME: "/",
  LOGIN: "/login",
  CADASTRO: "/cadastro",
  FORGOT_PASSWORD: "/recuperar-senha",
  VERIFY_AGE: "/verificar-idade",

  // App
  MERCADO: "/mercado",
  ATIVO: (ticker: string) => `/ativo/${ticker}`,
  PORTFOLIO: "/portfolio",
  NOTICIAS: "/noticias",
  LIGAS: "/ligas",
  COMUNIDADE: "/comunidade",
  ASSESSOR: "/assessor",
  GLOSSARIO: "/glossario",
  CONTA: "/conta",
  PLANOS: "/planos",
  INBOX: "/inbox",
  DIVIDENDOS: "/dividendos",

  // Admin
  ADMIN: "/admin",
  ADMIN_MOTOR: "/admin/motor",
  ADMIN_USUARIOS: "/admin/usuarios",
  ADMIN_FINANCEIRO: "/admin/financeiro",
  ADMIN_MODERACAO: "/admin/moderacao",
  ADMIN_NOTICIAS: "/admin/noticias",
  ADMIN_ENGAJAMENTO: "/admin/engajamento",
  ADMIN_CLUBES: "/admin/clubes",
  ADMIN_PATROCINADORES: "/admin/patrocinadores",
  ADMIN_AFILIADOS: "/admin/afiliados",

  // Club Portal
  CLUB: "/club",
} as const;
