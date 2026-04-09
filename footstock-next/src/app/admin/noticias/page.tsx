'use client'

import { useState, useEffect } from 'react'
import { IMPACT_CATEGORY_LABELS, IMPACT_CATEGORY_OPTIONS, SENTIMENT_HEX_COLORS, SENTIMENT_OPTIONS } from '@/lib/constants/admin-ui'

interface NewsItem {
  id: string
  title: string
  content: string
  impact: string
  sentiment: string
  assetIds: string[]
  source?: string
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

const getSentimentLabel = (sentiment: string): string => sentiment

const EMPTY_CREATE = {
  title: '',
  content: '',
  impact: 'ESPORTIVA_MAJORITARIA',
  sentiment: 'NEUTRAL',
  assetIds: '',
  source: '',
  isPublished: false,
}

export default function NoticiasPage() {
  const [news, setNews] = useState<NewsItem[]>([])
  const [filter, setFilter] = useState<FilterType>('todas')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Edit modal
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ title: '', content: '', impact: 'ESPORTIVA_MAJORITARIA', sentiment: 'NEUTRAL' })
  const [savingEdit, setSavingEdit] = useState(false)

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
      if (!res.ok) throw new Error('Erro ao carregar notícias')
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
    if (!confirm('Tem certeza que deseja deletar essa notícia?')) return
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
    setEditingId(item.id)
    setEditForm({ title: item.title, content: item.content, impact: item.impact, sentiment: item.sentiment })
  }

  const saveEdit = async () => {
    if (!editingId) return
    setSavingEdit(true)
    try {
      const res = await fetch(`/api/v1/admin/news/${editingId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      })
      if (!res.ok) throw new Error('Erro ao salvar')
      fetchNews()
      setEditingId(null)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao salvar')
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
      const assetIds = createForm.assetIds
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)

      const res = await fetch('/api/v1/admin/news', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: createForm.title,
          content: createForm.content,
          impact: createForm.impact,
          sentiment: createForm.sentiment,
          assetIds,
          source: createForm.source || null,
          isPublished: createForm.isPublished,
        }),
      })
      if (!res.ok) throw new Error('Erro ao criar notícia')
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

  const labelStyle = {
    display: 'block',
    marginBottom: '6px',
    fontSize: '12px',
    fontWeight: '600' as const,
    color: '#8f95a5',
  }

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

      <div className="section-header">
        <div>
          <div className="section-title">Notícias</div>
          <div className="section-sub">{publishCount} publicadas · {draftCount} rascunhos</div>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="btn btn-sm btn-solid"
          style={{ background: 'var(--accent)', color: 'var(--bg)', borderColor: 'transparent' }}
        >
          + Nova
        </button>
      </div>

      <div className="filter-bar">
        {(['todas', 'publicada', 'rascunho', 'arquivada'] as FilterType[]).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`filter-btn ${filter === f ? 'active' : ''}`}>
            {f === 'todas' ? 'Todas' : f === 'publicada' ? 'Publicadas' : f === 'rascunho' ? 'Rascunhos' : 'Arquivadas'}
          </button>
        ))}
      </div>

      {loading && <div style={{ color: '#8f95a5', padding: '20px' }}>Carregando...</div>}
      {error && <div style={{ color: '#F6465D', padding: '20px' }}>Erro: {error}</div>}

      <div>
        {filteredNews.map((item) => {
          const sentimentColor = getSentimentColor(item.sentiment)
          const sentimentLabel = getSentimentLabel(item.sentiment)
          const statusLabel = item.isPublished ? 'PUBLICADA' : 'RASCUNHO'
          const statusColor = item.isPublished ? '#2EBD85' : '#F0B90B'

          return (
            <div key={item.id} className={`news-card ${item.isPublished ? 'published' : ''}`}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '8px' }}>
                <div style={{ flex: 1 }}>
                  <div className="news-badges">
                    <span className="badge" style={{ color: 'var(--accent2)' }}>
                      {item.assetIds[0]?.toUpperCase() || 'N/A'}
                    </span>
                    <span className="badge" style={{ color: 'var(--muted)' }}>
                      {IMPACT_CATEGORY_LABELS[item.impact] ?? item.impact}
                    </span>
                    <span className="badge" style={{ color: statusColor }}>{statusLabel}</span>
                  </div>
                  <div className="news-title">{item.title}</div>
                  <div className="news-author">
                    Por {item.author} · {new Date(item.publishedAt || item.createdAt).toLocaleDateString('pt-BR')} · {item.clicks} cliques
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: sentimentColor }} />
                  <span style={{ fontSize: '10px', fontWeight: '700', color: sentimentColor }}>
                    {sentimentLabel}
                  </span>
                </div>
              </div>

              <div className="news-actions">
                <button
                  onClick={() => togglePublish(item.id, item.isPublished)}
                  className="btn btn-sm btn-outline"
                  style={{ background: 'transparent', color: 'var(--muted)', borderColor: 'var(--muted)' }}
                >
                  {item.isPublished ? 'Despublicar' : 'Publicar'}
                </button>
                <button
                  onClick={() => openEditModal(item)}
                  className="btn btn-sm btn-outline"
                  style={{ background: 'transparent', color: 'var(--accent)', borderColor: 'var(--accent)' }}
                >
                  ✎ Editar
                </button>
                <button
                  onClick={() => archiveNews(item.id)}
                  className="btn btn-sm btn-outline"
                  style={{ background: 'transparent', color: 'var(--muted)', borderColor: 'var(--muted)' }}
                >
                  📦 Arquivar
                </button>
                <button
                  onClick={() => deleteNews(item.id)}
                  className="btn btn-sm btn-outline"
                  style={{ background: 'transparent', color: 'var(--red)', borderColor: 'var(--red)' }}
                >
                  🗑
                </button>
              </div>
            </div>
          )
        })}

        {filteredNews.length === 0 && !loading && (
          <div style={{ color: '#8f95a5', textAlign: 'center', padding: '20px' }}>
            Nenhuma notícia neste filtro
          </div>
        )}
      </div>

      {/* ── Modal Editar ── */}
      {editingId && (
        <div className="modal-overlay" onClick={() => setEditingId(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: 0, marginBottom: '20px' }}>Editar Notícia</h2>

            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Título</label>
              <input type="text" value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} style={inputStyle} />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Conteúdo</label>
              <textarea
                value={editForm.content}
                onChange={(e) => setEditForm({ ...editForm, content: e.target.value })}
                style={{ ...inputStyle, minHeight: '120px', fontFamily: 'inherit', resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div>
                <label style={labelStyle}>Impacto</label>
                <select value={editForm.impact} onChange={(e) => setEditForm({ ...editForm, impact: e.target.value })} style={inputStyle}>
                  {IMPACT_CATEGORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Sentimento</label>
                <select value={editForm.sentiment} onChange={(e) => setEditForm({ ...editForm, sentiment: e.target.value })} style={inputStyle}>
                  {SENTIMENT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setEditingId(null)} className="btn" style={{ background: 'transparent', color: '#8f95a5', borderColor: '#8f95a5', border: '1px solid' }}>
                Cancelar
              </button>
              <button onClick={saveEdit} disabled={savingEdit} className="btn btn-solid" style={{ background: 'var(--accent)', color: 'var(--bg)', border: 'none' }}>
                {savingEdit ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Criar ── */}
      {creating && (
        <div className="modal-overlay" onClick={() => setCreating(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: 0, marginBottom: '20px' }}>Nova Notícia</h2>

            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Título *</label>
              <input type="text" value={createForm.title} onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })} style={inputStyle} placeholder="Ex: URU3 anuncia parceria com banco digital" />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Conteúdo *</label>
              <textarea
                value={createForm.content}
                onChange={(e) => setCreateForm({ ...createForm, content: e.target.value })}
                style={{ ...inputStyle, minHeight: '120px', fontFamily: 'inherit', resize: 'vertical' }}
                placeholder="Descreva a notícia em detalhes..."
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div>
                <label style={labelStyle}>Impacto</label>
                <select value={createForm.impact} onChange={(e) => setCreateForm({ ...createForm, impact: e.target.value })} style={inputStyle}>
                  {IMPACT_CATEGORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Sentimento</label>
                <select value={createForm.sentiment} onChange={(e) => setCreateForm({ ...createForm, sentiment: e.target.value })} style={inputStyle}>
                  {SENTIMENT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Assets Relacionados (separados por vírgula)</label>
              <input
                type="text"
                value={createForm.assetIds}
                onChange={(e) => setCreateForm({ ...createForm, assetIds: e.target.value })}
                style={inputStyle}
                placeholder="Ex: uru3, por4"
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Fonte</label>
              <input
                type="text"
                value={createForm.source}
                onChange={(e) => setCreateForm({ ...createForm, source: e.target.value })}
                style={inputStyle}
                placeholder="Ex: Globo Sports"
              />
            </div>

            <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <input
                type="checkbox"
                id="isPublished"
                checked={createForm.isPublished}
                onChange={(e) => setCreateForm({ ...createForm, isPublished: e.target.checked })}
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
              />
              <label htmlFor="isPublished" style={{ fontSize: '13px', cursor: 'pointer', color: 'white' }}>
                Publicar imediatamente
              </label>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setCreating(false)} className="btn" style={{ background: 'transparent', color: '#8f95a5', borderColor: '#8f95a5', border: '1px solid' }}>
                Cancelar
              </button>
              <button onClick={saveCreate} disabled={savingCreate} className="btn btn-solid" style={{ background: 'var(--accent)', color: 'var(--bg)', border: 'none' }}>
                {savingCreate ? 'Criando...' : 'Criar Notícia'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
