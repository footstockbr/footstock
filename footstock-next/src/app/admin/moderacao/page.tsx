'use client'

import { useState, useEffect } from 'react'
import { Flag, Trash2, CheckCircle, Clock } from 'lucide-react'

interface ModerationPost {
  id: string
  content: string
  ticker: string | null
  flagCount: number
  isFlagged: boolean
  isDeleted: boolean
  badge: string
  user: {
    id: string
    name: string
    planType: string
  }
  createdAt: string
  moderationActions: Array<{
    id: string
    action: string
    createdAt: string
    reason?: string
    moderator: {
      name: string
    }
  }>
}

interface ModerationAction {
  id: string
  action: string
  createdAt: string
  reason?: string
  moderator: {
    name: string
  }
  post: {
    content: string
  }
}

interface UserHistory {
  id: string
  action: string
  createdAt: string
  reason?: string
  moderator: {
    name: string
  }
  post: {
    id: string
    content: string
    createdAt: string
    isFlagged: boolean
    isDeleted: boolean
  }
}

const PLAN_BADGES: Record<string, { label: string; color: string }> = {
  JOGADOR: { label: 'Jogador', color: 'var(--muted)' },
  CRAQUE: { label: 'Craque', color: 'var(--accent)' },
  LENDA: { label: 'Lenda', color: 'var(--gold)' },
}

const getPlanColor = (planType: string): string => {
  if (planType === 'CRAQUE') return 'var(--accent)'
  if (planType === 'LENDA') return '#F0B90B'
  return 'var(--muted)'
}

const getPlanLabel = (planType: string): string => {
  return PLAN_BADGES[planType]?.label || 'User'
}

const getTimeAgo = (createdAt: string) => {
  const date = new Date(createdAt)
  const now = new Date()
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (seconds < 60) return `${seconds}s atrás`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m atrás`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h atrás`
  return `${Math.floor(seconds / 86400)}d atrás`
}

