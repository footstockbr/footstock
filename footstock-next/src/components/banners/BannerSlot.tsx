'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import type { BannerPosition } from '@/lib/types/sponsors'
import { BANNER_DIMENSIONS } from '@/lib/types/sponsors'

interface BannerData {
  id:          string
  position:    string
  imageUrl:    string | null
  linkUrl:     string | null
  altText:     string | null
  width:       number | null
  height:      number | null
  sponsorId:   string | null
  sponsorName: string | null
}

interface Props {
  position: BannerPosition
  className?: string
}

/**
 * BannerSlot — exibe o banner ativo para a posição especificada.
 * Se não há banner ativo, não renderiza nenhum espaço (sem espaço vazio).
 * Clique abre linkUrl em nova aba.
 */
export function BannerSlot({ position, className }: Props) {
  const [banner, setBanner] = useState<BannerData | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function fetchBanner() {
      try {
        const res = await fetch(`/api/v1/banners?position=${position}`, {
          next: { revalidate: 300 },
        })
        if (res.status === 204) {
          if (!cancelled) { setBanner(null); setLoaded(true) }
          return
        }
        if (!res.ok) {
          if (!cancelled) setLoaded(true)
          return
        }
        const json = await res.json()
        if (!cancelled) { setBanner(json.data ?? null); setLoaded(true) }
      } catch {
        if (!cancelled) setLoaded(true)
      }
    }

    fetchBanner()
    return () => { cancelled = true }
  }, [position])

  // Não renderiza nada até carregar (evita flash de espaço vazio)
  if (!loaded || !banner) return null

  const dims = BANNER_DIMENSIONS[position]
  const w = banner.width ?? dims.width
  const h = banner.height ?? dims.height

  const inner = banner.imageUrl ? (
    <Image
      src={banner.imageUrl}
      alt={banner.altText ?? banner.sponsorName ?? 'Banner patrocinado'}
      width={w}
      height={h}
      className="w-full object-contain"
      unoptimized
    />
  ) : (
    <div
      className="flex items-center justify-center bg-[#1E2329] text-xs text-gray-500"
      style={{ width: w, height: h }}
      aria-label={banner.altText ?? 'Banner patrocinado'}
    >
      {banner.sponsorName ?? 'Patrocinador'}
    </div>
  )

  if (banner.linkUrl) {
    return (
      <a
        href={banner.linkUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        aria-label={`Visitar ${banner.sponsorName ?? 'patrocinador'}`}
        data-testid={`banner-slot-${position}`}
      >
        {inner}
      </a>
    )
  }

  return (
    <div className={className} data-testid={`banner-slot-${position}`}>
      {inner}
    </div>
  )
}
