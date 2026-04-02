// ============================================================================
// Foot Stock — Query Key Factory (TanStack Query)
// ============================================================================

import type { AssetFilters } from '@/types/market'

export const queryKeys = {
  // ---- Usuário atual ----
  currentUser: {
    all: ['current-user'] as const,
  },

  // ---- Assets (ativos) ----
  assets: {
    all: ['assets'] as const,
    list: (filters?: AssetFilters | Record<string, unknown>) =>
      [...queryKeys.assets.all, filters ?? {}] as const,
    priceHistory: (ticker: string, period: string) =>
      ['price-history', ticker, period] as const,
  },

  // ---- Ordens ----
  orders: {
    all: ['orders'] as const,
    list: (filter?: string, page?: number) =>
      [...queryKeys.orders.all, filter, page] as const,
  },

  // ---- Transações ----
  transactions: {
    all: ['transactions'] as const,
    list: (filter?: string, page?: number) =>
      [...queryKeys.transactions.all, filter, page] as const,
  },

  // ---- Notícias ----
  news: {
    all: ['news'] as const,
    list: (ticker?: string) =>
      [...queryKeys.news.all, ticker ?? 'all'] as const,
  },

  // ---- Ligas ----
  leagues: {
    all: ['leagues'] as const,
    list: (type?: string) => [...queryKeys.leagues.all, type ?? 'ALL'] as const,
    myLeagues: ['my-leagues'] as const,
    detail: (id: string) => ['league', id] as const,
    ranking: (id: string) => ['league-ranking', id] as const,
  },

  // ---- Dividendos ----
  dividends: {
    all: ['dividends'] as const,
  },

  // ---- Fórum ----
  forum: {
    all: ['forum'] as const,
    list: (ticker?: string, sort?: string, page?: number) =>
      ['forum', ticker, sort, page] as const,
  },
} as const;