export default function AdminModeracaoPage() {
  const [subTab, setSubTab] = useState<'fila' | 'palavras'>('fila')
  const [filter, setFilter] = useState<'flagged' | 'ok' | 'todos'>('flagged')
  const [posts, setPosts] = useState<ModerationPost[]>([])
  const [blockedWords, setBlockedWords] = useState<string[]>([])
  const [newWord, setNewWord] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectedPostIds, setSelectedPostIds] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)
  const [showUserHistory, setShowUserHistory] = useState<string | null>(null)
  const [userHistory, setUserHistory] = useState<UserHistory[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [recentActions, setRecentActions] = useState<ModerationAction[]>([])
  const [showNotifications, setShowNotifications] = useState(false)

  useEffect(() => {
    fetchData()
    // Poll for recent actions every 10 seconds
    const interval = setInterval(fetchRecentActions, 10000)
    return () => clearInterval(interval)
  }, [filter])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [postsRes, wordsRes] = await Promise.all([
        fetch(`/api/v1/admin/moderation?filter=${filter}`, {
          credentials: 'include',
        }).then((r) => r.json()),
        fetch('/api/v1/admin/moderation/blocked-words', {
          credentials: 'include',
        }).then((r) => r.json()),
      ])

      setPosts(postsRes.data || [])
      setBlockedWords(wordsRes.data?.words || [])
      setSelectedPostIds(new Set())
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchRecentActions = async () => {
    try {
      const res = await fetch('/api/v1/admin/moderation/history?minutes=5', {
        credentials: 'include',
      }).then((r) => r.json())

      setRecentActions(res.data || [])
    } catch (error) {
      console.error('Error fetching recent actions:', error)
    }
  }

  const handleApprovePost = async (postId: string) => {
    try {
      const res = await fetch(`/api/v1/admin/moderation/${postId}?action=approve`, {
        method: 'POST',
        credentials: 'include',
      })
      if (res.ok) {
        setPosts(posts.filter((p) => p.id !== postId))
      }
    } catch (error) {
      console.error('Error approving post:', error)
    }
  }

  const handleRemovePost = async (postId: string) => {
    try {
      const res = await fetch(`/api/v1/admin/moderation/${postId}?action=remove`, {
        method: 'POST',
        credentials: 'include',
      })
      if (res.ok) {
        setPosts(posts.filter((p) => p.id !== postId))
      }
    } catch (error) {
      console.error('Error removing post:', error)
    }
  }

  const handleBulkAction = async (action: 'approve' | 'remove') => {
    if (selectedPostIds.size === 0) return

    setBulkLoading(true)
    try {
      const res = await fetch('/api/v1/admin/moderation/bulk', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postIds: Array.from(selectedPostIds),
          action,
        }),
      })

      if (res.ok) {
        const updatedIds = Array.from(selectedPostIds)
        setPosts(posts.filter((p) => !updatedIds.includes(p.id)))
        setSelectedPostIds(new Set())
      }
    } catch (error) {
      console.error('Error bulk action:', error)
    } finally {
      setBulkLoading(false)
    }
  }

  const handleAddWord = async () => {
    if (!newWord.trim()) return

    try {
      const res = await fetch('/api/v1/admin/moderation/blocked-words', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: newWord }),
      })

      if (res.ok) {
        setBlockedWords([newWord.toLowerCase(), ...blockedWords])
        setNewWord('')
      }
    } catch (error) {
      console.error('Error adding word:', error)
    }
  }

  const handleRemoveWord = async (word: string) => {
    try {
      const res = await fetch(
        `/api/v1/admin/moderation/blocked-words/${encodeURIComponent(word)}`,
        {
          method: 'DELETE',
          credentials: 'include',
        }
      )

      if (res.ok) {
        setBlockedWords(blockedWords.filter((w) => w !== word))
      }
    } catch (error) {
      console.error('Error removing word:', error)
    }
  }

  const handleShowUserHistory = async (userId: string) => {
    setShowUserHistory(userId)
    setHistoryLoading(true)
    try {
      const res = await fetch(`/api/v1/admin/moderation/users/${userId}/history`, {
        credentials: 'include',
      }).then((r) => r.json())

      setUserHistory(res.data || [])
    } catch (error) {
      console.error('Error fetching user history:', error)
    } finally {
      setHistoryLoading(false)
    }
  }

  const togglePostSelection = (postId: string) => {
    const newSelected = new Set(selectedPostIds)
    if (newSelected.has(postId)) {
      newSelected.delete(postId)
    } else {
      newSelected.add(postId)
    }
    setSelectedPostIds(newSelected)
  }

  const toggleAllSelection = () => {
    if (selectedPostIds.size === posts.length) {
      setSelectedPostIds(new Set())
    } else {
      setSelectedPostIds(new Set(posts.map((p) => p.id)))
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="fade-in">
        <div className="section-header mb-4">
          <div>
            <div className="section-title">Moderação</div>
            <div className="section-sub">{posts.length} posts aguardando revisão</div>
          </div>
          {recentActions.length > 0 && (
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="notification-btn"
              style={{
                position: 'relative',
                background: 'rgba(240, 185, 11, 0.1)',
                border: '1px solid rgba(240, 185, 11, 0.2)',
                color: '#f0b90b',
                padding: '8px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              🔔 {recentActions.length} ações
            </button>
          )}
        </div>

        {/* Recent Notifications */}
        {showNotifications && recentActions.length > 0 && (
          <div
            className="notifications-panel"
            style={{
              background: '#1e2329',
              border: '1px solid rgba(240, 185, 11, 0.1)',
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '16px',
              maxHeight: '300px',
              overflowY: 'auto',
            }}
          >
            {recentActions.slice(0, 10).map((action) => (
              <div
                key={action.id}
                style={{
                  padding: '8px',
                  borderBottom: '1px solid rgba(240, 185, 11, 0.05)',
                  fontSize: '11px',
                  color: '#929aa5',
                }}
              >
                <span style={{ fontWeight: 600, color: '#f0b90b' }}>
                  {action.action === 'APPROVED' && '✓ Aprovado'}
                  {action.action === 'REMOVED' && '🗑 Removido'}
                  {action.action === 'FLAGGED' && '⚠ Flagged'}
                </span>
                {' por '}
                <span style={{ color: '#eaecef' }}>{action.moderator.name}</span>
                {' - '}
                {getTimeAgo(action.createdAt)}
              </div>
            ))}
          </div>
        )}

        {/* Sub-Tabs */}
        <div className="sub-tabs mb-4">
          <button
            className={`sub-tab ${subTab === 'fila' ? 'active' : ''}`}
            onClick={() => setSubTab('fila')}
          >
            Fila de Posts
          </button>
          <button
            className={`sub-tab ${subTab === 'palavras' ? 'active' : ''}`}
            onClick={() => setSubTab('palavras')}
          >
            Palavras Bloqueadas
          </button>
        </div>

        {/* Fila de Posts */}
        {subTab === 'fila' && (
          <>
            {/* Filter Bar */}
            <div className="filter-bar mb-4">
              <button
                className={`filter-btn ${filter === 'flagged' ? 'active' : ''}`}
                onClick={() => setFilter('flagged')}
              >
                🚨 Suspeitos
              </button>
              <button
                className={`filter-btn ${filter === 'ok' ? 'active' : ''}`}
                onClick={() => setFilter('ok')}
              >
                ✅ Aprovados
              </button>
              <button
                className={`filter-btn ${filter === 'todos' ? 'active' : ''}`}
                onClick={() => setFilter('todos')}
              >
                Todos
              </button>
            </div>

            {/* Bulk Actions */}
            {selectedPostIds.size > 0 && (
              <div
                className="bulk-actions"
                style={{
                  display: 'flex',
                  gap: '8px',
                  marginBottom: '16px',
                  padding: '12px',
                  background: 'rgba(240, 185, 11, 0.05)',
                  border: '1px solid rgba(240, 185, 11, 0.1)',
                  borderRadius: '6px',
                }}
              >
                <span style={{ flex: 1, color: '#929aa5', fontSize: '12px' }}>
                  {selectedPostIds.size} post{selectedPostIds.size !== 1 ? 's' : ''} selecionado
                  {selectedPostIds.size !== 1 ? 's' : ''}
                </span>
                <button
                  onClick={() => handleBulkAction('approve')}
                  disabled={bulkLoading}
                  style={{
                    background: 'transparent',
                    color: 'var(--green)',
                    border: '1px solid var(--green)',
                    padding: '6px 12px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    cursor: bulkLoading ? 'not-allowed' : 'pointer',
                    opacity: bulkLoading ? 0.5 : 1,
                  }}
                >
                  ✓ Aprovar tudo
                </button>
                <button
                  onClick={() => handleBulkAction('remove')}
                  disabled={bulkLoading}
                  style={{
                    background: 'transparent',
                    color: 'var(--red)',
                    border: '1px solid var(--red)',
                    padding: '6px 12px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    cursor: bulkLoading ? 'not-allowed' : 'pointer',
                    opacity: bulkLoading ? 0.5 : 1,
                  }}
                >
                  🗑 Remover tudo
                </button>
              </div>
            )}

            {/* Select All */}
            {posts.length > 0 && (
              <div
                style={{
                  marginBottom: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '12px',
                  color: '#929aa5',
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedPostIds.size === posts.length && posts.length > 0}
                  onChange={toggleAllSelection}
                  style={{ cursor: 'pointer' }}
                />
                <span>Selecionar tudo nesta página</span>
              </div>
            )}

            {/* Posts */}
            <div className="space-y-3">
              {loading ? (
                <div className="text-center py-8 text-[#929AA5]">Carregando posts...</div>
              ) : posts.length === 0 ? (
                <div className="text-center py-8 text-[#929AA5]">Nenhum post encontrado</div>
              ) : (
                posts.map((post) => {
                  const badgeColor = post.isFlagged ? 'var(--orange)' : 'var(--green)'
                  const badgeLabel = post.isFlagged ? '⚠ SUSPEITO' : '✓ APROVADO'

                  return (
                    <div
                      key={post.id}
                      className={`post-card ${post.isFlagged ? 'flagged' : ''}`}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '12px',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedPostIds.has(post.id)}
                          onChange={() => togglePostSelection(post.id)}
                          style={{ marginTop: '4px', cursor: 'pointer' }}
                        />

                        <div style={{ flex: 1 }}>
                          <div className="post-header">
                            <div>
                              <div className="post-author" style={{ cursor: 'pointer' }}>
                                <span
                                  onClick={() => handleShowUserHistory(post.user.id)}
                                  style={{ color: '#eaecef', textDecoration: 'underline' }}
                                >
                                  {post.user.name}
                                </span>{' '}
                                <span
                                  className="badge"
                                  style={{
                                    color: getPlanColor(post.user.planType),
                                    background: 'rgba(255,255,255,.08)',
                                  }}
                                >
                                  {getPlanLabel(post.user.planType)}
                                </span>
                              </div>
                              <div className="post-meta">
                                {post.ticker} · {getTimeAgo(post.createdAt)} ·{' '}
                                <span style={{ color: 'var(--orange)' }}>
                                  ⚑ {post.flagCount} denúncia{post.flagCount !== 1 ? 's' : ''}
                                </span>
                              </div>
                            </div>
                            <span
                              className="badge"
                              style={{
                                color: badgeColor,
                                background:
                                  post.isFlagged
                                    ? 'rgba(249,115,22,.12)'
                                    : 'rgba(46,189,133,.12)',
                              }}
                            >
                              {badgeLabel}
                            </span>
                          </div>
                          <div className="post-text">{post.content}</div>

                          {/* Moderation History */}
                          {post.moderationActions.length > 0 && (
                            <div
                              style={{
                                fontSize: '10px',
                                color: '#929aa5',
                                marginTop: '8px',
                                borderTop: '1px solid rgba(240, 185, 11, 0.08)',
                                paddingTop: '8px',
                              }}
                            >
                              <Clock size={12} style={{ display: 'inline', marginRight: '4px' }} />
                              <span>Histórico: </span>
                              {post.moderationActions.slice(0, 2).map((action, idx) => (
                                <span key={idx} style={{ marginRight: '8px' }}>
                                  {action.action === 'APPROVED' && '✓ Aprovado'}
                                  {action.action === 'REMOVED' && '🗑 Removido'}
                                  {action.action === 'FLAGGED' && '⚠ Flagged'}
                                  {' por '}
                                  <strong>{action.moderator.name}</strong>
                                  {' · '}
                                  {getTimeAgo(action.createdAt)}
                                </span>
                              ))}
                            </div>
                          )}

                          <div className="post-actions">
                            <button
                              onClick={() => handleApprovePost(post.id)}
                              className="btn btn-sm btn-outline"
                              style={{
                                background: 'transparent',
                                color: 'var(--green)',
                                borderColor: 'var(--green)',
                              }}
                            >
                              ✓ Aprovar
                            </button>
                            <button
                              onClick={() => handleRemovePost(post.id)}
                              className="btn btn-sm btn-outline"
                              style={{
                                background: 'transparent',
                                color: 'var(--red)',
                                borderColor: 'var(--red)',
                              }}
                            >
                              🗑 Remover
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </>
        )}

        {/* Palavras Bloqueadas */}
        {subTab === 'palavras' && (
          <>
            <div className="card">
              <div className="card-title">PALAVRAS BLOQUEADAS ({blockedWords.length})</div>
              <div style={{ marginBottom: '12px' }}>
                {blockedWords.map((word) => (
                  <span key={word} className="word-chip">
                    {word}
                    <button onClick={() => handleRemoveWord(word)}>✕</button>
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  className="field-inp"
                  placeholder="Nova palavra..."
                  value={newWord}
                  onChange={(e) => setNewWord(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddWord()
                  }}
                  style={{ flex: 1 }}
                />
                <button
                  onClick={handleAddWord}
                  className="btn btn-sm btn-solid"
                  style={{
                    background: 'var(--accent)',
                    color: 'var(--bg)',
                    borderColor: 'transparent',
                  }}
                >
                  + Adicionar
                </button>
              </div>
            </div>

            <div className="card">
              <div className="card-title">AUTO-DETECÇÃO</div>
              <div style={{ fontSize: '11px', color: 'var(--text)', lineHeight: '1.6' }}>
                Posts contendo palavras da lista são automaticamente marcados como{' '}
                <span style={{ color: 'var(--orange)', fontWeight: '700' }}>suspeitos</span> e
                adicionados à fila de revisão. Moderadores são notificados em tempo real.
              </div>
            </div>
          </>
        )}
      </div>

      {/* User History Modal */}
      {showUserHistory && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowUserHistory(null)}
        >
          <div
            style={{
              background: '#1e2329',
              border: '1px solid rgba(240, 185, 11, 0.1)',
              borderRadius: '8px',
              padding: '24px',
              maxWidth: '600px',
              maxHeight: '80vh',
              overflowY: 'auto',
              width: '90%',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h2 style={{ color: '#eaecef', fontSize: '16px', fontWeight: 700 }}>
                Histórico do Usuário
              </h2>
              <button
                onClick={() => setShowUserHistory(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#929aa5',
                  fontSize: '20px',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>

            {historyLoading ? (
              <div style={{ color: '#929aa5', textAlign: 'center', padding: '20px' }}>
                Carregando...
              </div>
            ) : userHistory.length === 0 ? (
              <div style={{ color: '#929aa5', textAlign: 'center', padding: '20px' }}>
                Sem histórico de moderação
              </div>
            ) : (
              <div className="space-y-2">
                {userHistory.map((action) => (
                  <div
                    key={action.id}
                    style={{
                      background: '#181a20',
                      border: '1px solid rgba(240, 185, 11, 0.08)',
                      borderRadius: '6px',
                      padding: '12px',
                      fontSize: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span
                        style={{
                          fontWeight: 600,
                          color:
                            action.action === 'APPROVED'
                              ? '#2ebd85'
                              : action.action === 'REMOVED'
                                ? '#f6465d'
                                : '#f59e0b',
                        }}
                      >
                        {action.action === 'APPROVED' && '✓ Aprovado'}
                        {action.action === 'REMOVED' && '🗑 Removido'}
                        {action.action === 'FLAGGED' && '⚠ Flagged'}
                      </span>
                      <span style={{ color: '#929aa5' }}>{getTimeAgo(action.createdAt)}</span>
                    </div>
                    <div style={{ color: '#c5b99a', marginBottom: '6px' }}>
                      &ldquo;{action.post.content.substring(0, 80)}
                      {action.post.content.length > 80 ? '...' : ''}&rdquo;
                    </div>
                    <div style={{ color: '#929aa5', fontSize: '11px' }}>
                      Por: <strong>{action.moderator.name}</strong>
                      {action.reason && ` · ${action.reason}`}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        .fade-in {
          animation: fadeIn 0.3s ease-in;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        .section-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .section-title {
          font-size: 18px;
          font-weight: 700;
          color: #eaecef;
        }

        .section-sub {
          font-size: 12px;
          color: #929aa5;
          margin-top: 2px;
        }

        .sub-tabs {
          display: flex;
          gap: 4px;
          border-bottom: 1px solid rgba(240, 185, 11, 0.1);
        }

        .sub-tab {
          padding: 10px 16px;
          background: transparent;
          border: none;
          color: #929aa5;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
          border-bottom: 2px solid transparent;
          transition: all 0.2s;
        }

        .sub-tab:hover {
          color: #f0b90b;
        }

        .sub-tab.active {
          color: #f0b90b;
          border-bottom-color: #f0b90b;
        }

        .filter-bar {
          display: flex;
          gap: 8px;
        }

        .filter-btn {
          padding: 6px 12px;
          background: transparent;
          border: 1px solid rgba(240, 185, 11, 0.2);
          color: #929aa5;
          border-radius: 6px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 500;
          transition: all 0.2s;
        }

        .filter-btn:hover {
          border-color: #f0b90b;
          color: #f0b90b;
        }

        .filter-btn.active {
          background: rgba(240, 185, 11, 0.1);
          border-color: #f0b90b;
          color: #f0b90b;
        }

        .post-card {
          background: #1e2329;
          border: 1px solid rgba(240, 185, 11, 0.08);
          border-radius: 8px;
          padding: 16px;
        }

        .post-card.flagged {
          border-color: rgba(249, 115, 22, 0.2);
        }

        .post-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 12px;
        }

        .post-author {
          font-weight: 600;
          color: #eaecef;
          font-size: 14px;
        }

        .badge {
          display: inline-block;
          padding: 2px 6px;
          border-radius: 3px;
          font-size: 10px;
          font-weight: 500;
          margin-left: 4px;
        }

        .post-meta {
          font-size: 12px;
          color: #929aa5;
          margin-top: 4px;
        }

        .post-text {
          color: #c5b99a;
          font-size: 14px;
          margin-bottom: 12px;
          line-height: 1.4;
        }

        .post-actions {
          display: flex;
          gap: 8px;
        }

        .btn {
          padding: 6px 12px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          border: 1px solid;
          transition: all 0.2s;
        }

        .btn-sm {
          padding: 4px 8px;
          font-size: 11px;
        }

        .btn-outline {
          background: transparent;
        }

        .card {
          background: #1e2329;
          border: 1px solid rgba(240, 185, 11, 0.1);
          border-radius: 8px;
          padding: 16px;
        }

        .card-title {
          font-size: 13px;
          font-weight: 700;
          color: #eaecef;
          margin-bottom: 12px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .word-chip {
          display: inline-block;
          background: rgba(240, 185, 11, 0.1);
          color: #f0b90b;
          padding: 6px 10px;
          border-radius: 4px;
          margin-right: 8px;
          margin-bottom: 8px;
          font-size: 12px;
          font-weight: 500;
        }

        .word-chip button {
          background: none;
          border: none;
          color: #f0b90b;
          cursor: pointer;
          margin-left: 4px;
          font-weight: bold;
          transition: all 0.2s;
        }

        .word-chip button:hover {
          color: #f6465d;
        }

        .field-inp {
          background: #181a20;
          border: 1px solid rgba(240, 185, 11, 0.1);
          color: #eaecef;
          padding: 8px 12px;
          border-radius: 4px;
          font-size: 12px;
          outline: none;
          transition: all 0.2s;
        }

        .field-inp:focus {
          border-color: #f0b90b;
          box-shadow: 0 0 0 2px rgba(240, 185, 11, 0.1);
        }

        .field-inp::placeholder {
          color: #929aa5;
        }

        .btn-solid {
          background: #f0b90b !important;
          color: #0b0e11 !important;
          border: none !important;
        }

        .btn-solid:hover {
          opacity: 0.9;
        }

        .space-y-3 {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .space-y-2 {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
      `}</style>
    </div>
  )
}
