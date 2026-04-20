'use client'

import { useState, useEffect } from 'react'
import { BANNER_POSITIONS, type BannerPosition } from '@/lib/types/sponsors'

const BANNER_POSITION_LABELS: Record<BannerPosition, string> = {
  home_top: 'Topo da Home',
  home_mid: 'Meio da Home',
  market_top: 'Topo do Mercado',
  cart_top: 'Topo do Carrinho',
  detail_bot: 'Rodapé do Detalhe',
}

interface SponsorBanner {
  id: string
  title: string
  company: string
  position: string
  isActive: boolean
  clicks: number
  impressions: number
  color: string
  ctaText: string
  ctaColor: string
  linkUrl: string | null
  startDate: string | null
  endDate: string | null
  imageDesktopUrl: string | null
  imageMobileUrl: string | null
  imageVerticalUrl: string | null
}

interface PrizeLine {
  position: number
  label: string
  description: string
}

interface SponsoredLeague {
  id: string
  name: string
  company: string
  prize: string
  prizes: PrizeLine[]
  sponsorUrl: string | null
  participants: number
  maxParticipants: number
  minPlan: string
  status: string
  borderColor: string
  startDate: string
  endDate: string
}

type Tab = 'banners' | 'ligas'

const EMPTY_BANNER: Omit<SponsorBanner, 'id' | 'clicks' | 'impressions'> = {
  title: '',
  company: '',
  position: 'home_top',
  isActive: true,
  color: '#00B1EA',
  ctaText: 'Saiba mais',
  ctaColor: '#00B1EA',
  linkUrl: '',
  startDate: null,
  endDate: null,
  imageDesktopUrl: null,
  imageMobileUrl: null,
  imageVerticalUrl: null,
}

const DEFAULT_PRIZES: PrizeLine[] = [
  { position: 1, label: '1o Lugar', description: '' },
  { position: 2, label: '2o Lugar', description: '' },
  { position: 3, label: '3o Lugar', description: '' },
]

interface LeagueFormData {
  name: string
  company: string
  sponsorUrl: string
  prizes: PrizeLine[]
  maxParticipants: number
  minPlan: string
  status: string
  borderColor: string
  startDate: string
  endDate: string
}

const EMPTY_LEAGUE: LeagueFormData = {
  name: '',
  company: '',
  sponsorUrl: '',
  prizes: [...DEFAULT_PRIZES],
  maxParticipants: 50,
  minPlan: 'JOGADOR',
  status: 'AGENDADA',
  borderColor: '#f59e0b',
  startDate: new Date().toISOString().split('T')[0],
  endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
}

const POSITION_LABELS: Record<number, string> = {
  1: '1o Lugar',
  2: '2o Lugar',
  3: '3o Lugar',
  4: '4o Lugar',
  5: '5o Lugar',
  6: '6o Lugar',
  7: '7o Lugar',
  8: '8o Lugar',
  9: '9o Lugar',
  10: '10o Lugar',
}

