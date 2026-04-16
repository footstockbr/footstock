'use client'

import { useState, useEffect } from 'react'
import { Lock } from 'lucide-react'
import { IMPACT_CATEGORY_LABELS, IMPACT_CATEGORY_OPTIONS, SENTIMENT_HEX_COLORS, SENTIMENT_LABELS, SENTIMENT_OPTIONS } from '@/lib/constants/admin-ui'
import { CLUBS } from '@/lib/constants/clubs'

interface NewsItem {
  id: string
  title: string
  content: string
  impact: string
  sentiment: string
  ticker: string
  assetIds: string[]
  source?: string | null
  isPublished: boolean
  publishedAt?: string
  isArchived: boolean
  clicks: number
  author: string
  createdAt: string
  updatedAt: string
}

type FilterType = 'todas' | 'publicada' | 'rascunho' | 'arquivada'

const getSentimentColor = (sentiment: string): string => SENTIMENT_HEX_COLORS[sentiment] ?? '#F0B90B'

const getSentimentLabel = (sentiment: string): string => SENTIMENT_LABELS[sentiment] ?? sentiment

const isExternalSource = (item: NewsItem): boolean => {
  return Boolean(item.source && item.source.trim().length > 0)
}

const formatDateTime = (dateStr: string): string => {
  const date = new Date(dateStr)
  const dateFormatted = date.toLocaleDateString('pt-BR')
  const timeFormatted = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return `${dateFormatted} ${timeFormatted}`
}

const EMPTY_CREATE = {
  title: '',
  content: '',
  impact: 'ESPORTIVA_MAJORITARIA',
  sentiment: 'NEUTRAL',
  ticker: '',
  source: '',
  isPublished: false,
}

