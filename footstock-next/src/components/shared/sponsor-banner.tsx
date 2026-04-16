'use client'

// ============================================================================
// FootStock — SponsorBanner
// Exibe banners publicitarios ativos para a posicao solicitada com auto-rotacao.
// Busca GET /api/v1/banners?position={position} (cache Redis 5min).
// Suporta: array de banners, rotacao a cada 30s com fade, imagens responsivas
// (desktop/mobile/vertical), e fallback estilizado com cores FootStock.
// ============================================================================

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

interface Props {
  position: BannerPosition
  className?: string
}

export function SponsorBanner({ position, className = '' }: Props) {
  const [banners, setBanners] = useState<BannerData[]>([])
  const [loaded, setLoaded] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [fading, setFading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchBanners() {
      try {
        const res = await fetch(`/api/v1/banners?position=${position}`)
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
    }, 300)
  }, [banners.length])

  useEffect(() => {
    if (banners.length <= 1) return
    timerRef.current = setInterval(rotate, ROTATION_INTERVAL_MS)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [banners.length, rotate])

  useEffect(() => {
    setActiveIndex(0)
  }, [banners.length])

  if (!loaded) return null

  // No banners from API — render a default FootStock house banner
  if (banners.length === 0) {
    return <DefaultFootStockBanner position={position} className={className} />
  }

  const banner = banners[activeIndex % banners.length]
  if (!banner) return null

  const dims = BANNER_DIMENSIONS[position]
  const w = banner.width ?? dims.width
  const h = banner.height ?? dims.height

  const desktopImg = banner.imageDesktopUrl ?? banner.imageUrl
  const mobileImg = banner.imageMobileUrl ?? banner.imageUrl
  const hasImage = !!(desktopImg || mobileImg)

  const inner = hasImage ? (
    <div className="w-full">
      {mobileImg && (
        <Image
          src={mobileImg}
          alt={banner.altText ?? banner.title ?? banner.sponsorName ?? 'Banner patrocinado'}
          width={w}
          height={h}
          className="w-full object-contain md:hidden rounded-lg"
          unoptimized
        />
      )}
      {desktopImg && (
        <Image
          src={desktopImg}
          alt={banner.altText ?? banner.title ?? banner.sponsorName ?? 'Banner patrocinado'}
          width={Math.max(w, 800)}
          height={h}
          className="w-full object-contain hidden md:block rounded-lg"
          unoptimized
        />
      )}
    </div>
  ) : (
    <BannerFallback banner={banner} width={w} height={h} />
  )

  const content = (
    <div
      className="transition-opacity duration-300 ease-in-out"
      style={{ opacity: fading ? 0 : 1 }}
    >
      {inner}
    </div>
  )

  const wrapperClass = `w-full ${className}`

  if (banner.linkUrl) {
    return (
      <a
        href={banner.linkUrl}
        target="_blank"
        rel="noopener noreferrer sponsored"
        className={wrapperClass}
        aria-label={`Visitar ${banner.sponsorName ?? banner.company ?? 'patrocinador'}`}
        data-testid={`banner-slot-${position}`}
      >
        {content}
        {banners.length > 1 && <BannerDots total={banners.length} active={activeIndex} />}
      </a>
    )
  }

  return (
    <div className={wrapperClass} data-testid={`banner-slot-${position}`}>
      {content}
      {banners.length > 1 && <BannerDots total={banners.length} active={activeIndex} />}
    </div>
  )
}

/** Fallback estilizado quando o banner tem dados mas nao tem imagem */
function BannerFallback({ banner, width, height }: { banner: BannerData; width: number; height: number }) {
  const color = banner.color ?? '#F0B90B'

  return (
    <div
      className="w-full flex items-center justify-between px-4 py-3 rounded-lg overflow-hidden relative"
      style={{
        minHeight: height,
        background: `linear-gradient(135deg, #0B0E11 0%, #1E2329 50%, ${color}15 100%)`,
        border: `1px solid ${color}30`,
      }}
    >
      {/* Decorative glow */}
      <div
        className="absolute -right-4 -top-4 w-24 h-24 rounded-full opacity-20 blur-2xl"
        style={{ background: color }}
      />

      <div className="flex-1 min-w-0 z-10">
        <div className="text-sm font-bold truncate" style={{ color }}>
          {banner.title ?? 'Patrocinador'}
        </div>
        {(banner.company || banner.sponsorName) && (
          <div className="text-xs text-[#929AA5] truncate mt-0.5">
            {banner.company ?? banner.sponsorName}
          </div>
        )}
      </div>

      {banner.ctaText && (
        <div
          className="flex-shrink-0 ml-3 rounded-lg px-4 py-1.5 text-xs font-bold z-10"
          style={{
            background: banner.ctaColor ?? color,
            color: '#0B0E11',
          }}
        >
          {banner.ctaText}
        </div>
      )}
    </div>
  )
}

/** Banner padrao FootStock quando nao ha nenhum banner ativo na posicao */
function DefaultFootStockBanner({ position, className }: { position: BannerPosition; className: string }) {
  const dims = BANNER_DIMENSIONS[position]

  return (
    <div
      className={`w-full ${className}`}
      data-testid={`banner-slot-${position}`}
    >
      <div
        className="w-full flex items-center justify-center rounded-lg overflow-hidden relative"
        style={{
          minHeight: dims.height,
          background: 'linear-gradient(135deg, #0B0E11 0%, #1a1510 40%, #1E2329 100%)',
          border: '1px solid rgba(240, 185, 11, 0.12)',
        }}
      >
        {/* Decorative gradient orb */}
        <div className="absolute -left-8 -bottom-8 w-32 h-32 rounded-full opacity-15 blur-3xl bg-[#F0B90B]" />
        <div className="absolute right-4 top-0 w-16 h-16 rounded-full opacity-10 blur-2xl bg-[#2EBD85]" />

        <div className="flex items-center gap-3 z-10">
          {/* FS logo mark */}
          <div className="flex items-center justify-center w-8 h-8 rounded-md bg-gradient-to-br from-[#F0B90B] to-[#d4971e]">
            <span className="text-xs font-black text-[#0B0E11] leading-none">FS</span>
          </div>
          <div>
            <span className="text-sm font-bold text-[#F0B90B] tracking-wide">FootStock</span>
            <span className="text-[10px] text-[#929AA5] block mt-px">Simule. Negocie. Domine o mercado.</span>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Indicadores de ponto mostrando qual banner esta ativo */
function BannerDots({ total, active }: { total: number; active: number }) {
  return (
    <div className="flex justify-center gap-1.5 mt-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className="inline-block rounded-full transition-all duration-300"
          style={{
            width: i === active ? 14 : 6,
            height: 6,
            background: i === active ? '#F0B90B' : 'rgba(146, 154, 165, 0.4)',
          }}
        />
      ))}
    </div>
  )
}
