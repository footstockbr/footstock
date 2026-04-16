// ============================================================================
// FootStock — Tipos de Patrocinadores e Banners
// Fonte: module-24/TASK-3
// ============================================================================

export const BANNER_POSITIONS = [
  'home_top',
  'home_mid',
  'market_top',
  'cart_top',
  'detail_bot',
] as const

export type BannerPosition = (typeof BANNER_POSITIONS)[number]

/** Dimensões canônicas (INTAKE) para cada posição de banner */
export const BANNER_DIMENSIONS: Record<BannerPosition, { width: number; height: number }> = {
  home_top: { width: 360, height: 80 },
  home_mid: { width: 360, height: 60 },
  market_top: { width: 360, height: 60 },
  cart_top: { width: 360, height: 60 },
  detail_bot: { width: 360, height: 80 },
}

export interface BannerData {
  imageUrl: string
  linkUrl: string
  altText: string
}

export type BannersMap = Partial<Record<BannerPosition, BannerData>>

export interface AdSponsorDto {
  id: string
  name: string
  logo: string | null
  banners: BannersMap
  activeLigaId: string | null
  startsAt: string
  endsAt: string
  active: boolean
  createdAt: string
}

export interface PublicBannerDto {
  position: BannerPosition
  imageUrl: string
  linkUrl: string
  altText: string
  sponsorId: string
  sponsorName: string
}
