'use client'

import { useState, useEffect } from 'react'

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
}

interface SponsoredLeague {
  id: string
  name: string
  company: string
  prize: string
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
  position: '',
  isActive: true,
  color: '#00B1EA',
  ctaText: 'Saiba mais',
  ctaColor: '#00B1EA',
}

const EMPTY_LEAGUE: Omit<SponsoredLeague, 'id' | 'participants'> = {
  name: '',
  company: '',
  prize: 'FS$0',
  maxParticipants: 50,
  minPlan: 'JOGADOR',
  status: 'AGENDADA',
  borderColor: '#f59e0b',
  startDate: new Date().toISOString().split('T')[0],
  endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
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
  const [leagueForm, setLeagueForm] = useState(EMPTY_LEAGUE)
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
      setLeagues(lData.data || [])
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
    })
    setBannerModal(true)
  }

  const saveBanner = async () => {
    setSavingBanner(true)
    try {
      if (editingBanner) {
        const res = await fetch(`/api/v1/admin/sponsors/banners/${editingBanner.id}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bannerForm),
        })
        if (!res.ok) throw new Error('Erro ao salvar')
      } else {
        const res = await fetch('/api/v1/admin/sponsors/banners', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bannerForm),
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
    setLeagueForm(EMPTY_LEAGUE)
    setLeagueModal(true)
  }

  const openEditLeague = (l: SponsoredLeague) => {
    setEditingLeague(l)
    setLeagueForm({
      name: l.name,
      company: l.company,
      prize: l.prize,
      maxParticipants: l.maxParticipants,
      minPlan: l.minPlan,
      status: l.status,
      borderColor: l.borderColor,
      startDate: l.startDate.split('T')[0],
      endDate: l.endDate.split('T')[0],
    })
    setLeagueModal(true)
  }

  const saveLeague = async () => {
    setSavingLeague(true)
    try {
      if (editingLeague) {
        const res = await fetch(`/api/v1/admin/sponsors/leagues/${editingLeague.id}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(leagueForm),
        })
        if (!res.ok) throw new Error('Erro ao salvar')
      } else {
        const res = await fetch('/api/v1/admin/sponsors/leagues', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(leagueForm),
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
    <div className="fade-in" style={{ padding: '20px', color: 'white' }}>
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
          max-width: 460px;
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
      `}</style>

      <div className="section-header">
        <div className="section-title">Patrocinadores</div>
        <div className="section-sub">Banners de publicidade e ligas patrocinadas</div>
      </div>

      <div className="sub-tabs">
        <button
          className={`sub-tab ${tab === 'banners' ? 'active' : ''}`}
          onClick={() => setTab('banners')}
        >
          Banners
        </button>
        <button
          className={`sub-tab ${tab === 'ligas' ? 'active' : ''}`}
          onClick={() => setTab('ligas')}
        >
          Ligas Patrocinadas
        </button>
      </div>

      {loading && <div style={{ color: '#8f95a5', padding: '20px' }}>Carregando...</div>}
      {error && <div style={{ color: '#F6465D', padding: '20px' }}>Erro: {error}</div>}

      {/* ── BANNERS TAB ── */}
      {!loading && tab === 'banners' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
              {banners.length} banners · {activeBanners} ativos
            </div>
            <button
              className="btn btn-sm btn-solid"
              style={{ background: 'var(--accent)', color: 'var(--bg)', borderColor: 'transparent' }}
              onClick={openNewBanner}
            >
              + Novo Banner
            </button>
          </div>

          {banners.map((banner) => (
            <div key={banner.id} className="banner-card" style={{ borderColor: banner.color + '55' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                    <span style={{ fontSize: '13px', fontWeight: '800', color: '#fff' }}>{banner.title}</span>
                    <span className="badge" style={{ color: banner.isActive ? 'var(--green)' : 'var(--muted)' }}>
                      {banner.isActive ? '● ATIVO' : 'INATIVO'}
                    </span>
                  </div>
                  <div style={{ fontSize: '9px', color: 'var(--muted)' }}>
                    {banner.company} · {banner.position}
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
                  <div className="kpi-label">IMPRESSÕES</div>
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
                >
                  ✎ Editar
                </button>
                <button
                  className="btn btn-sm btn-outline"
                  style={{
                    background: 'transparent',
                    color: banner.isActive ? 'var(--orange)' : 'var(--green)',
                    borderColor: banner.isActive ? 'var(--orange)' : 'var(--green)',
                  }}
                  onClick={() => toggleBanner(banner.id, banner.isActive)}
                >
                  {banner.isActive ? 'Desativar' : 'Ativar'}
                </button>
                <button
                  className="btn btn-sm btn-outline"
                  style={{ background: 'transparent', color: 'var(--red)', borderColor: 'var(--red)' }}
                  onClick={() => deleteBanner(banner.id)}
                >
                  🗑
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── LIGAS TAB ── */}
      {!loading && tab === 'ligas' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{leagues.length} ligas</div>
            <button
              className="btn btn-sm btn-solid"
              style={{ background: 'var(--accent)', color: 'var(--bg)', borderColor: 'transparent' }}
              onClick={openNewLeague}
            >
              + Nova Liga
            </button>
          </div>

          {leagues.map((league) => (
            <div key={league.id} className="liga-card" style={{ borderLeft: `3px solid ${league.borderColor}` }}>
              <div className="liga-header">
                <div>
                  <div style={{ fontSize: '12px', fontWeight: '800', color: '#fff', marginBottom: '2px' }}>{league.name}</div>
                  <div style={{ fontSize: '9px', color: 'var(--muted)' }}>{league.company}</div>
                </div>
                <span
                  className="badge"
                  style={{
                    color:
                      league.status === 'ATIVA' ? 'var(--green)'
                      : league.status === 'ENCERRADA' ? 'var(--muted)'
                      : 'var(--accent2)',
                  }}
                >
                  {league.status}
                </span>
              </div>

              <div className="liga-stats">
                <div className="liga-stat">
                  <div className="liga-stat-l">PRÊMIO</div>
                  <div className="liga-stat-v" style={{ color: 'var(--gold)' }}>{league.prize}</div>
                </div>
                <div className="liga-stat">
                  <div className="liga-stat-l">INSCRITOS</div>
                  <div className="liga-stat-v">{league.participants}/{league.maxParticipants}</div>
                </div>
                <div className="liga-stat">
                  <div className="liga-stat-l">PLANO MÍN.</div>
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

              <div className="bar-track" style={{ marginBottom: '10px' }}>
                <div
                  className="bar-fill"
                  style={{
                    width: `${Math.min(100, Math.round((league.participants / league.maxParticipants) * 100))}%`,
                    background: league.borderColor,
                  }}
                />
              </div>

              <div style={{ fontSize: '9px', color: 'var(--muted)', marginBottom: '8px' }}>
                {league.startDate.split('T')[0]} → {league.endDate.split('T')[0]}
              </div>

              <div style={{ display: 'flex', gap: '5px' }}>
                <button
                  className="btn btn-sm btn-outline"
                  style={{ background: 'transparent', color: 'var(--accent)', borderColor: 'var(--accent)' }}
                  onClick={() => openEditLeague(league)}
                >
                  ✎ Editar
                </button>
                <button
                  className="btn btn-sm btn-outline"
                  style={{ background: 'transparent', color: 'var(--red)', borderColor: 'var(--red)' }}
                  onClick={() => deleteLeague(league.id)}
                >
                  🗑
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── BANNER MODAL ── */}
      {bannerModal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setBannerModal(false)}>
          <div className="modal-box">
            <div className="modal-title">{editingBanner ? 'Editar Banner' : 'Novo Banner'}</div>

            <div className="form-group">
              <label className="form-label">Título</label>
              <input
                className="form-input"
                value={bannerForm.title}
                onChange={(e) => setBannerForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Ex: Mercado Pago — Pague em dia"
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
                />
              </div>
              <div className="form-group">
                <label className="form-label">Posição</label>
                <input
                  className="form-input"
                  value={bannerForm.position}
                  onChange={(e) => setBannerForm((f) => ({ ...f, position: e.target.value }))}
                  placeholder="Ex: Home Top"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Texto do CTA</label>
                <input
                  className="form-input"
                  value={bannerForm.ctaText}
                  onChange={(e) => setBannerForm((f) => ({ ...f, ctaText: e.target.value }))}
                  placeholder="Ex: Saiba mais"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Cor CTA</label>
                <input
                  className="form-input"
                  type="color"
                  value={bannerForm.ctaColor}
                  onChange={(e) => setBannerForm((f) => ({ ...f, ctaColor: e.target.value }))}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Cor do Banner</label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  className="form-input"
                  type="color"
                  value={bannerForm.color}
                  onChange={(e) => setBannerForm((f) => ({ ...f, color: e.target.value }))}
                  style={{ width: '60px', padding: '4px' }}
                />
                <input
                  className="form-input"
                  value={bannerForm.color}
                  onChange={(e) => setBannerForm((f) => ({ ...f, color: e.target.value }))}
                  style={{ flex: 1 }}
                />
              </div>
            </div>

            {/* Preview */}
            <div style={{ marginBottom: '14px' }}>
              <label className="form-label">Preview</label>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px',
                borderRadius: '6px',
                background: `linear-gradient(135deg,${bannerForm.color}22,${bannerForm.color}11)`,
                border: `1.5px solid ${bannerForm.color}55`,
                gap: '8px',
              }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: '800', color: '#fff' }}>{bannerForm.title || 'Título do banner'}</div>
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
              >
                Cancelar
              </button>
              <button
                className="btn btn-sm btn-solid"
                style={{ background: 'var(--accent)', color: '#000', border: 'none' }}
                onClick={saveBanner}
                disabled={savingBanner}
              >
                {savingBanner ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── LEAGUE MODAL ── */}
      {leagueModal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setLeagueModal(false)}>
          <div className="modal-box">
            <div className="modal-title">{editingLeague ? 'Editar Liga' : 'Nova Liga Patrocinada'}</div>

            <div className="form-group">
              <label className="form-label">Nome da Liga</label>
              <input
                className="form-input"
                value={leagueForm.name}
                onChange={(e) => setLeagueForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Liga FootStock Março 2026"
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
                />
              </div>
              <div className="form-group">
                <label className="form-label">Prêmio</label>
                <input
                  className="form-input"
                  value={leagueForm.prize}
                  onChange={(e) => setLeagueForm((f) => ({ ...f, prize: e.target.value }))}
                  placeholder="Ex: FS$10.000"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Máx. Participantes</label>
                <input
                  className="form-input"
                  type="number"
                  value={leagueForm.maxParticipants}
                  onChange={(e) => setLeagueForm((f) => ({ ...f, maxParticipants: parseInt(e.target.value) || 0 }))}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Plano Mínimo</label>
                <select
                  className="form-input"
                  value={leagueForm.minPlan}
                  onChange={(e) => setLeagueForm((f) => ({ ...f, minPlan: e.target.value }))}
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
                  />
                  <input
                    className="form-input"
                    value={leagueForm.borderColor}
                    onChange={(e) => setLeagueForm((f) => ({ ...f, borderColor: e.target.value }))}
                    style={{ flex: 1 }}
                  />
                </div>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Data Início</label>
                <input
                  className="form-input"
                  type="date"
                  value={leagueForm.startDate}
                  onChange={(e) => setLeagueForm((f) => ({ ...f, startDate: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Data Fim</label>
                <input
                  className="form-input"
                  type="date"
                  value={leagueForm.endDate}
                  onChange={(e) => setLeagueForm((f) => ({ ...f, endDate: e.target.value }))}
                />
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="btn btn-sm btn-outline"
                style={{ color: 'var(--muted)', borderColor: 'var(--border)' }}
                onClick={() => setLeagueModal(false)}
              >
                Cancelar
              </button>
              <button
                className="btn btn-sm btn-solid"
                style={{ background: 'var(--accent)', color: '#000', border: 'none' }}
                onClick={saveLeague}
                disabled={savingLeague}
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
