// ============================================================================
// Foot Stock — Rotas da API (44 endpoints)
// ============================================================================

const BASE = '/api/v1' as const;

export const API_ROUTES = {
  BASE,

  // ---- AUTH (6) ----
  AUTH: {
    LOGIN: `${BASE}/auth/login`,
    REGISTER: `${BASE}/auth/register`,
    LOGOUT: `${BASE}/auth/logout`,
    REFRESH: `${BASE}/auth/refresh`,
    FORGOT_PASSWORD: `${BASE}/auth/forgot-password`,
    RESET_PASSWORD: `${BASE}/auth/reset-password`,
  },

  // ---- USERS (5) ----
  USERS: {
    ME: `${BASE}/users/me`,
    UPDATE_PROFILE: `${BASE}/users/me/profile`,
    UPDATE_PASSWORD: `${BASE}/users/me/password`,
    INVESTOR_PROFILE: `${BASE}/users/me/investor-profile`,
    NOTIFICATIONS: `${BASE}/users/me/notifications`,
  },

  // ---- ASSETS (5) ----
  ASSETS: {
    LIST: `${BASE}/assets`,
    DETAIL: (ticker: string) => `${BASE}/assets/${ticker}` as const,
    HISTORY: (ticker: string) => `${BASE}/assets/${ticker}/history` as const,
    SEARCH: `${BASE}/assets/search`,
    RANKING: `${BASE}/assets/ranking`,
  },

  // ---- ORDERS (5) ----
  ORDERS: {
    LIST: `${BASE}/orders`,
    CREATE: `${BASE}/orders`,
    DETAIL: (id: string) => `${BASE}/orders/${id}` as const,
    CANCEL: (id: string) => `${BASE}/orders/${id}/cancel` as const,
    HISTORY: `${BASE}/orders/history`,
  },

  // ---- POSITIONS (4) ----
  POSITIONS: {
    LIST: `${BASE}/positions`,
    DETAIL: (id: string) => `${BASE}/positions/${id}` as const,
    SUMMARY: `${BASE}/positions/summary`,
    DIVIDENDS: `${BASE}/positions/dividends`,
  },

  // ---- SUBSCRIPTIONS (5) ----
  SUBSCRIPTIONS: {
    CURRENT: `${BASE}/subscriptions/current`,
    PLANS: `${BASE}/subscriptions/plans`,
    SUBSCRIBE: `${BASE}/subscriptions/subscribe`,
    CANCEL: `${BASE}/subscriptions/cancel`,
    INVOICES: `${BASE}/subscriptions/invoices`,
  },

  // ---- NEWS (4) ----
  NEWS: {
    LIST: `${BASE}/news`,
    DETAIL: (slug: string) => `${BASE}/news/${slug}` as const,
    LATEST: `${BASE}/news/latest`,
    BY_ASSET: (ticker: string) => `${BASE}/news/asset/${ticker}` as const,
  },

  // ---- LEAGUES (5) ----
  LEAGUES: {
    LIST: `${BASE}/leagues`,
    CREATE: `${BASE}/leagues`,
    DETAIL: (id: string) => `${BASE}/leagues/${id}` as const,
    JOIN: (id: string) => `${BASE}/leagues/${id}/join` as const,
    RANKING: (id: string) => `${BASE}/leagues/${id}/ranking` as const,
  },

  // ---- FORUM (5) ----
  FORUM: {
    TOPICS: `${BASE}/forum/topics`,
    TOPIC_DETAIL: (id: string) => `${BASE}/forum/topics/${id}` as const,
    CREATE_TOPIC: `${BASE}/forum/topics`,
    REPLIES: (topicId: string) => `${BASE}/forum/topics/${topicId}/replies` as const,
    CREATE_REPLY: (topicId: string) => `${BASE}/forum/topics/${topicId}/replies` as const,
  },

  // ---- ADMIN (5) ----
  ADMIN: {
    USERS: `${BASE}/admin/users`,
    USER_DETAIL: (id: string) => `${BASE}/admin/users/${id}` as const,
    ASSETS: `${BASE}/admin/assets`,
    NEWS: `${BASE}/admin/news`,
    DASHBOARD: `${BASE}/admin/dashboard`,
  },
} as const;