export default function PatrocinadoresPage() {
  const [tab, setTab] = useState<Tab>('banners')
  const [banners, setBanners] = useState<SponsorBanner[]>([])
  const [leagues, setLeagues] = useState<SponsoredLeague[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Banner modal
  const [bannerModal, setBannerModal] = useState(false)
  const [editingBanner, setEditingBanner] = useState<SponsorBanner | null>(null)
  const [bannerForm, setBannerForm] = useState(EMPTY_BANNER)
  const [savingBanner, setSavingBanner] = useState(false)

  // League modal
  const [leagueModal, setLeagueModal] = useState(false)
  const [editingLeague, setEditingLeague] = useState<SponsoredLeague | null>(null)
  const [leagueForm, setLeagueForm] = useState<LeagueFormData>(EMPTY_LEAGUE)
  const [savingLeague, setSavingLeague] = useState(false)

  useEffect(() => {
    fetchAll()
  }, [])

  const fetchAll = async () => {
    try {
      setLoading(true)
      const [bRes, lRes] = await Promise.all([
        fetch('/api/v1/admin/sponsors/banners', { credentials: 'include' }),
        fetch('/api/v1/admin/sponsors/leagues', { credentials: 'include' }),
      ])
      if (!bRes.ok || !lRes.ok) throw new Error('Erro ao carregar dados')
      const bData = await bRes.json()
      const lData = await lRes.json()
      setBanners(bData.data || [])
      setLeagues((lData.data || []).map((l: Record<string, unknown>) => ({
        ...l,
        prizes: Array.isArray(l.prizes) ? l.prizes : [],
        sponsorUrl: l.sponsorUrl ?? l.sponsor_url ?? null,
      })))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }

  // --- Banner actions ---
  const openNewBanner = () => {
    setEditingBanner(null)
    setBannerForm(EMPTY_BANNER)
    setBannerModal(true)
  }

  const openEditBanner = (b: SponsorBanner) => {
    setEditingBanner(b)
    setBannerForm({
      title: b.title,
      company: b.company,
      position: b.position,
      isActive: b.isActive,
      color: b.color,
      ctaText: b.ctaText,
      ctaColor: b.ctaColor,
      linkUrl: b.linkUrl ?? '',
      startDate: b.startDate ? b.startDate.split('T')[0] : null,
      endDate: b.endDate ? b.endDate.split('T')[0] : null,
      imageDesktopUrl: b.imageDesktopUrl,
      imageMobileUrl: b.imageMobileUrl,
      imageVerticalUrl: b.imageVerticalUrl,
    })
    setBannerModal(true)
  }

  const saveBanner = async () => {
    setSavingBanner(true)
    try {
      const payload = {
        ...bannerForm,
        startDate: bannerForm.startDate ? new Date(bannerForm.startDate + 'T00:00:00Z').toISOString() : null,
        endDate: bannerForm.endDate ? new Date(bannerForm.endDate + 'T23:59:59Z').toISOString() : null,
        imageDesktopUrl: bannerForm.imageDesktopUrl || null,
        imageMobileUrl: bannerForm.imageMobileUrl || null,
        imageVerticalUrl: bannerForm.imageVerticalUrl || null,
      }

      if (editingBanner) {
        const res = await fetch(`/api/v1/admin/sponsors/banners/${editingBanner.id}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error('Erro ao salvar')
      } else {
        const res = await fetch('/api/v1/admin/sponsors/banners', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error('Erro ao criar')
      }
      setBannerModal(false)
      fetchAll()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setSavingBanner(false)
    }
  }

  const toggleBanner = async (id: string, isActive: boolean) => {
    try {
      const res = await fetch(`/api/v1/admin/sponsors/banners/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !isActive }),
      })
      if (!res.ok) throw new Error('Erro ao atualizar')
      fetchAll()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao atualizar')
    }
  }

  const deleteBanner = async (id: string) => {
    if (!confirm('Deletar este banner?')) return
    try {
      const res = await fetch(`/api/v1/admin/sponsors/banners/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Erro ao deletar')
      fetchAll()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao deletar')
    }
  }

  // --- League actions ---
  const openNewLeague = () => {
    setEditingLeague(null)
    setLeagueForm({ ...EMPTY_LEAGUE, prizes: [...DEFAULT_PRIZES] })
    setLeagueModal(true)
  }

  const openEditLeague = (l: SponsoredLeague) => {
    setEditingLeague(l)
    const prizes: PrizeLine[] = Array.isArray(l.prizes) && l.prizes.length > 0
      ? l.prizes
      : [{ position: 1, label: '1o Lugar', description: l.prize || '' }]
    // Garantir ao menos 3 linhas
    while (prizes.length < 3) {
      const pos = prizes.length + 1
      prizes.push({ position: pos, label: POSITION_LABELS[pos] || `${pos}o Lugar`, description: '' })
    }
    setLeagueForm({
      name: l.name,
      company: l.company,
      sponsorUrl: l.sponsorUrl ?? '',
      prizes,
      maxParticipants: l.maxParticipants,
      minPlan: l.minPlan,
      status: l.status,
      borderColor: l.borderColor,
      startDate: l.startDate.split('T')[0],
      endDate: l.endDate.split('T')[0],
    })
    setLeagueModal(true)
  }

  const addPrizeLine = () => {
    setLeagueForm((f) => {
      const nextPos = f.prizes.length + 1
      return {
        ...f,
        prizes: [
          ...f.prizes,
          { position: nextPos, label: POSITION_LABELS[nextPos] || `${nextPos}o Lugar`, description: '' },
        ],
      }
    })
  }

  const removePrizeLine = (index: number) => {
    setLeagueForm((f) => {
      if (f.prizes.length <= 1) return f
      const updated = f.prizes.filter((_, i) => i !== index).map((p, i) => ({
        ...p,
        position: i + 1,
        label: POSITION_LABELS[i + 1] || `${i + 1}o Lugar`,
      }))
      return { ...f, prizes: updated }
    })
  }

  const updatePrizeDescription = (index: number, description: string) => {
    setLeagueForm((f) => ({
      ...f,
      prizes: f.prizes.map((p, i) => i === index ? { ...p, description } : p),
    }))
  }

  const saveLeague = async () => {
    setSavingLeague(true)
    try {
      const payload = {
        ...leagueForm,
        sponsorUrl: leagueForm.sponsorUrl || null,
        // Resumo do prize para o campo legacy
        prize: leagueForm.prizes.filter(p => p.description).map(p => `${p.label}: ${p.description}`).join(' | ') || 'FS$0',
      }

      if (editingLeague) {
        const res = await fetch(`/api/v1/admin/sponsors/leagues/${editingLeague.id}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error('Erro ao salvar')
      } else {
        const res = await fetch('/api/v1/admin/sponsors/leagues', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error('Erro ao criar')
      }
      setLeagueModal(false)
      fetchAll()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setSavingLeague(false)
    }
  }

  const deleteLeague = async (id: string) => {
    if (!confirm('Deletar esta liga?')) return
    try {
      const res = await fetch(`/api/v1/admin/sponsors/leagues/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Erro ao deletar')
      fetchAll()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao deletar')
    }
  }

  const activeBanners = banners.filter((b) => b.isActive).length

  return (
    <div className="fade-in" style={{ padding: '20px', color: 'white' }} data-testid="page-admin-patrocinadores">
      <style>{`
        :root {
          --bg: #1E2329;
          --accent: #F0B90B;
          --accent2: #FFC107;
          --muted: #8f95a5;
          --red: #F6465D;
          --green: #2EBD85;
          --orange: #FF9500;
          --gold: #FFD700;
          --mono: 'Courier New', monospace;
          --border: #2a2d35;
        }
        .section-header { margin-bottom: 20px; }
        .section-title { font-size: 20px; font-weight: 600; margin-bottom: 4px; }
        .section-sub { font-size: 12px; color: var(--muted); }
        .sub-tabs {
          display: flex;
          gap: 0;
          margin-bottom: 20px;
          border-bottom: 1px solid var(--border);
        }
        .sub-tab {
          background: transparent;
          color: var(--muted);
          border: none;
          border-bottom: 2px solid transparent;
          padding: 12px 16px;
          cursor: pointer;
          font-size: 13px;
          transition: color 0.2s;
        }
        .sub-tab.active { color: var(--accent); border-bottom-color: var(--accent); }
        .btn {
          padding: 8px 12px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          border: 1px solid;
          transition: all 0.2s;
        }
        .btn-sm { padding: 6px 10px; font-size: 11px; }
        .btn-outline { background: transparent; border-color: currentColor; }
        .btn-outline:hover { opacity: 0.8; }
        .btn-solid { border: none; }
        .btn-solid:hover { opacity: 0.8; }
        .banner-card {
          background: #181A20;
          border: 1.5px solid var(--border);
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 12px;
        }
        .banner-preview {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px;
          border-radius: 6px;
          margin-bottom: 10px;
          gap: 8px;
        }
        .badge {
          background: rgba(255, 255, 255, 0.08);
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
          display: inline-block;
        }
        .kpi { background: #1E2329; border-radius: 6px; }
        .kpi-label { font-size: 9px; color: var(--muted); font-weight: 600; margin-bottom: 4px; }
        .liga-card {
          background: #181A20;
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 12px;
        }
        .liga-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }
        .liga-stats {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 12px;
          margin-bottom: 12px;
        }
        .liga-stat { background: #1E2329; border-radius: 6px; padding: 8px; text-align: center; }
        .liga-stat-l { font-size: 9px; color: var(--muted); font-weight: 600; }
        .liga-stat-v { font-size: 13px; font-weight: 800; margin-top: 4px; }
        .bar-track { background: #1E2329; border-radius: 4px; height: 6px; overflow: hidden; }
        .bar-fill { height: 100%; }

        /* Modal */
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 16px;
        }
        .modal-box {
          background: #181A20;
          border: 1px solid #2a2d35;
          border-radius: 12px;
          padding: 24px;
          width: 100%;
          max-width: 520px;
          max-height: 90vh;
          overflow-y: auto;
        }
        .modal-title {
          font-size: 16px;
          font-weight: 700;
          margin-bottom: 20px;
          color: #fff;
        }
        .form-group { margin-bottom: 14px; }
        .form-label { font-size: 11px; color: var(--muted); font-weight: 600; margin-bottom: 6px; display: block; }
        .form-input {
          width: 100%;
          background: #1E2329;
          border: 1px solid #2a2d35;
          border-radius: 6px;
          padding: 8px 10px;
          color: #fff;
          font-size: 13px;
          box-sizing: border-box;
        }
        .form-input:focus { outline: none; border-color: var(--accent); }
        .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .modal-footer { display: flex; gap: 8px; justify-content: flex-end; margin-top: 20px; }
        .prize-section { margin-bottom: 14px; }
        .prize-line {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
        }
        .prize-label {
          font-size: 11px;
          font-weight: 700;
          color: var(--accent);
          min-width: 62px;
          flex-shrink: 0;
        }
        .prize-remove {
          background: transparent;
          border: none;
          color: var(--red);
          cursor: pointer;
          font-size: 14px;
          padding: 4px;
          opacity: 0.6;
          transition: opacity 0.2s;
          flex-shrink: 0;
        }
        .prize-remove:hover { opacity: 1; }
        .section-divider {
          font-size: 11px;
          color: var(--muted);
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin: 16px 0 10px;
          padding-bottom: 6px;
          border-bottom: 1px solid var(--border);
        }
      `}</style>

      <div className="section-header" data-testid="admin-patrocinadores-header">
        <div className="section-title">Patrocinadores</div>
        <div className="section-sub">Banners de publicidade e ligas patrocinadas</div>
      </div>

      <div className="sub-tabs">
        <button
          className={`sub-tab ${tab === 'banners' ? 'active' : ''}`}
          onClick={() => setTab('banners')}
          data-testid="tab-banners"
        >
          Banners
        </button>
        <button
          className={`sub-tab ${tab === 'ligas' ? 'active' : ''}`}
          onClick={() => setTab('ligas')}
          data-testid="tab-ligas"
        >
          Ligas Patrocinadas
        </button>
      </div>

      {loading && <div style={{ color: '#8f95a5', padding: '20px' }} data-testid="loading-indicator">Carregando...</div>}
      {error && <div style={{ color: '#F6465D', padding: '20px' }} data-testid="error-indicator">Erro: {error}</div>}

      {/* ── BANNERS TAB ── */}
      {!loading && tab === 'banners' && (
        <div data-testid="tab-content-banners">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
              {banners.length} banners · {activeBanners} ativos
            </div>
            <button
              className="btn btn-sm btn-solid"
              style={{ background: 'var(--accent)', color: 'var(--bg)', borderColor: 'transparent' }}
              onClick={openNewBanner}
              data-testid="btn-novo-banner"
            >
              + Novo Banner
            </button>
          </div>

          {banners.map((banner) => (
            <div key={banner.id} className="banner-card" style={{ borderColor: banner.color + '55' }} data-testid={`banner-card-${banner.id}`}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                    <span style={{ fontSize: '13px', fontWeight: '800', color: '#fff' }}>{banner.title}</span>
                    <span className="badge" style={{ color: banner.isActive ? 'var(--green)' : 'var(--muted)' }}>
                      {banner.isActive ? 'ATIVO' : 'INATIVO'}
                    </span>
                  </div>
                  <div style={{ fontSize: '9px', color: 'var(--muted)' }}>
                    {banner.company} · {banner.position}
                  </div>
                  <div style={{ fontSize: '9px', color: 'var(--muted)', marginTop: '2px' }} data-testid={`banner-dates-${banner.id}`}>
                    {banner.startDate ? banner.startDate.split('T')[0] : 'Sem inicio'}{' '}
                    {'→'}{' '}
                    {banner.endDate ? banner.endDate.split('T')[0] : <span style={{ color: 'var(--accent)' }}>(Indefinido)</span>}
                  </div>
                </div>
              </div>

              <div
                className="banner-preview"
                style={{
                  background: `linear-gradient(135deg,${banner.color}22,${banner.color}11)`,
                  border: `1.5px solid ${banner.color}55`,
                }}
              >
                <div>
                  <div style={{ fontSize: '11px', fontWeight: '800', color: '#fff' }}>{banner.title}</div>
                  <div style={{ fontSize: '9px', color: 'rgba(255,255,255,.6)', marginTop: '2px' }}>{banner.company}</div>
                </div>
                <div style={{
                  background: banner.ctaColor,
                  borderRadius: '8px',
                  padding: '5px 12px',
                  fontSize: '9px',
                  fontWeight: '800',
                  color: '#fff',
                  flexShrink: 0,
                }}>
                  {banner.ctaText}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '10px' }}>
                <div className="kpi" style={{ padding: '7px', textAlign: 'center' }}>
                  <div className="kpi-label">CLIQUES</div>
                  <div style={{ fontSize: '14px', fontWeight: '800', color: 'var(--accent)', fontFamily: 'var(--mono)' }}>
                    {banner.clicks.toLocaleString('pt-BR')}
                  </div>
                </div>
                <div className="kpi" style={{ padding: '7px', textAlign: 'center' }}>
                  <div className="kpi-label">IMPRESSOES</div>
                  <div style={{ fontSize: '14px', fontWeight: '800', color: '#fff', fontFamily: 'var(--mono)' }}>
                    {banner.impressions.toLocaleString('pt-BR')}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '5px' }}>
                <button
                  className="btn btn-sm btn-outline"
                  style={{ background: 'transparent', color: 'var(--accent)', borderColor: 'var(--accent)' }}
                  onClick={() => openEditBanner(banner)}
                  data-testid={`btn-editar-banner-${banner.id}`}
                >
                  Editar
                </button>
                <button
                  className="btn btn-sm btn-outline"
                  style={{
                    background: 'transparent',
                    color: banner.isActive ? 'var(--orange)' : 'var(--green)',
                    borderColor: banner.isActive ? 'var(--orange)' : 'var(--green)',
                  }}
                  onClick={() => toggleBanner(banner.id, banner.isActive)}
                  data-testid={`btn-toggle-banner-${banner.id}`}
                >
                  {banner.isActive ? 'Desativar' : 'Ativar'}
                </button>
                <button
                  className="btn btn-sm btn-outline"
                  style={{ background: 'transparent', color: 'var(--red)', borderColor: 'var(--red)' }}
                  onClick={() => deleteBanner(banner.id)}
                  data-testid={`btn-deletar-banner-${banner.id}`}
                >
                  Deletar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── LIGAS TAB ── */}
      {!loading && tab === 'ligas' && (
        <div data-testid="tab-content-ligas">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{leagues.length} ligas</div>
            <button
              className="btn btn-sm btn-solid"
              style={{ background: 'var(--accent)', color: 'var(--bg)', borderColor: 'transparent' }}
              onClick={openNewLeague}
              data-testid="btn-nova-liga"
            >
              + Nova Liga
            </button>
          </div>

          {leagues.map((league) => {
            const prizeSummary = Array.isArray(league.prizes) && league.prizes.length > 0
              ? league.prizes.filter((p: PrizeLine) => p.description).map((p: PrizeLine) => p.description).join(', ')
              : league.prize
            return (
              <div key={league.id} className="liga-card" style={{ borderLeft: `3px solid ${league.borderColor}` }} data-testid={`liga-card-${league.id}`}>
                <div className="liga-header">
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: '800', color: '#fff', marginBottom: '2px' }}>{league.name}</div>
                    <div style={{ fontSize: '9px', color: 'var(--muted)' }}>
                      {league.company}
                      {league.sponsorUrl && (
                        <> · <a href={league.sponsorUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }} data-testid={`liga-sponsor-link-${league.id}`}>site</a></>
                      )}
                    </div>
                  </div>
                  <span
                    className="badge"
                    style={{
                      color:
                        league.status === 'ATIVA' ? 'var(--green)'
                        : league.status === 'ENCERRADA' ? 'var(--muted)'
                        : 'var(--accent2)',
                    }}
                    data-testid={`liga-status-${league.id}`}
                  >
                    {league.status}
                  </span>
                </div>

                <div className="liga-stats">
                  <div className="liga-stat">
                    <div className="liga-stat-l">PREMIO</div>
                    <div className="liga-stat-v" style={{ color: 'var(--gold)', fontSize: '11px' }}>
                      {prizeSummary || 'Sem premio'}
                    </div>
                  </div>
                  <div className="liga-stat">
                    <div className="liga-stat-l">INSCRITOS</div>
                    <div className="liga-stat-v">{league.participants}/{league.maxParticipants}</div>
                  </div>
                  <div className="liga-stat">
                    <div className="liga-stat-l">PLANO MIN.</div>
                    <div
                      className="liga-stat-v"
                      style={{
                        color:
                          league.minPlan === 'LENDA' ? 'var(--gold)'
                          : league.minPlan === 'CRAQUE' ? 'var(--accent)'
                          : 'var(--muted)',
                      }}
                    >
                      {league.minPlan.charAt(0) + league.minPlan.slice(1).toLowerCase()}
                    </div>
                  </div>
                </div>

                {/* Prizes detail */}
                {Array.isArray(league.prizes) && league.prizes.length > 0 && league.prizes.some((p: PrizeLine) => p.description) && (
                  <div style={{ marginBottom: '10px', padding: '8px', background: '#1E2329', borderRadius: '6px' }} data-testid={`liga-prizes-${league.id}`}>
                    <div style={{ fontSize: '9px', color: 'var(--muted)', fontWeight: '600', marginBottom: '6px' }}>PREMIACAO</div>
                    {league.prizes.filter((p: PrizeLine) => p.description).map((p: PrizeLine) => (
                      <div key={p.position} style={{ display: 'flex', gap: '6px', marginBottom: '3px', fontSize: '11px' }}>
                        <span style={{ color: 'var(--accent)', fontWeight: '700', minWidth: '55px' }}>{p.label}</span>
                        <span style={{ color: '#fff' }}>{p.description}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="bar-track" style={{ marginBottom: '10px' }}>
                  <div
                    className="bar-fill"
                    style={{
                      width: `${league.maxParticipants > 0 ? Math.min(100, Math.round((league.participants / league.maxParticipants) * 100)) : 0}%`,
                      background: league.borderColor,
                    }}
                  />
                </div>

                <div style={{ fontSize: '9px', color: 'var(--muted)', marginBottom: '8px' }}>
                  {league.startDate.split('T')[0]} {'→'} {league.endDate.split('T')[0]}
                </div>

                <div style={{ display: 'flex', gap: '5px' }}>
                  <button
                    className="btn btn-sm btn-outline"
                    style={{ background: 'transparent', color: 'var(--accent)', borderColor: 'var(--accent)' }}
                    onClick={() => openEditLeague(league)}
                    data-testid={`btn-editar-liga-${league.id}`}
                  >
                    Editar
                  </button>
                  <button
                    className="btn btn-sm btn-outline"
                    style={{ background: 'transparent', color: 'var(--red)', borderColor: 'var(--red)' }}
                    onClick={() => deleteLeague(league.id)}
                    data-testid={`btn-deletar-liga-${league.id}`}
                  >
                    Deletar
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── BANNER MODAL ── */}
      {bannerModal && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setBannerModal(false)}
          data-testid="modal-banner-overlay"
        >
          <div className="modal-box" data-testid="modal-banner">
            <div className="modal-title" data-testid="modal-banner-title">
              {editingBanner ? 'Editar Banner' : 'Novo Banner'}
            </div>

            <div className="form-group">
              <label className="form-label">Titulo</label>
              <input
                className="form-input"
                value={bannerForm.title}
                onChange={(e) => setBannerForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Ex: Mercado Pago — Pague em dia"
                data-testid="modal-banner-title-input"
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Empresa</label>
                <input
                  className="form-input"
                  value={bannerForm.company}
                  onChange={(e) => setBannerForm((f) => ({ ...f, company: e.target.value }))}
                  placeholder="Ex: Mercado Pago"
                  data-testid="modal-banner-company-input"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Posição</label>
                <select
                  className="form-input"
                  value={bannerForm.position}
                  onChange={(e) => setBannerForm((f) => ({ ...f, position: e.target.value as BannerPosition }))}
                  data-testid="modal-banner-position-select"
                >
                  {BANNER_POSITIONS.map((pos) => (
                    <option key={pos} value={pos}>
                      {BANNER_POSITION_LABELS[pos]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Link de Destino (opcional)</label>
              <input
                className="form-input"
                type="url"
                value={bannerForm.linkUrl ?? ''}
                onChange={(e) => setBannerForm((f) => ({ ...f, linkUrl: e.target.value || null }))}
                placeholder="Ex: https://mercadopago.com.br/promo"
                data-testid="modal-banner-link-url-input"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Texto do CTA</label>
              <input
                className="form-input"
                value={bannerForm.ctaText}
                onChange={(e) => setBannerForm((f) => ({ ...f, ctaText: e.target.value }))}
                placeholder="Ex: Saiba mais"
                data-testid="modal-banner-cta-text-input"
              />
            </div>

            {/* Datas de exibicao */}
            <div className="section-divider">Periodo de Exibicao</div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Data de Inicio</label>
                <input
                  className="form-input"
                  type="date"
                  value={bannerForm.startDate ?? ''}
                  onChange={(e) => setBannerForm((f) => ({ ...f, startDate: e.target.value || null }))}
                  data-testid="modal-banner-start-date"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Data Final</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <input
                    className="form-input"
                    type="date"
                    value={bannerForm.endDate ?? ''}
                    onChange={(e) => setBannerForm((f) => ({ ...f, endDate: e.target.value || null }))}
                    disabled={bannerForm.endDate === null}
                    style={{ opacity: bannerForm.endDate === null ? 0.5 : 1 }}
                    data-testid="modal-banner-end-date"
                  />
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--muted)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={bannerForm.endDate === null}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setBannerForm((f) => ({ ...f, endDate: null }))
                        } else {
                          setBannerForm((f) => ({ ...f, endDate: '' }))
                        }
                      }}
                      data-testid="modal-banner-indefinido-checkbox"
                    />
                    Indefinido
                  </label>
                </div>
              </div>
            </div>

            {/* Imagens responsivas */}
            <div className="section-divider">Imagens do Banner</div>
            <div className="form-group">
              <label className="form-label">Desktop (480x60)</label>
              <input
                className="form-input"
                type="url"
                value={bannerForm.imageDesktopUrl ?? ''}
                onChange={(e) => setBannerForm((f) => ({ ...f, imageDesktopUrl: e.target.value || null }))}
                placeholder="https://cdn.example.com/banner-desktop.png"
                data-testid="modal-banner-image-desktop-input"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Mobile (300x60)</label>
              <input
                className="form-input"
                type="url"
                value={bannerForm.imageMobileUrl ?? ''}
                onChange={(e) => setBannerForm((f) => ({ ...f, imageMobileUrl: e.target.value || null }))}
                placeholder="https://cdn.example.com/banner-mobile.png"
                data-testid="modal-banner-image-mobile-input"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Vertical / Sidebar (160x600)</label>
              <input
                className="form-input"
                type="url"
                value={bannerForm.imageVerticalUrl ?? ''}
                onChange={(e) => setBannerForm((f) => ({ ...f, imageVerticalUrl: e.target.value || null }))}
                placeholder="https://cdn.example.com/banner-vertical.png"
                data-testid="modal-banner-image-vertical-input"
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Cor do Banner</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    className="form-input"
                    type="color"
                    value={bannerForm.color}
                    onChange={(e) => setBannerForm((f) => ({ ...f, color: e.target.value }))}
                    style={{ width: '46px', padding: '4px', flexShrink: 0 }}
                    data-testid="modal-banner-color-picker"
                  />
                  <input
                    className="form-input"
                    value={bannerForm.color}
                    onChange={(e) => setBannerForm((f) => ({ ...f, color: e.target.value }))}
                    style={{ flex: 1, minWidth: 0 }}
                    data-testid="modal-banner-color-hex"
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Cor CTA</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    className="form-input"
                    type="color"
                    value={bannerForm.ctaColor}
                    onChange={(e) => setBannerForm((f) => ({ ...f, ctaColor: e.target.value }))}
                    style={{ width: '46px', padding: '4px', flexShrink: 0 }}
                    data-testid="modal-banner-cta-color-picker"
                  />
                  <input
                    className="form-input"
                    value={bannerForm.ctaColor}
                    onChange={(e) => setBannerForm((f) => ({ ...f, ctaColor: e.target.value }))}
                    style={{ flex: 1, minWidth: 0 }}
                    data-testid="modal-banner-cta-color-hex"
                  />
                </div>
              </div>
            </div>

            {/* Preview */}
            <div style={{ marginBottom: '14px' }}>
              <label className="form-label">Preview</label>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px',
                  borderRadius: '6px',
                  background: `linear-gradient(135deg,${bannerForm.color}22,${bannerForm.color}11)`,
                  border: `1.5px solid ${bannerForm.color}55`,
                  gap: '8px',
                }}
                data-testid="modal-banner-preview"
              >
                <div>
                  <div style={{ fontSize: '11px', fontWeight: '800', color: '#fff' }}>{bannerForm.title || 'Titulo do banner'}</div>
                  <div style={{ fontSize: '9px', color: 'rgba(255,255,255,.6)', marginTop: '2px' }}>{bannerForm.company || 'Empresa'}</div>
                </div>
                <div style={{
                  background: bannerForm.ctaColor,
                  borderRadius: '8px',
                  padding: '5px 12px',
                  fontSize: '9px',
                  fontWeight: '800',
                  color: '#fff',
                  flexShrink: 0,
                }}>
                  {bannerForm.ctaText || 'CTA'}
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="btn btn-sm btn-outline"
                style={{ color: 'var(--muted)', borderColor: 'var(--border)' }}
                onClick={() => setBannerModal(false)}
                data-testid="modal-banner-cancel-button"
              >
                Cancelar
              </button>
              <button
                className="btn btn-sm btn-solid"
                style={{ background: 'var(--accent)', color: '#000', border: 'none' }}
                onClick={saveBanner}
                disabled={savingBanner}
                data-testid="modal-banner-save-button"
              >
                {savingBanner ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── LEAGUE MODAL ── */}
      {leagueModal && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setLeagueModal(false)}
          data-testid="modal-liga-overlay"
        >
          <div className="modal-box" data-testid="modal-liga">
            <div className="modal-title" data-testid="modal-liga-title">
              {editingLeague ? 'Editar Liga Patrocinada' : 'Nova Liga Patrocinada'}
            </div>

            <div className="form-group">
              <label className="form-label">Nome da Liga</label>
              <input
                className="form-input"
                value={leagueForm.name}
                onChange={(e) => setLeagueForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Liga FootStock Marco 2026"
                data-testid="modal-liga-name-input"
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Empresa Patrocinadora</label>
                <input
                  className="form-input"
                  value={leagueForm.company}
                  onChange={(e) => setLeagueForm((f) => ({ ...f, company: e.target.value }))}
                  placeholder="Ex: Mercado Pago"
                  data-testid="modal-liga-company-input"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Site do Patrocinador</label>
                <input
                  className="form-input"
                  type="url"
                  value={leagueForm.sponsorUrl}
                  onChange={(e) => setLeagueForm((f) => ({ ...f, sponsorUrl: e.target.value }))}
                  placeholder="Ex: https://mercadopago.com.br"
                  data-testid="modal-liga-sponsor-url-input"
                />
              </div>
            </div>

            {/* ── Premiação ── */}
            <div className="section-divider">Premiação</div>
            <div className="prize-section" data-testid="modal-liga-prizes-section">
              {leagueForm.prizes.map((prize, index) => (
                <div key={index} className="prize-line" data-testid={`modal-liga-prize-${prize.position}`}>
                  <span className="prize-label">{prize.label}</span>
                  <input
                    className="form-input"
                    value={prize.description}
                    onChange={(e) => updatePrizeDescription(index, e.target.value)}
                    placeholder="Ex: R$5.000, carro, viagem, console..."
                    style={{ flex: 1 }}
                    data-testid={`modal-liga-prize-input-${prize.position}`}
                  />
                  {leagueForm.prizes.length > 1 && (
                    <button
                      className="prize-remove"
                      onClick={() => removePrizeLine(index)}
                      title="Remover premio"
                      data-testid={`modal-liga-prize-remove-${prize.position}`}
                    >
                      x
                    </button>
                  )}
                </div>
              ))}
              <button
                className="btn btn-sm btn-outline"
                style={{ color: 'var(--accent)', borderColor: 'var(--accent)', marginTop: '4px' }}
                onClick={addPrizeLine}
                data-testid="modal-liga-add-prize-button"
              >
                + Adicionar Ganhador
              </button>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Max. Participantes</label>
                <input
                  className="form-input"
                  type="number"
                  value={leagueForm.maxParticipants}
                  onChange={(e) => setLeagueForm((f) => ({ ...f, maxParticipants: parseInt(e.target.value) || 0 }))}
                  data-testid="modal-liga-max-participants-input"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Plano Mínimo</label>
                <select
                  className="form-input"
                  value={leagueForm.minPlan}
                  onChange={(e) => setLeagueForm((f) => ({ ...f, minPlan: e.target.value }))}
                  data-testid="modal-liga-min-plan-select"
                >
                  <option value="JOGADOR">Jogador</option>
                  <option value="CRAQUE">Craque</option>
                  <option value="LENDA">Lenda</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Status</label>
                <select
                  className="form-input"
                  value={leagueForm.status}
                  onChange={(e) => setLeagueForm((f) => ({ ...f, status: e.target.value }))}
                  data-testid="modal-liga-status-select"
                >
                  <option value="AGENDADA">Agendada</option>
                  <option value="ATIVA">Ativa</option>
                  <option value="ENCERRADA">Encerrada</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Cor da Borda</label>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <input
                    type="color"
                    className="form-input"
                    value={leagueForm.borderColor}
                    onChange={(e) => setLeagueForm((f) => ({ ...f, borderColor: e.target.value }))}
                    style={{ width: '46px', padding: '4px' }}
                    data-testid="modal-liga-border-color-picker"
                  />
                  <input
                    className="form-input"
                    value={leagueForm.borderColor}
                    onChange={(e) => setLeagueForm((f) => ({ ...f, borderColor: e.target.value }))}
                    style={{ flex: 1 }}
                    data-testid="modal-liga-border-color-hex"
                  />
                </div>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Data Inicio</label>
                <input
                  className="form-input"
                  type="date"
                  value={leagueForm.startDate}
                  onChange={(e) => setLeagueForm((f) => ({ ...f, startDate: e.target.value }))}
                  data-testid="modal-liga-start-date-input"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Data Fim</label>
                <input
                  className="form-input"
                  type="date"
                  value={leagueForm.endDate}
                  onChange={(e) => setLeagueForm((f) => ({ ...f, endDate: e.target.value }))}
                  data-testid="modal-liga-end-date-input"
                />
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="btn btn-sm btn-outline"
                style={{ color: 'var(--muted)', borderColor: 'var(--border)' }}
                onClick={() => setLeagueModal(false)}
                data-testid="modal-liga-cancel-button"
              >
                Cancelar
              </button>
              <button
                className="btn btn-sm btn-solid"
                style={{ background: 'var(--accent)', color: '#000', border: 'none' }}
                onClick={saveLeague}
                disabled={savingLeague}
                data-testid="modal-liga-save-button"
              >
                {savingLeague ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
