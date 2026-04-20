'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Image from 'next/image'
import type { BannerPosition } from '@/lib/types/sponsors'
import { BANNER_DIMENSIONS } from '@/lib/types/sponsors'

const ROTATION_INTERVAL_MS = 30_000 // 30 seconds

interface BannerData {
  id:               string
  position:         string
  imageUrl:         string | null
  linkUrl:          string | null
  altText:          string | null
  title:            string | null
  company:          string | null
  color:            string | null
  ctaText:          string | null
  ctaColor:         string | null
  width:            number | null
  height:           number | null
  imageDesktopUrl:  string | null
  imageMobileUrl:   string | null
  imageVerticalUrl: string | null
  sponsorId:        string | null
  sponsorName:      string | null
}

type SlotVariant = 'default' | 'sidebar'

interface Props {
  position: BannerPosition
  className?: string
  /** Use "sidebar" to prefer the vertical image (160x600) */
  variant?: SlotVariant
}

/**
 * BannerSlot — exibe banners ativos para a posicao especificada com auto-rotacao.
 * Cicla entre banners ativos a cada 30 segundos com transicao CSS fade.
 * Para cada banner: se existe imagem para o viewport atual, renderiza a imagem.
 * Caso contrario, renderiza fallback estilizado com cor, titulo, empresa e CTA.
 */
export function BannerSlot({ position, className, variant = 'default' }: Props) {
  const [banners, setBanners] = useState<BannerData[]>([])
  const [loaded, setLoaded] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [fading, setFading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchBanners() {
      try {
        const res = await fetch(`/api/v1/banners?position=${position}`, {
          next: { revalidate: 300 },
        })
        if (res.status === 204) {
          if (!cancelled) { setBanners([]); setLoaded(true) }
          return
        }
        if (!res.ok) {
          if (!cancelled) setLoaded(true)
          return
        }
        const json = await res.json()
        if (!cancelled) {
          const data = json.data
          // Handle both array (new) and single object (legacy) responses
          if (Array.isArray(data)) {
            setBanners(data)
          } else if (data) {
            setBanners([data])
          } else {
            setBanners([])
          }
          setLoaded(true)
        }
      } catch {
        if (!cancelled) setLoaded(true)
      }
    }

    fetchBanners()
    return () => { cancelled = true }
  }, [position])

  // Auto-rotation timer
  const rotate = useCallback(() => {
    if (banners.length <= 1) return
    setFading(true)
    setTimeout(() => {
      setActiveIndex((prev) => (prev + 1) % banners.length)
      setFading(false)
    }, 300) // 300ms for fade-out, then switch and fade-in
  }, [banners.length])

  useEffect(() => {
    if (banners.length <= 1) return
    timerRef.current = setInterval(rotate, ROTATION_INTERVAL_MS)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [banners.length, rotate])

  // Reset index when banners change
  useEffect(() => {
    setActiveIndex(0)
  }, [banners.length])

  if (!loaded || banners.length === 0) return null

  const banner = banners[activeIndex % banners.length]
  if (!banner) return null

  const dims = BANNER_DIMENSIONS[position]
  const w = banner.width ?? dims.width
  const h = banner.height ?? dims.height

  // Pick the right image URL based on variant/viewport
  // For sidebar variant, prefer vertical. Otherwise, use desktop for md+, mobile for sm.
  const imageUrl = variant === 'sidebar'
    ? (banner.imageVerticalUrl ?? banner.imageDesktopUrl ?? banner.imageUrl)
    : (banner.imageDesktopUrl ?? banner.imageMobileUrl ?? banner.imageUrl)

  const mobileImageUrl = banner.imageMobileUrl ?? banner.imageUrl
  const desktopImageUrl = banner.imageDesktopUrl ?? banner.imageUrl

  const hasAnyImage = !!(imageUrl || mobileImageUrl || desktopImageUrl)

  const inner = hasAnyImage ? (
    <div className="w-full">
      {/* Mobile image: visible on sm, hidden on md+ */}
      {(mobileImageUrl || imageUrl) && (
        <Image
          src={(mobileImageUrl || imageUrl)!}
          alt={banner.altText ?? banner.title ?? banner.sponsorName ?? 'Banner patrocinado'}
          width={variant === 'sidebar' ? 160 : 400}
          height={variant === 'sidebar' ? 600 : h}
          className="w-full object-contain md:hidden"
          unoptimized
        />
      )}
      {/* Desktop image: hidden on sm, visible on md+ */}
      {(desktopImageUrl || imageUrl) && (
        <Image
          src={(desktopImageUrl || imageUrl)!}
          alt={banner.altText ?? banner.title ?? banner.sponsorName ?? 'Banner patrocinado'}
          width={variant === 'sidebar' ? 160 : 800}
          height={variant === 'sidebar' ? 600 : h}
          className="w-full object-contain hidden md:block"
          unoptimized
        />
      )}
    </div>
  ) : (
    // Fallback: styled block with gradient background using banner fields
    <div
      className="w-full flex items-center justify-between px-3 py-2 rounded-md"
      style={{
        minHeight: h,
        background: `linear-gradient(135deg, ${banner.color ?? '#1E2329'}33, ${banner.color ?? '#1E2329'}11)`,
        border: `1.5px solid ${banner.color ?? '#2a2d35'}55`,
      }}
    >
      <div className="flex-1 min-w-0">
        <div className="text-xs font-bold text-white truncate">
          {banner.title ?? 'Patrocinador'}
        </div>
        <div className="text-[10px] text-white/60 truncate mt-0.5">
          {banner.company ?? banner.sponsorName ?? ''}
        </div>
      </div>
      {banner.ctaText && (
        <div
          className="flex-shrink-0 ml-2 rounded-lg px-3 py-1 text-[10px] font-bold text-white"
          style={{ background: banner.ctaColor ?? banner.color ?? '#00B1EA' }}
        >
          {banner.ctaText}
        </div>
      )}
    </div>
  )

  const content = (
    <div
      className="transition-opacity duration-300 ease-in-out"
      style={{ opacity: fading ? 0 : 1 }}
    >
      {inner}
    </div>
  )

  if (banner.linkUrl) {
    return (
      <a
        href={banner.linkUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        aria-label={`Visitar ${banner.sponsorName ?? banner.company ?? 'patrocinador'}`}
        data-testid={`banner-slot-${position}`}
      >
        {content}
        {banners.length > 1 && <BannerDots total={banners.length} active={activeIndex} />}
      </a>
    )
  }

  return (
    <div className={className} data-testid={`banner-slot-${position}`}>
      {content}
      {banners.length > 1 && <BannerDots total={banners.length} active={activeIndex} />}
    </div>
  )
}

/** Small dot indicators showing which banner is active */
function BannerDots({ total, active }: { total: number; active: number }) {
  return (
    <div className="flex justify-center gap-1 mt-1" data-testid="banner-dots">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className="inline-block rounded-full transition-all duration-300"
          style={{
            width: i === active ? 12 : 6,
            height: 6,
            background: i === active ? '#F0B90B' : '#929AA5',
          }}
        />
      ))}
    </div>
  )
}
