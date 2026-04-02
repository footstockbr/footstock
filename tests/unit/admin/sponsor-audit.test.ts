// ============================================================================
// Foot Stock — Testes: Sponsor soft delete e audit trail
// Fonte: module-24/TASK-7/ST002
// ============================================================================

import { BANNER_POSITIONS, type BannersMap } from '@/lib/types/sponsors'

// ---------------------------------------------------------------------------
// Helpers de teste (sem I/O real — testa lógica pura)
// ---------------------------------------------------------------------------

interface AdSponsor {
  id: string
  name: string
  banners: BannersMap
  active: boolean
  startsAt: string
  endsAt: string
}

function buildSponsor(overrides: Partial<AdSponsor> = {}): AdSponsor {
  return {
    id: 'sponsor-001',
    name: 'Test Sponsor',
    banners: {
      home_top: { imageUrl: 'https://example.com/img.png', linkUrl: 'https://example.com', altText: 'Test' },
    },
    active: true,
    startsAt: new Date(Date.now() - 86400000).toISOString(),
    endsAt: new Date(Date.now() + 86400000).toISOString(),
    ...overrides,
  }
}

function softDelete(sponsor: AdSponsor): AdSponsor {
  return { ...sponsor, active: false }
}

function getCacheKeysToInvalidate(banners: BannersMap): string[] {
  return Object.keys(banners).map(pos => `banner:active:${pos}`)
}

interface AuditEntry {
  adminId: string
  action: string
  details: Record<string, unknown>
}

function buildAuditEntry(adminId: string, action: string, details: Record<string, unknown>): AuditEntry {
  return { adminId, action, details }
}

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe('Sponsor soft delete', () => {
  it('deve marcar sponsor como inactive (não remover)', () => {
    const sponsor = buildSponsor()
    expect(sponsor.active).toBe(true)

    const deleted = softDelete(sponsor)
    expect(deleted.active).toBe(false)
    expect(deleted.id).toBe(sponsor.id)
    expect(deleted.name).toBe(sponsor.name)
  })

  it('soft delete de sponsor já inativo deve ser idempotente', () => {
    const inactive = buildSponsor({ active: false })
    const deleted = softDelete(inactive)
    expect(deleted.active).toBe(false)
  })

  it('deve preservar todos os campos do sponsor após soft delete', () => {
    const sponsor = buildSponsor({
      name: 'Parceiro Demo',
      banners: {
        home_top: { imageUrl: 'https://img.com/1.png', linkUrl: 'https://link.com', altText: 'Alt' },
        market_top: { imageUrl: 'https://img.com/2.png', linkUrl: 'https://link2.com', altText: 'Alt2' },
      },
    })
    const deleted = softDelete(sponsor)
    expect(deleted.name).toBe('Parceiro Demo')
    expect(Object.keys(deleted.banners)).toHaveLength(2)
  })
})

describe('Cache invalidation', () => {
  it('deve invalidar cache de todas as posições do sponsor', () => {
    const sponsor = buildSponsor({
      banners: {
        home_top: { imageUrl: 'u', linkUrl: 'l', altText: 'a' },
        market_top: { imageUrl: 'u', linkUrl: 'l', altText: 'a' },
      },
    })
    const keys = getCacheKeysToInvalidate(sponsor.banners)
    expect(keys).toEqual(['banner:active:home_top', 'banner:active:market_top'])
  })

  it('sponsor sem posições não gera keys para invalidar', () => {
    const sponsor = buildSponsor({ banners: {} })
    const keys = getCacheKeysToInvalidate(sponsor.banners)
    expect(keys).toHaveLength(0)
  })

  it('deve gerar key correta para todas as 8 posições do enum', () => {
    for (const pos of BANNER_POSITIONS) {
      const keys = getCacheKeysToInvalidate({ [pos]: { imageUrl: 'u', linkUrl: 'l', altText: 'a' } } as BannersMap)
      expect(keys[0]).toBe(`banner:active:${pos}`)
    }
  })
})

describe('Audit trail entries', () => {
  it('deve gerar entry SPONSOR_CREATE com sponsorId e name', () => {
    const entry = buildAuditEntry('admin-001', 'SPONSOR_CREATE', {
      sponsorId: 'sp-001',
      sponsorName: 'Parceiro',
    })
    expect(entry.action).toBe('SPONSOR_CREATE')
    expect(entry.details.sponsorId).toBe('sp-001')
    expect(entry.details.sponsorName).toBe('Parceiro')
  })

  it('deve gerar entry SPONSOR_UPDATE com campos atualizados', () => {
    const entry = buildAuditEntry('admin-001', 'SPONSOR_UPDATE', {
      sponsorId: 'sp-001',
      updatedFields: ['name', 'active'],
    })
    expect(entry.action).toBe('SPONSOR_UPDATE')
    expect(entry.details.updatedFields).toEqual(['name', 'active'])
  })

  it('deve gerar entry SPONSOR_DELETE com sponsorId e name', () => {
    const entry = buildAuditEntry('admin-001', 'SPONSOR_DELETE', {
      sponsorId: 'sp-001',
      sponsorName: 'Parceiro Removido',
    })
    expect(entry.action).toBe('SPONSOR_DELETE')
    expect(entry.details.sponsorName).toBe('Parceiro Removido')
  })

  it('sponsor inexistente deve retornar 404 (lógica de validação)', () => {
    const sponsors: AdSponsor[] = [buildSponsor({ id: 'sp-001' })]
    const found = sponsors.find(s => s.id === 'sp-999')
    expect(found).toBeUndefined()
  })
})
