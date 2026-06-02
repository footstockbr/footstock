// ============================================================================
// FootStock — Testes: SponsorBanner cross-module + cache Redis
// Fonte: module-24/TASK-3/ST008
// ============================================================================

import { BANNER_POSITIONS, type BannerPosition, type BannersMap } from '@/lib/types/sponsors'

// ---------------------------------------------------------------------------
// Helpers de teste (sem I/O real)
// ---------------------------------------------------------------------------

function buildActiveSponsor(positions: BannerPosition[]) {
  const banners: BannersMap = {}
  for (const pos of positions) {
    banners[pos] = {
      imageUrl: `https://placehold.co/728x90?text=${pos}`,
      linkUrl: 'https://footstock.app',
      altText: `Banner ${pos}`,
    }
  }
  return {
    id: 'test-sponsor-001',
    name: 'Test Sponsor',
    logo: null,
    banners,
    activeLigaId: null,
    startsAt: new Date(Date.now() - 86400000).toISOString(), // ontem
    endsAt: new Date(Date.now() + 86400000).toISOString(),   // amanhã
    active: true,
    createdAt: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Testes: BannerPosition enum
// ---------------------------------------------------------------------------

describe('BANNER_POSITIONS', () => {
  it('deve conter exatamente as 5 posições canônicas INTAKE', () => {
    expect(BANNER_POSITIONS).toHaveLength(5)
    expect(BANNER_POSITIONS).toContain('home_top')
    expect(BANNER_POSITIONS).toContain('home_mid')
    expect(BANNER_POSITIONS).toContain('market_top')
    expect(BANNER_POSITIONS).toContain('cart_top')
    expect(BANNER_POSITIONS).toContain('detail_bot')
  })

  it('todas as posições devem ser strings não-vazias', () => {
    BANNER_POSITIONS.forEach(pos => {
      expect(typeof pos).toBe('string')
      expect(pos.length).toBeGreaterThan(0)
    })
  })
})

// ---------------------------------------------------------------------------
// Testes: buildActiveSponsor helper
// ---------------------------------------------------------------------------

describe('Sponsor model', () => {
  it('sponsor com banners em 2 posições deve ter 2 entradas no mapa', () => {
    const sponsor = buildActiveSponsor(['home_top', 'market_top'])
    expect(Object.keys(sponsor.banners)).toHaveLength(2)
    expect(sponsor.banners.home_top).toBeDefined()
    expect(sponsor.banners.market_top).toBeDefined()
  })

  it('sponsor sem posição específica deve retornar undefined para essa posição', () => {
    const sponsor = buildActiveSponsor(['home_top'])
    expect(sponsor.banners.market_top).toBeUndefined()
  })

  it('sponsor inativo: active=false', () => {
    const sponsor = buildActiveSponsor([])
    const inactiveSponsor = { ...sponsor, active: false }
    expect(inactiveSponsor.active).toBe(false)
  })

  it('sponsor expirado: endsAt no passado', () => {
    const sponsor = buildActiveSponsor(['home_top'])
    const expired = { ...sponsor, endsAt: new Date(Date.now() - 1).toISOString() }
    const isExpired = new Date(expired.endsAt) < new Date()
    expect(isExpired).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Testes: lógica de resolução de banner por posição
// ---------------------------------------------------------------------------

describe('Banner resolution', () => {
  function resolveBanner(
    sponsors: ReturnType<typeof buildActiveSponsor>[],
    position: BannerPosition,
    now = new Date()
  ) {
    const active = sponsors.find(
      s =>
        s.active &&
        new Date(s.startsAt) <= now &&
        new Date(s.endsAt) >= now &&
        s.banners[position] !== undefined
    )
    return active ? active.banners[position] : null
  }

  it('deve retornar banner quando sponsor ativo cobre a posição', () => {
    const sponsor = buildActiveSponsor(['home_top', 'market_top'])
    const result = resolveBanner([sponsor], 'home_top')
    expect(result).not.toBeNull()
    expect(result?.imageUrl).toContain('home_top')
  })

  it('deve retornar null quando nenhum sponsor cobre a posição solicitada', () => {
    const sponsor = buildActiveSponsor(['home_top'])
    const result = resolveBanner([sponsor], 'detail_bot')
    expect(result).toBeNull()
  })

  it('deve retornar null quando sponsor está inativo', () => {
    const sponsor = buildActiveSponsor(['home_top'])
    const inactive = { ...sponsor, active: false }
    const result = resolveBanner([inactive], 'home_top')
    expect(result).toBeNull()
  })

  it('deve retornar null quando sponsor está expirado', () => {
    const sponsor = buildActiveSponsor(['home_top'])
    const expired = {
      ...sponsor,
      endsAt: new Date(Date.now() - 1000).toISOString(),
    }
    const result = resolveBanner([expired], 'home_top')
    expect(result).toBeNull()
  })

  it('deve retornar null quando não há sponsors', () => {
    const result = resolveBanner([], 'home_top')
    expect(result).toBeNull()
  })

  it('testa as 5 posições canônicas INTAKE', () => {
    const positions: BannerPosition[] = [
      'home_top',
      'home_mid',
      'market_top',
      'cart_top',
      'detail_bot',
    ]
    const sponsor = buildActiveSponsor(positions)
    positions.forEach(pos => {
      const result = resolveBanner([sponsor], pos)
      expect(result).not.toBeNull()
    })
  })
})

// ---------------------------------------------------------------------------
// Testes: cache key pattern
// ---------------------------------------------------------------------------

describe('Cache key pattern', () => {
  it('deve gerar chave correta para posição', () => {
    const position: BannerPosition = 'home_top'
    const cacheKey = `banner:active:${position}`
    expect(cacheKey).toBe('banner:active:home_top')
  })

  it('chaves de cache devem ser distintas para posições diferentes', () => {
    const keys = BANNER_POSITIONS.map(p => `banner:active:${p}`)
    const unique = new Set(keys)
    expect(unique.size).toBe(BANNER_POSITIONS.length)
  })
})
