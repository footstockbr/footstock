export const ROUTES = {
  // Auth
  HOME: "/",
  LOGIN: "/login",
  CADASTRO: "/cadastro",
  FORGOT_PASSWORD: "/recuperar-senha",
  RESET_PASSWORD: "/redefinir-senha",
  VERIFY_AGE: "/verificar-idade",

  // App
  MERCADO: "/mercado",
  ATIVO: (ticker: string) => `/ativo/${ticker}`,
  MERCADO_DETALHE: (ticker: string) => `/mercado/${ticker}`,
  PORTFOLIO: "/portfolio",
  ORDENS: "/ordens",
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

  // Perfil & LGPD
  PERFIL: "/perfil",
  PERFIL_CONSENTIMENTOS: "/perfil/consentimentos",

  // Checkout
  CHECKOUT: "/checkout",

  // Dashboard (alias mercado)
  DASHBOARD: "/mercado",

  // Public
  PRIVACY: "/privacidade",
  TERMS: "/termos",
  ONBOARDING: "/onboarding",
} as const;
