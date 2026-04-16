'use client'

// ============================================================================
// FootStock — SponsorBanner
// Exibe banner publicitário de um patrocinador ativo para a posição solicitada.
// Busca GET /api/v1/public/banners?position={position} (cache Redis 5min).
// Posições e dimensões (FDD painel-admin §2.12 / module-24 TASK-3):
//   home_top  360×80  home_mid  360×60  market_top  360×60
//   cart_top  360×60  detail_bot 360×80
// Renderiza null enquanto carrega ou se não há banner ativo — sem layout shift.
// ============================================================================

import { useEffect, useState } from 'react'
import type { BannerPosition, PublicBannerDto } from '@/lib/types/sponsors'
import { BANNER_DIMENSIONS } from '@/lib/types/sponsors'

interface Props {
  position: BannerPosition
  className?: string
}

export function SponsorBanner({ position, className = '' }: Props) {
  const [banner, setBanner] = useState<PublicBannerDto | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false

    fetch(`/api/v1/banners?position=${position}`)
      .then(async (r) => {
        if (r.status === 204) return { success: true, data: null }
        return r.json()
      })
      .then((data: { success: boolean; data: PublicBannerDto | null }) => {
        if (!cancelled) {
          setBanner(data?.data ?? null)
          setReady(true)
        }
      })
      .catch(() => {
        if (!cancelled) setReady(true)
      })

    return () => { cancelled = true }
  }, [position])

  // Não renderiza nada enquanto não confirma presença de banner
  if (!ready || !banner) return null

  const { width, height } = BANNER_DIMENSIONS[position]

  return (
    <div
      className={`flex justify-center items-center w-full overflow-hidden ${className}`}
      style={{ maxWidth: width, height }}
      aria-label={`Patrocinador: ${banner.sponsorName}`}
    >
      <a
        href={banner.linkUrl}
        target="_blank"
        rel="noopener noreferrer sponsored"
        className="block w-full h-full"
        aria-label={banner.altText}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={banner.imageUrl}
          alt={banner.altText}
          width={width}
          height={height}
          className="object-cover w-full h-full rounded-sm"
          loading="lazy"
          decoding="async"
        />
      </a>
    </div>
  )
}