export default function NoticiasPage() {
  const [news, setNews] = useState<NewsItem[]>([])
  const [filter, setFilter] = useState<FilterType>('todas')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Edit modal
  const [editingItem, setEditingItem] = useState<NewsItem | null>(null)
  const [editForm, setEditForm] = useState({ title: '', content: '', impact: 'ESPORTIVA_MAJORITARIA', sentiment: 'NEUTRAL', ticker: '' })
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  // Create modal
  const [creating, setCreating] = useState(false)
  const [createForm, setCreateForm] = useState(EMPTY_CREATE)
  const [savingCreate, setSavingCreate] = useState(false)

  useEffect(() => {
    fetchNews()
  }, [])

  const fetchNews = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/v1/admin/news', { credentials: 'include' })
      if (!res.ok) throw new Error('Erro ao carregar noticias')
      const data = await res.json()
      setNews(data.data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }

  const getFilteredNews = () => {
    return news.filter((item) => {
      if (filter === 'todas') return !item.isArchived
      if (filter === 'publicada') return item.isPublished && !item.isArchived
      if (filter === 'rascunho') return !item.isPublished && !item.isArchived
      if (filter === 'arquivada') return item.isArchived
      return true
    })
  }

  const publishCount = news.filter((n) => n.isPublished && !n.isArchived).length
  const draftCount = news.filter((n) => !n.isPublished && !n.isArchived).length
  const archivedCount = news.filter((n) => n.isArchived).length

  const togglePublish = async (id: string, isPublished: boolean) => {
    try {
      const res = await fetch(`/api/v1/admin/news/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublished: !isPublished }),
      })
      if (!res.ok) throw new Error('Erro ao atualizar')
      fetchNews()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao atualizar')
    }
  }

  const archiveNews = async (id: string) => {
    try {
      const res = await fetch(`/api/v1/admin/news/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isArchived: true }),
      })
      if (!res.ok) throw new Error('Erro ao arquivar')
      fetchNews()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao arquivar')
    }
  }

  const deleteNews = async (id: string) => {
    if (!confirm('Tem certeza que deseja deletar essa noticia?')) return
    try {
      const res = await fetch(`/api/v1/admin/news/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Erro ao deletar')
      fetchNews()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao deletar')
    }
  }

  const openEditModal = (item: NewsItem) => {
    setEditingItem(item)
    setEditForm({ title: item.title, content: item.content, impact: item.impact, sentiment: item.sentiment, ticker: item.ticker ?? '' })
    setEditError(null)
  }

  const saveEdit = async () => {
    if (!editingItem) return
    setSavingEdit(true)
    setEditError(null)
    try {
      const isExternal = isExternalSource(editingItem)
      // Only send title/content if news is admin-created (not external)
      const payload: Record<string, unknown> = {
        impact: editForm.impact,
        sentiment: editForm.sentiment,
        ticker: editForm.ticker,
      }
      if (!isExternal) {
        payload.title = editForm.title
        payload.content = editForm.content
      }

      const res = await fetch(`/api/v1/admin/news/${editingItem.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error?.message || 'Erro ao salvar')
      }
      fetchNews()
      setEditingItem(null)
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setSavingEdit(false)
    }
  }

  const saveCreate = async () => {
    if (!createForm.title.trim() || !createForm.content.trim()) {
      alert('Título e conteúdo são obrigatórios')
      return
    }
    setSavingCreate(true)
    try {
      const res = await fetch('/api/v1/admin/news', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: createForm.title,
          content: createForm.content,
          impact: createForm.impact,
          sentiment: createForm.sentiment,
          ticker: createForm.ticker,
          source: createForm.source || null,
          isPublished: createForm.isPublished,
        }),
      })
      if (!res.ok) throw new Error('Erro ao criar noticia')
      fetchNews()
      setCreating(false)
      setCreateForm(EMPTY_CREATE)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao criar')
    } finally {
      setSavingCreate(false)
    }
  }

  const filteredNews = getFilteredNews()

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    background: '#1E2329',
    border: '1px solid #2a2d35',
    borderRadius: '6px',
    color: 'white',
    fontSize: '14px',
    boxSizing: 'border-box' as const,
  }

  const inputDisabledStyle = {
    ...inputStyle,
    opacity: 0.5,
    cursor: 'not-allowed',
    background: '#14161a',
  }

  const labelStyle = {
    display: 'block',
    marginBottom: '6px',
    fontSize: '12px',
    fontWeight: '600' as const,
    color: '#8f95a5',
  }

  return (
    <div data-testid="page-admin-noticias" className="fade-in" style={{ padding: '20px', color: 'white' }}>
      <style>{`
        :root {
          --bg: #1E2329;
          --accent: #F0B90B;
          --accent2: #FFC107;
          --muted: #8f95a5;
          --red: #F6465D;
          --green: #2EBD85;
          --mono: 'Courier New', monospace;
        }
        .section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        .section-title { font-size: 20px; font-weight: 600; }
        .section-sub { font-size: 12px; color: var(--muted); }
        .filter-bar { display: flex; gap: 0; margin-bottom: 20px; border-bottom: 1px solid #2a2d35; }
        .filter-btn { background: transparent; color: var(--muted); border: none; border-bottom: 2px solid transparent; padding: 12px 16px; cursor: pointer; font-size: 13px; transition: color 0.2s; }
        .filter-btn.active { color: var(--accent); border-bottom-color: var(--accent); }
        .news-card { background: #181A20; border: 1px solid #2a2d35; border-radius: 8px; padding: 16px; margin-bottom: 12px; }
        .news-card.published { border-color: #2a3d35; }
        .news-badges { display: flex; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
        .badge { background: rgba(255,255,255,.08); padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; display: inline-block; }
        .news-title { font-size: 14px; font-weight: 600; margin-bottom: 6px; }
        .news-author { font-size: 11px; color: var(--muted); }
        .news-actions { display: flex; gap: 8px; margin-top: 12px; padding-top: 12px; border-top: 1px solid #2a2d35; flex-wrap: wrap; }
        .btn { padding: 8px 12px; border-radius: 4px; font-size: 12px; font-weight: 600; cursor: pointer; border: 1px solid; transition: all 0.2s; }
        .btn-sm { padding: 6px 10px; font-size: 11px; }
        .btn-outline { background: transparent; border-color: currentColor; }
        .btn-outline:hover { opacity: 0.8; }
        .btn-solid { border: none; }
        .btn-solid:hover { opacity: 0.8; }
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 16px; }
        .modal-box { background: #181A20; border: 1px solid #2a2d35; border-radius: 8px; padding: 24px; max-width: 600px; width: 100%; max-height: 90vh; overflow-y: auto; color: white; }
      `}</style>

      <div className="section-header" data-testid="admin-noticias-header">
        <div>
          <div className="section-title">Notícias</div>
          <div className="section-sub">{publishCount} publicadas · {draftCount} rascunhos · {archivedCount} arquivadas</div>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="btn btn-sm btn-solid"
          data-testid="admin-noticias-nova-button"
          style={{ background: 'var(--accent)', color: 'var(--bg)', borderColor: 'transparent' }}
        >
          + Nova
        </button>
      </div>

      {/* Nota explicativa: injeção no motor */}
      <div
        data-testid="admin-noticias-motor-note"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '12px',
          padding: '8px 12px',
          background: 'rgba(240,185,11,.06)',
          border: '1px solid rgba(240,185,11,.15)',
          borderRadius: '8px',
          fontSize: '11px',
          color: '#929AA5',
        }}
      >
        <Lock size={12} style={{ color: '#F0B90B', flexShrink: 0 }} />
        <span>
          Para injetar uma notícia no motor de preço e disparar impacto em tempo real, use o{' '}
          <strong style={{ color: '#F0B90B' }}>Módulo Motor &gt; Notícias</strong>.
          As notícias criadas aqui ficam no feed editorial e não afetam o motor diretamente.
        </span>
      </div>

      <div className="filter-bar" data-testid="admin-noticias-filter-bar">
        {(['todas', 'publicada', 'rascunho', 'arquivada'] as FilterType[]).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`filter-btn ${filter === f ? 'active' : ''}`} data-testid={`admin-noticias-filter-${f}-button`}>
            {f === 'todas' ? 'Todas' : f === 'publicada' ? 'Publicadas' : f === 'rascunho' ? 'Rascunhos' : 'Arquivadas'}
          </button>
        ))}
      </div>

      {loading && <div data-testid="admin-noticias-loading" style={{ color: '#8f95a5', padding: '20px' }}>Carregando...</div>}
      {error && <div data-testid="admin-noticias-error" style={{ color: '#F6465D', padding: '20px' }}>Erro: {error}</div>}

      <div data-testid="admin-noticias-list">
        {filteredNews.map((item) => {
          const sentimentColor = getSentimentColor(item.sentiment)
          const sentimentLabel = getSentimentLabel(item.sentiment)
          const statusLabel = item.isArchived ? 'ARQUIVADA' : item.isPublished ? 'PUBLICADA' : 'RASCUNHO'
          const statusColor = item.isArchived ? '#929aa5' : item.isPublished ? '#2EBD85' : '#F0B90B'
          const isExternal = isExternalSource(item)

          return (
            <div key={item.id} className={`news-card ${item.isPublished ? 'published' : ''}`} data-testid={`admin-noticias-card-${item.id}`}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '8px' }}>
                <div style={{ flex: 1 }}>
                  <div className="news-badges">
                    {item.ticker ? (
                      <span className="badge" data-testid={`admin-noticias-ticker-badge-${item.id}`} style={{ color: 'var(--accent2)' }}>
                        {item.ticker}
                      </span>
                    ) : (
                      <span className="badge" style={{ color: 'var(--muted)', opacity: 0.5 }} title="Sem time vinculado">
                        Sem time
                      </span>
                    )}
                    <span className="badge" data-testid={`admin-noticias-impact-badge-${item.id}`} style={{ color: 'var(--muted)' }}>
                      {IMPACT_CATEGORY_LABELS[item.impact] ?? item.impact}
                    </span>
                    <span className="badge" data-testid={`admin-noticias-status-badge-${item.id}`} style={{ color: statusColor }}>{statusLabel}</span>
                    {isExternal && (
                      <span
                        className="badge"
                        data-testid={`admin-noticias-source-badge-${item.id}`}
                        style={{ color: '#929aa5', display: 'flex', alignItems: 'center', gap: '4px' }}
                        title="Notícia de fonte externa — título e conteúdo protegidos"
                      >
                        <Lock size={10} />
                        {item.source}
                      </span>
                    )}
                  </div>
                  <div className="news-title" data-testid={`admin-noticias-title-${item.id}`}>{item.title}</div>
                  <div data-testid={`admin-noticias-content-preview-${item.id}`} style={{ fontSize: '12px', color: '#929aa5', marginBottom: '6px', lineHeight: '1.4' }}>
                    {item.content.length > 120 ? `${item.content.slice(0, 120)}...` : item.content}
                  </div>
                  <div className="news-author" data-testid={`admin-noticias-meta-${item.id}`}>
                    Por {item.author} · {formatDateTime(item.publishedAt || item.createdAt)} · {item.clicks} cliques
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: sentimentColor }} />
                  <span data-testid={`admin-noticias-sentiment-${item.id}`} style={{ fontSize: '10px', fontWeight: '700', color: sentimentColor }}>
                    {sentimentLabel}
                  </span>
                </div>
              </div>

              <div className="news-actions" data-testid={`admin-noticias-actions-${item.id}`}>
                <button
                  onClick={() => togglePublish(item.id, item.isPublished)}
                  className="btn btn-sm btn-outline"
                  data-testid={`admin-noticias-publish-button-${item.id}`}
                  style={{ background: 'transparent', color: 'var(--muted)', borderColor: 'var(--muted)' }}
                >
                  {item.isPublished ? 'Despublicar' : 'Publicar'}
                </button>
                <button
                  onClick={() => openEditModal(item)}
                  className="btn btn-sm btn-outline"
                  data-testid={`admin-noticias-edit-button-${item.id}`}
                  style={{ background: 'transparent', color: 'var(--accent)', borderColor: 'var(--accent)' }}
                >
                  Editar
                </button>
                {!item.isArchived && (
                  <button
                    onClick={() => archiveNews(item.id)}
                    className="btn btn-sm btn-outline"
                    data-testid={`admin-noticias-archive-button-${item.id}`}
                    style={{ background: 'transparent', color: 'var(--muted)', borderColor: 'var(--muted)' }}
                  >
                    Arquivar
                  </button>
                )}
                <button
                  onClick={() => deleteNews(item.id)}
                  className="btn btn-sm btn-outline"
                  data-testid={`admin-noticias-delete-button-${item.id}`}
                  style={{ background: 'transparent', color: 'var(--red)', borderColor: 'var(--red)' }}
                >
                  Deletar
                </button>
              </div>
            </div>
          )
        })}

        {filteredNews.length === 0 && !loading && (
          <div data-testid="admin-noticias-empty" style={{ color: '#8f95a5', textAlign: 'center', padding: '20px' }}>
            Nenhuma notícia neste filtro
          </div>
        )}
      </div>

      {/* ── Modal Editar ── */}
      {editingItem && (
        <div className="modal-overlay" data-testid="admin-noticias-edit-modal-overlay" onClick={() => setEditingItem(null)}>
          <div className="modal-box" data-testid="admin-noticias-edit-modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0 }}>Editar Noticia</h2>
              {isExternalSource(editingItem) && (
                <span
                  data-testid="admin-noticias-edit-modal-external-badge"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '11px',
                    color: '#929aa5',
                    background: 'rgba(146, 154, 165, 0.1)',
                    padding: '4px 10px',
                    borderRadius: '4px',
                  }}
                >
                  <Lock size={12} />
                  Fonte externa: {editingItem.source}
                </span>
              )}
            </div>

            {/* External source warning */}
            {isExternalSource(editingItem) && (
              <div
                data-testid="admin-noticias-edit-modal-external-warning"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '16px',
                  padding: '10px 14px',
                  background: 'rgba(240, 185, 11, 0.06)',
                  border: '1px solid rgba(240, 185, 11, 0.15)',
                  borderRadius: '6px',
                  color: '#F0B90B',
                  fontSize: '12px',
                }}
              >
                <Lock size={14} />
                Título e conteúdo protegidos contra edição para manter credibilidade da fonte original. Impacto, sentimento e time podem ser ajustados.
              </div>
            )}

            {editError && (
              <div
                data-testid="admin-noticias-edit-modal-error"
                style={{
                  marginBottom: '16px',
                  padding: '10px 14px',
                  background: 'rgba(246, 70, 93, 0.08)',
                  border: '1px solid rgba(246, 70, 93, 0.2)',
                  borderRadius: '6px',
                  color: '#f6465d',
                  fontSize: '12px',
                }}
              >
                {editError}
              </div>
            )}

            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>
                Título
                {isExternalSource(editingItem) && <Lock size={10} style={{ display: 'inline', marginLeft: '6px', verticalAlign: 'middle' }} />}
              </label>
              <input
                type="text"
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                style={isExternalSource(editingItem) ? inputDisabledStyle : inputStyle}
                readOnly={isExternalSource(editingItem)}
                data-testid="admin-noticias-edit-modal-title-input"
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>
                Conteúdo
                {isExternalSource(editingItem) && <Lock size={10} style={{ display: 'inline', marginLeft: '6px', verticalAlign: 'middle' }} />}
              </label>
              <textarea
                value={editForm.content}
                onChange={(e) => setEditForm({ ...editForm, content: e.target.value })}
                style={{
                  ...(isExternalSource(editingItem) ? inputDisabledStyle : inputStyle),
                  minHeight: '120px',
                  fontFamily: 'inherit',
                  resize: isExternalSource(editingItem) ? 'none' : 'vertical',
                }}
                readOnly={isExternalSource(editingItem)}
                data-testid="admin-noticias-edit-modal-content-input"
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Time</label>
              <select
                value={editForm.ticker}
                onChange={(e) => setEditForm({ ...editForm, ticker: e.target.value })}
                style={inputStyle}
                data-testid="admin-noticias-edit-modal-ticker-select"
              >
                <option value="">Selecionar time...</option>
                {CLUBS.map((c) => (
                  <option key={c.ticker} value={c.ticker}>{c.ticker} — {c.displayName}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div>
                <label style={labelStyle}>Impacto</label>
                <select
                  value={editForm.impact}
                  onChange={(e) => setEditForm({ ...editForm, impact: e.target.value })}
                  style={inputStyle}
                  data-testid="admin-noticias-edit-modal-impact-select"
                >
                  {IMPACT_CATEGORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Sentimento</label>
                <select
                  value={editForm.sentiment}
                  onChange={(e) => setEditForm({ ...editForm, sentiment: e.target.value })}
                  style={inputStyle}
                  data-testid="admin-noticias-edit-modal-sentiment-select"
                >
                  {SENTIMENT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setEditingItem(null)}
                className="btn"
                data-testid="admin-noticias-edit-modal-cancel-button"
                style={{ background: 'transparent', color: '#8f95a5', borderColor: '#8f95a5', border: '1px solid' }}
              >
                Cancelar
              </button>
              <button
                onClick={saveEdit}
                disabled={savingEdit}
                className="btn btn-solid"
                data-testid="admin-noticias-edit-modal-save-button"
                style={{ background: 'var(--accent)', color: 'var(--bg)', border: 'none' }}
              >
                {savingEdit ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Criar ── */}
      {creating && (
        <div className="modal-overlay" data-testid="admin-noticias-create-modal-overlay" onClick={() => setCreating(false)}>
          <div className="modal-box" data-testid="admin-noticias-create-modal" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: 0, marginBottom: '20px' }}>Nova Noticia</h2>

            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Titulo *</label>
              <input
                type="text"
                value={createForm.title}
                onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                style={inputStyle}
                placeholder="Ex: URU3 anuncia parceria com banco digital"
                data-testid="admin-noticias-create-modal-title-input"
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Conteúdo *</label>
              <textarea
                value={createForm.content}
                onChange={(e) => setCreateForm({ ...createForm, content: e.target.value })}
                style={{ ...inputStyle, minHeight: '120px', fontFamily: 'inherit', resize: 'vertical' }}
                placeholder="Descreva a notícia em detalhes..."
                data-testid="admin-noticias-create-modal-content-input"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div>
                <label style={labelStyle}>Impacto</label>
                <select
                  value={createForm.impact}
                  onChange={(e) => setCreateForm({ ...createForm, impact: e.target.value })}
                  style={inputStyle}
                  data-testid="admin-noticias-create-modal-impact-select"
                >
                  {IMPACT_CATEGORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Sentimento</label>
                <select
                  value={createForm.sentiment}
                  onChange={(e) => setCreateForm({ ...createForm, sentiment: e.target.value })}
                  style={inputStyle}
                  data-testid="admin-noticias-create-modal-sentiment-select"
                >
                  {SENTIMENT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Time</label>
              <select
                value={createForm.ticker}
                onChange={(e) => setCreateForm({ ...createForm, ticker: e.target.value })}
                style={inputStyle}
                data-testid="admin-noticias-create-modal-ticker-select"
              >
                <option value="">Selecionar time...</option>
                {CLUBS.map((c) => (
                  <option key={c.ticker} value={c.ticker}>{c.ticker} — {c.displayName}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Fonte (se externa)</label>
              <input
                type="text"
                value={createForm.source}
                onChange={(e) => setCreateForm({ ...createForm, source: e.target.value })}
                style={inputStyle}
                placeholder="Deixe vazio para notícia editorial. Ex: Globo Esporte, ESPN"
                data-testid="admin-noticias-create-modal-source-input"
              />
              <div style={{ fontSize: '10px', color: '#929aa5', marginTop: '4px' }}>
                Se preenchido, título e conteúdo ficarão protegidos contra edição futura.
              </div>
            </div>

            <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <input
                type="checkbox"
                id="isPublished"
                checked={createForm.isPublished}
                onChange={(e) => setCreateForm({ ...createForm, isPublished: e.target.checked })}
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                data-testid="admin-noticias-create-modal-publish-checkbox"
              />
              <label htmlFor="isPublished" style={{ fontSize: '13px', cursor: 'pointer', color: 'white' }}>
                Publicar imediatamente
              </label>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setCreating(false)}
                className="btn"
                data-testid="admin-noticias-create-modal-cancel-button"
                style={{ background: 'transparent', color: '#8f95a5', borderColor: '#8f95a5', border: '1px solid' }}
              >
                Cancelar
              </button>
              <button
                onClick={saveCreate}
                disabled={savingCreate}
                className="btn btn-solid"
                data-testid="admin-noticias-create-modal-save-button"
                style={{ background: 'var(--accent)', color: 'var(--bg)', border: 'none' }}
              >
                {savingCreate ? 'Criando...' : 'Criar Noticia'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
