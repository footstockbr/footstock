'use client'

// ============================================================================
// Foot Stock — SponsorBanner
// Componente cross-module para renderizar banner de patrocinador.
// Retorna null (sem espaço reservado) quando não há sponsor ativo na posição.
// Fonte: module-24/TASK-3/ST004
// ============================================================================

import { useEffect, useState } from 'react'
import Image from 'next/image'
import type { BannerPosition, PublicBannerDto } from '@/lib/types/sponsors'

interface SponsorBannerProps {
  position: BannerPosition
  className?: string
}

export function SponsorBanner({ position, className }: SponsorBannerProps) {
  const [banner, setBanner] = useState<PublicBannerDto | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false

    async function fetchBanner() {
      try {
        const res = await fetch(`/api/v1/public/banners?position=${position}`)
        if (!res.ok) {
          if (!cancelled) setBanner(null)
          return
        }
        const json = (await res.json()) as { success: boolean; data: PublicBannerDto | null }
        if (!cancelled) setBanner(json.data ?? null)
      } catch {
        if (!cancelled) setBanner(null)
      }
    }

    void fetchBanner()
    return () => {
      cancelled = true
    }
  }, [position])

  // Carregando — não reserva espaço
  if (banner === undefined) return null

  // Sem sponsor ativo para esta posição — não reserva espaço
  if (banner === null) return null

  return (
    <a
      href={banner.linkUrl}
      target="_blank"
      rel="noopener noreferrer sponsored"
      aria-label={banner.altText}
      className={className}
    >
      <Image
        src={banner.imageUrl}
        alt={banner.altText}
        width={728}
        height={90}
        className="h-auto w-full rounded-md object-cover"
        priority={false}
        onError={e => {
          // Esconder a imagem se falhar — não quebrar layout
          ;(e.target as HTMLImageElement).style.display = 'none'
        }}
      />
    </a>
  )
}
