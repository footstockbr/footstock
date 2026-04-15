'use client'

import { useState, useEffect } from 'react'
import { Trash2, Clock, AlertTriangle } from 'lucide-react'
import { AdminModeracaoStats } from '@/components/admin/AdminModeracaoStats'
import { ModerationRuleToggle } from '@/components/admin/ModerationRuleToggle'

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
  updatedAt?: string
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

type FilterType = 'flagged' | 'ok' | 'removed' | 'todos'

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

  if (seconds < 60) return `${seconds}s atras`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m atras`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h atras`
  return `${Math.floor(seconds / 86400)}d atras`
}

export default function AdminModeracaoPage() {
  const [subTab, setSubTab] = useState<'fila' | 'palavras' | 'regras'>('fila')
  const [filter, setFilter] = useState<FilterType>('flagged')
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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [singleDeleteConfirmId, setSingleDeleteConfirmId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [actionLoadingPostId, setActionLoadingPostId] = useState<string | null>(null)
  const [banConfirmPostId, setBanConfirmPostId] = useState<string | null>(null)
  const [banReason, setBanReason] = useState('')
  const [banError, setBanError] = useState<string | null>(null)
  const [moderationRules, setModerationRules] = useState<Array<{
    id: number; name: string; description: string; enabled: boolean; config?: Record<string, unknown>
  }>>([])
  const [rulesLoading, setRulesLoading] = useState(false)
  const [rulesError, setRulesError] = useState<string | null>(null)
  // Regras de conteúdo configuráveis (T-028)
  const [contentRules, setContentRules] = useState<Array<{
    id: string; name: string; description: string; isEnabled: boolean; updatedAt: string
  }>>([])
  const [contentRulesLoading, setContentRulesLoading] = useState(false)

  useEffect(() => {
    fetchData()
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
      setDeleteError(null)
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

  const fetchRules = async () => {
    setRulesLoading(true)
    setRulesError(null)
    try {
      const res = await fetch('/api/v1/admin/moderation/rules', { credentials: 'include' })
      const data = await res.json()
      if (res.ok) {
        setModerationRules(data.data || [])
      } else {
        setRulesError(data.error?.message || 'Erro ao carregar regras.')
      }
    } catch {
      setRulesError('Erro de conexão ao carregar regras.')
    } finally {
      setRulesLoading(false)
    }
  }

  const fetchContentRules = async () => {
    setContentRulesLoading(true)
    try {
      const res = await fetch('/api/v1/admin/moderation/content-rules', { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setContentRules(data.data || [])
      }
    } catch {
      // Silencioso — não bloquear a UI
    } finally {
      setContentRulesLoading(false)
    }
  }

  const handleToggleRule = async (ruleId: number, enabled: boolean) => {
    try {
      const res = await fetch('/api/v1/admin/moderation/rules', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: ruleId, enabled }),
      })
      if (res.ok) {
        setModerationRules((prev) =>
          prev.map((r) => (r.id === ruleId ? { ...r, enabled } : r))
        )
      }
    } catch {
      // falha silenciosa — estado local não é revertido para não confundir UX
    }
  }

  const handleApprovePost = async (postId: string) => {
    if (actionLoadingPostId) return
    setActionLoadingPostId(postId)
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
    } finally {
      setActionLoadingPostId(null)
    }
  }

  const handleRemovePost = async (postId: string) => {
    if (actionLoadingPostId) return
    setActionLoadingPostId(postId)
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
    } finally {
      setActionLoadingPostId(null)
    }
  }

  const handlePermanentDeletePost = async (postId: string) => {
    if (actionLoadingPostId) return
    setActionLoadingPostId(postId)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/v1/admin/moderation/${postId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (res.ok) {
        setPosts(posts.filter((p) => p.id !== postId))
        setSingleDeleteConfirmId(null)
      } else {
        const data = await res.json()
        setDeleteError(data.error?.message || 'Erro ao deletar permanentemente')
      }
    } catch (error) {
      console.error('Error permanent deleting post:', error)
      setDeleteError('Erro ao deletar permanentemente')
    } finally {
      setActionLoadingPostId(null)
    }
  }

  const handleBanUser = async (postId: string) => {
    if (actionLoadingPostId) return
    setActionLoadingPostId(postId)
    setBanError(null)
    try {
      const res = await fetch(`/api/v1/admin/moderation/${postId}?action=ban_user`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: banReason || 'Violação das regras de moderação' }),
      })
      if (res.ok) {
        setPosts(posts.filter((p) => p.id !== postId))
        setBanConfirmPostId(null)
        setBanReason('')
      } else {
        const data = await res.json()
        setBanError(data.error?.message || 'Erro ao banir usuário')
      }
    } catch {
      setBanError('Erro de conexão ao banir usuário')
    } finally {
      setActionLoadingPostId(null)
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

  const handleBulkPermanentDelete = async () => {
    if (selectedPostIds.size === 0) return

    setBulkLoading(true)
    setDeleteError(null)
    try {
      const res = await fetch('/api/v1/admin/moderation/bulk', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postIds: Array.from(selectedPostIds),
        }),
      })

      if (res.ok) {
        const deletedIds = Array.from(selectedPostIds)
        setPosts(posts.filter((p) => !deletedIds.includes(p.id)))
        setSelectedPostIds(new Set())
        setShowDeleteConfirm(false)
      } else {
        const data = await res.json()
        setDeleteError(data.error?.message || 'Erro ao deletar permanentemente')
      }
    } catch (error) {
      console.error('Error bulk permanent delete:', error)
      setDeleteError('Erro ao deletar permanentemente')
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

  const isRemovedFilter = filter === 'removed'

  return (
    <div data-testid="page-admin-moderacao" className="space-y-6">
      {/* Header */}
      <div data-testid="admin-moderacao-header" className="fade-in">
        <div className="section-header mb-4">
          <div>
            <div className="section-title">Moderacao</div>
            <div className="section-sub">{posts.length} posts {isRemovedFilter ? 'reprovados' : 'aguardando revisao'}</div>
          </div>
          {recentActions.length > 0 && (
            <button
              data-testid="admin-moderacao-notifications-button"
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
              {recentActions.length} acoes
            </button>
          )}
        </div>

        <AdminModeracaoStats />

        {/* Recent Notifications */}
        {showNotifications && recentActions.length > 0 && (
          <div
            data-testid="admin-moderacao-notifications-panel"
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
                data-testid={`admin-moderacao-notification-${action.id}`}
                style={{
                  padding: '8px',
                  borderBottom: '1px solid rgba(240, 185, 11, 0.05)',
                  fontSize: '11px',
                  color: '#929aa5',
                }}
              >
                <span style={{ fontWeight: 600, color: '#f0b90b' }}>
                  {action.action === 'APPROVED' && 'Aprovado'}
                  {action.action === 'REMOVED' && 'Removido'}
                  {action.action === 'FLAGGED' && 'Flagged'}
                  {action.action === 'PERMANENTLY_DELETED' && 'Deletado permanentemente'}
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
        <div data-testid="admin-moderacao-subtabs" className="sub-tabs mb-4">
          <button
            data-testid="admin-moderacao-subtab-fila-button"
            className={`sub-tab ${subTab === 'fila' ? 'active' : ''}`}
            onClick={() => setSubTab('fila')}
          >
            Fila de Posts
          </button>
          <button
            data-testid="admin-moderacao-subtab-palavras-button"
            className={`sub-tab ${subTab === 'palavras' ? 'active' : ''}`}
            onClick={() => setSubTab('palavras')}
          >
            Palavras Bloqueadas
          </button>
          <button
            data-testid="admin-moderacao-subtab-regras-button"
            className={`sub-tab ${subTab === 'regras' ? 'active' : ''}`}
            onClick={() => { setSubTab('regras'); if (moderationRules.length === 0) fetchRules(); if (contentRules.length === 0) fetchContentRules() }}
          >
            Regras Auto-Mod
          </button>
        </div>

        {/* Fila de Posts */}
        {subTab === 'fila' && (
          <>
            {/* Filter Bar */}
            <div data-testid="admin-moderacao-filter-bar" className="filter-bar mb-4">
              <button
                data-testid="admin-moderacao-filter-flagged-button"
                className={`filter-btn ${filter === 'flagged' ? 'active' : ''}`}
                onClick={() => setFilter('flagged')}
              >
                Suspeitos
              </button>
              <button
                data-testid="admin-moderacao-filter-ok-button"
                className={`filter-btn ${filter === 'ok' ? 'active' : ''}`}
                onClick={() => setFilter('ok')}
              >
                Aprovados
              </button>
              <button
                data-testid="admin-moderacao-filter-removed-button"
                className={`filter-btn ${filter === 'removed' ? 'active' : ''}`}
                onClick={() => setFilter('removed')}
                style={filter === 'removed' ? {
                  background: 'rgba(246, 70, 93, 0.1)',
                  borderColor: '#f6465d',
                  color: '#f6465d',
                } : undefined}
              >
                <Trash2 size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                Reprovados
              </button>
              <button
                data-testid="admin-moderacao-filter-todos-button"
                className={`filter-btn ${filter === 'todos' ? 'active' : ''}`}
                onClick={() => setFilter('todos')}
              >
                Todos
              </button>
            </div>

            {/* Bulk Actions — standard (approve/remove) for non-removed filters */}
            {selectedPostIds.size > 0 && !isRemovedFilter && (
              <div
                data-testid="admin-moderacao-bulk-actions"
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
                  data-testid="admin-moderacao-bulk-approve-button"
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
                  Aprovar tudo
                </button>
                <button
                  data-testid="admin-moderacao-bulk-remove-button"
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
                  Remover tudo
                </button>
              </div>
            )}

            {/* Bulk Actions — permanent delete for removed filter */}
            {selectedPostIds.size > 0 && isRemovedFilter && (
              <div
                data-testid="admin-moderacao-bulk-actions-removed"
                className="bulk-actions"
                style={{
                  display: 'flex',
                  gap: '8px',
                  marginBottom: '16px',
                  padding: '12px',
                  background: 'rgba(246, 70, 93, 0.05)',
                  border: '1px solid rgba(246, 70, 93, 0.2)',
                  borderRadius: '6px',
                  alignItems: 'center',
                }}
              >
                <span style={{ flex: 1, color: '#929aa5', fontSize: '12px' }}>
                  {selectedPostIds.size} post{selectedPostIds.size !== 1 ? 's' : ''} selecionado
                  {selectedPostIds.size !== 1 ? 's' : ''}
                </span>
                <button
                  data-testid="admin-moderacao-bulk-permanent-delete-button"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={bulkLoading}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'rgba(246, 70, 93, 0.1)',
                    color: '#f6465d',
                    border: '1px solid #f6465d',
                    padding: '8px 16px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: bulkLoading ? 'not-allowed' : 'pointer',
                    opacity: bulkLoading ? 0.5 : 1,
                  }}
                >
                  <Trash2 size={14} />
                  Deletar permanentemente
                </button>
              </div>
            )}

            {/* Delete error feedback */}
            {deleteError && (
              <div
                data-testid="admin-moderacao-delete-error"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '12px',
                  padding: '10px 14px',
                  background: 'rgba(246, 70, 93, 0.08)',
                  border: '1px solid rgba(246, 70, 93, 0.2)',
                  borderRadius: '6px',
                  color: '#f6465d',
                  fontSize: '12px',
                }}
              >
                <AlertTriangle size={14} />
                {deleteError}
              </div>
            )}

            {/* Select All + Auto-cleanup info */}
            {posts.length > 0 && (
              <div
                data-testid="admin-moderacao-select-all-bar"
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
                  data-testid="admin-moderacao-select-all-checkbox"
                  type="checkbox"
                  checked={selectedPostIds.size === posts.length && posts.length > 0}
                  onChange={toggleAllSelection}
                  style={{ cursor: 'pointer' }}
                />
                <span
                  data-testid="admin-moderacao-select-all-label"
                  onClick={toggleAllSelection}
                  style={{ cursor: 'pointer' }}
                >
                  Selecionar tudo nesta pagina
                </span>
                {isRemovedFilter && (
                  <span
                    data-testid="admin-moderacao-auto-cleanup-info"
                    style={{
                      marginLeft: 'auto',
                      fontSize: '11px',
                      color: '#929aa5',
                      background: 'rgba(240, 185, 11, 0.06)',
                      padding: '4px 8px',
                      borderRadius: '4px',
                    }}
                  >
                    Limpeza automatica: posts reprovados sao deletados apos 10 dias
                  </span>
                )}
              </div>
            )}

            {/* Posts */}
            <div className="space-y-3">
              {loading ? (
                <div data-testid="admin-moderacao-loading" className="text-center py-8 text-[#929AA5]">Carregando posts...</div>
              ) : posts.length === 0 ? (
                <div data-testid="admin-moderacao-empty" className="text-center py-8 text-[#929AA5]">
                  {isRemovedFilter ? 'Nenhum post reprovado encontrado' : 'Nenhum post encontrado'}
                </div>
              ) : (
                posts.map((post) => {
                  const badgeColor = post.isDeleted
                    ? '#f6465d'
                    : post.isFlagged
                      ? 'var(--orange)'
                      : 'var(--green)'
                  const badgeLabel = post.isDeleted
                    ? 'REPROVADO'
                    : post.isFlagged
                      ? 'SUSPEITO'
                      : 'APROVADO'

                  return (
                    <div
                      key={post.id}
                      data-testid={`admin-moderacao-post-card-${post.id}`}
                      className={`post-card ${post.isFlagged ? 'flagged' : ''} ${post.isDeleted ? 'removed' : ''}`}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '12px',
                        }}
                      >
                        <input
                          data-testid={`admin-moderacao-post-checkbox-${post.id}`}
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
                                  data-testid={`admin-moderacao-post-author-${post.id}`}
                                  onClick={() => handleShowUserHistory(post.user.id)}
                                  style={{ color: '#eaecef', textDecoration: 'underline' }}
                                >
                                  {post.user.name}
                                </span>{' '}
                                <span
                                  data-testid={`admin-moderacao-post-plan-badge-${post.id}`}
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
                                {post.ticker && <>{post.ticker} · </>}
                                {getTimeAgo(post.createdAt)} ·{' '}
                                <span style={{ color: 'var(--orange)' }}>
                                  {post.flagCount} denuncia{post.flagCount !== 1 ? 's' : ''}
                                </span>
                              </div>
                            </div>
                            <span
                              data-testid={`admin-moderacao-post-status-badge-${post.id}`}
                              className="badge"
                              style={{
                                color: badgeColor,
                                background:
                                  post.isDeleted
                                    ? 'rgba(246,70,93,.12)'
                                    : post.isFlagged
                                      ? 'rgba(249,115,22,.12)'
                                      : 'rgba(46,189,133,.12)',
                              }}
                            >
                              {badgeLabel}
                            </span>
                          </div>
                          <div data-testid={`admin-moderacao-post-content-${post.id}`} className="post-text">{post.content}</div>

                          {/* Moderation History */}
                          {post.moderationActions.length > 0 && (
                            <div
                              data-testid={`admin-moderacao-post-history-${post.id}`}
                              style={{
                                fontSize: '10px',
                                color: '#929aa5',
                                marginTop: '8px',
                                borderTop: '1px solid rgba(240, 185, 11, 0.08)',
                                paddingTop: '8px',
                              }}
                            >
                              <Clock size={12} style={{ display: 'inline', marginRight: '4px' }} />
                              <span>Historico: </span>
                              {post.moderationActions.slice(0, 2).map((action, idx) => (
                                <span key={idx} style={{ marginRight: '8px' }}>
                                  {action.action === 'APPROVED' && 'Aprovado'}
                                  {action.action === 'REMOVED' && 'Removido'}
                                  {action.action === 'FLAGGED' && 'Flagged'}
                                  {action.action === 'PERMANENTLY_DELETED' && 'Deletado'}
                                  {' por '}
                                  <strong>{action.moderator.name}</strong>
                                  {' · '}
                                  {getTimeAgo(action.createdAt)}
                                </span>
                              ))}
                            </div>
                          )}

                          <div className="post-actions">
                            {isRemovedFilter ? (
                              /* In Reprovados tab: permanent delete with inline confirm */
                              singleDeleteConfirmId === post.id ? (
                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                  <span style={{ fontSize: '11px', color: '#f6465d' }}>Tem certeza?</span>
                                  <button
                                    data-testid={`admin-moderacao-post-confirm-delete-button-${post.id}`}
                                    onClick={() => handlePermanentDeletePost(post.id)}
                                    disabled={actionLoadingPostId === post.id}
                                    className="btn btn-sm"
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      background: '#f6465d',
                                      color: '#fff',
                                      border: 'none',
                                      opacity: actionLoadingPostId === post.id ? 0.6 : 1,
                                    }}
                                  >
                                    <Trash2 size={12} />
                                    {actionLoadingPostId === post.id ? 'Deletando...' : 'Confirmar'}
                                  </button>
                                  <button
                                    data-testid={`admin-moderacao-post-cancel-delete-button-${post.id}`}
                                    onClick={() => setSingleDeleteConfirmId(null)}
                                    className="btn btn-sm btn-outline"
                                    style={{
                                      background: 'transparent',
                                      color: '#929aa5',
                                      borderColor: '#929aa5',
                                    }}
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              ) : (
                                <button
                                  data-testid={`admin-moderacao-post-permanent-delete-button-${post.id}`}
                                  onClick={() => setSingleDeleteConfirmId(post.id)}
                                  className="btn btn-sm btn-outline"
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    background: 'transparent',
                                    color: '#f6465d',
                                    borderColor: '#f6465d',
                                  }}
                                >
                                  <Trash2 size={12} />
                                  Deletar permanentemente
                                </button>
                              )
                            ) : (
                              /* Standard approve/remove buttons */
                              <>
                                <button
                                  data-testid={`admin-moderacao-post-approve-button-${post.id}`}
                                  onClick={() => handleApprovePost(post.id)}
                                  disabled={actionLoadingPostId === post.id}
                                  className="btn btn-sm btn-outline"
                                  style={{
                                    background: 'transparent',
                                    color: 'var(--green)',
                                    borderColor: 'var(--green)',
                                    opacity: actionLoadingPostId === post.id ? 0.6 : 1,
                                  }}
                                >
                                  {actionLoadingPostId === post.id ? 'Aprovando...' : 'Aprovar'}
                                </button>
                                <button
                                  data-testid={`admin-moderacao-post-remove-button-${post.id}`}
                                  onClick={() => handleRemovePost(post.id)}
                                  disabled={actionLoadingPostId === post.id}
                                  className="btn btn-sm btn-outline"
                                  style={{
                                    background: 'transparent',
                                    color: 'var(--red)',
                                    borderColor: 'var(--red)',
                                    opacity: actionLoadingPostId === post.id ? 0.6 : 1,
                                  }}
                                >
                                  {actionLoadingPostId === post.id ? 'Removendo...' : 'Remover'}
                                </button>
                                {banConfirmPostId === post.id ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                                    <input
                                      data-testid={`admin-moderacao-ban-reason-input-${post.id}`}
                                      className="field-inp"
                                      placeholder="Motivo do banimento (opcional)"
                                      value={banReason}
                                      onChange={(e) => setBanReason(e.target.value)}
                                      style={{ fontSize: '12px', padding: '4px 8px' }}
                                    />
                                    {banError && <p style={{ color: 'var(--red)', fontSize: '11px' }}>{banError}</p>}
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                      <button
                                        data-testid={`admin-moderacao-ban-confirm-button-${post.id}`}
                                        onClick={() => handleBanUser(post.id)}
                                        disabled={actionLoadingPostId === post.id}
                                        className="btn btn-sm"
                                        style={{ background: '#7B1818', color: '#fff', fontSize: '11px', opacity: actionLoadingPostId === post.id ? 0.6 : 1 }}
                                      >
                                        {actionLoadingPostId === post.id ? 'Banindo...' : 'Confirmar Banimento'}
                                      </button>
                                      <button
                                        onClick={() => { setBanConfirmPostId(null); setBanReason(''); setBanError(null) }}
                                        className="btn btn-sm btn-outline"
                                        style={{ fontSize: '11px' }}
                                      >
                                        Cancelar
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <button
                                    data-testid={`admin-moderacao-post-ban-button-${post.id}`}
                                    onClick={() => { setBanConfirmPostId(post.id); setBanError(null) }}
                                    disabled={actionLoadingPostId === post.id}
                                    className="btn btn-sm btn-outline"
                                    style={{
                                      background: 'transparent',
                                      color: '#c53030',
                                      borderColor: '#c53030',
                                      opacity: actionLoadingPostId === post.id ? 0.6 : 1,
                                    }}
                                  >
                                    Banir Usuário
                                  </button>
                                )}
                              </>
                            )}
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
          <div data-testid="admin-moderacao-palavras-section">
            <div data-testid="admin-moderacao-palavras-card" className="card">
              <div className="card-title">PALAVRAS BLOQUEADAS ({blockedWords.length})</div>
              <div data-testid="admin-moderacao-palavras-list" style={{ marginBottom: '12px' }}>
                {blockedWords.map((word) => (
                  <span key={word} data-testid={`admin-moderacao-palavra-chip-${word}`} className="word-chip">
                    {word}
                    <button
                      data-testid={`admin-moderacao-palavra-remove-${word}-button`}
                      onClick={() => handleRemoveWord(word)}
                    >
                      X
                    </button>
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  data-testid="admin-moderacao-nova-palavra-input"
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
                  data-testid="admin-moderacao-nova-palavra-add-button"
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

            <div data-testid="admin-moderacao-auto-deteccao-card" className="card">
              <div className="card-title">AUTO-DETECCAO</div>
              <div style={{ fontSize: '11px', color: 'var(--text)', lineHeight: '1.6' }}>
                Posts contendo palavras da lista sao automaticamente marcados como{' '}
                <span style={{ color: 'var(--orange)', fontWeight: '700' }}>suspeitos</span> e
                adicionados a fila de revisao. Moderadores sao notificados em tempo real.
              </div>
            </div>
          </div>
        )}

        {/* Regras de Auto-Moderação */}
        {subTab === 'regras' && (
          <div data-testid="admin-moderacao-regras-section">
            <div className="card">
              <div className="card-title">REGRAS DE AUTO-MODERAÇÃO</div>
              <p style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '16px', lineHeight: '1.6' }}>
                Regras aplicadas automaticamente a cada post publicado. Alterações requerem role SUPER_ADMIN.
              </p>
              {rulesLoading && <p style={{ color: 'var(--muted)', fontSize: '12px' }}>Carregando regras...</p>}
              {rulesError && <p style={{ color: 'var(--red)', fontSize: '12px' }}>{rulesError}</p>}
              {!rulesLoading && !rulesError && moderationRules.map((rule) => (
                <div
                  key={rule.id}
                  data-testid={`admin-moderacao-rule-${rule.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    padding: '10px 0',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    gap: '12px',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', marginBottom: '2px' }}>
                      {rule.name}
                    </p>
                    <p style={{ fontSize: '11px', color: 'var(--muted)' }}>{rule.description}</p>
                  </div>
                  <button
                    data-testid={`admin-moderacao-rule-toggle-${rule.id}`}
                    onClick={() => handleToggleRule(rule.id, !rule.enabled)}
                    style={{
                      flexShrink: 0,
                      padding: '4px 12px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 600,
                      border: '1px solid',
                      cursor: 'pointer',
                      background: rule.enabled ? 'rgba(240,185,11,0.15)' : 'transparent',
                      color: rule.enabled ? 'var(--accent)' : 'var(--muted)',
                      borderColor: rule.enabled ? 'var(--accent)' : 'var(--muted)',
                    }}
                  >
                    {rule.enabled ? 'ATIVO' : 'INATIVO'}
                  </button>
                </div>
              ))}
              {!rulesLoading && !rulesError && moderationRules.length === 0 && (
                <p style={{ color: 'var(--muted)', fontSize: '12px' }}>Nenhuma regra encontrada.</p>
              )}
            </div>

            {/* Regras de Conteúdo (T-028) */}
            <div className="card" style={{ marginTop: '16px' }}>
              <div className="card-title">REGRAS DE CONTEÚDO (T-028)</div>
              <p style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '12px', lineHeight: '1.6' }}>
                Posts que ativam uma regra ficam com status <strong>Aguardando</strong> até aprovação. A sanitização
                de CPF/CNPJ/e-mail/URLs é sempre ativa e não pode ser desabilitada. Regras gerenciadas pelo MODERADOR+.
              </p>
              {contentRulesLoading && (
                <p style={{ color: 'var(--muted)', fontSize: '12px' }}>Carregando regras de conteúdo...</p>
              )}
              {!contentRulesLoading && contentRules.length === 0 && (
                <p style={{ color: 'var(--muted)', fontSize: '12px' }}>
                  Nenhuma regra de conteúdo. Execute o seed de contentModerationRules.
                </p>
              )}
              {!contentRulesLoading && contentRules.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {contentRules.map((rule) => (
                    <ModerationRuleToggle
                      key={rule.id}
                      rule={rule}
                      onToggle={() => fetchContentRules()}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* User History Modal */}
      {showUserHistory && (
        <div
          data-testid="admin-moderacao-user-history-overlay"
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
            data-testid="admin-moderacao-user-history-modal"
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
                Historico do Usuario
              </h2>
              <button
                data-testid="admin-moderacao-user-history-close-button"
                onClick={() => setShowUserHistory(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#929aa5',
                  fontSize: '20px',
                  cursor: 'pointer',
                }}
              >
                X
              </button>
            </div>

            {historyLoading ? (
              <div data-testid="admin-moderacao-user-history-loading" style={{ color: '#929aa5', textAlign: 'center', padding: '20px' }}>
                Carregando...
              </div>
            ) : userHistory.length === 0 ? (
              <div data-testid="admin-moderacao-user-history-empty" style={{ color: '#929aa5', textAlign: 'center', padding: '20px' }}>
                Sem historico de moderacao
              </div>
            ) : (
              <div className="space-y-2">
                {userHistory.map((action) => (
                  <div
                    key={action.id}
                    data-testid={`admin-moderacao-user-history-item-${action.id}`}
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
                                : action.action === 'PERMANENTLY_DELETED'
                                  ? '#f6465d'
                                  : '#f59e0b',
                        }}
                      >
                        {action.action === 'APPROVED' && 'Aprovado'}
                        {action.action === 'REMOVED' && 'Removido'}
                        {action.action === 'FLAGGED' && 'Flagged'}
                        {action.action === 'PERMANENTLY_DELETED' && 'Deletado permanentemente'}
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

      {/* Permanent Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div
          data-testid="admin-moderacao-delete-confirm-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div
            data-testid="admin-moderacao-delete-confirm-modal"
            style={{
              background: '#1e2329',
              border: '1px solid rgba(246, 70, 93, 0.3)',
              borderRadius: '8px',
              padding: '24px',
              maxWidth: '440px',
              width: '90%',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <AlertTriangle size={20} style={{ color: '#f6465d' }} />
              <h2 style={{ color: '#eaecef', fontSize: '16px', fontWeight: 700, margin: 0 }}>
                Confirmar exclusao permanente
              </h2>
            </div>

            <p style={{ color: '#929aa5', fontSize: '13px', lineHeight: '1.5', marginBottom: '20px' }}>
              Voce esta prestes a deletar permanentemente{' '}
              <strong style={{ color: '#f6465d' }}>{selectedPostIds.size}</strong>{' '}
              post{selectedPostIds.size !== 1 ? 's' : ''}. Esta acao e irreversivel e os dados serao
              removidos do banco de dados.
            </p>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                data-testid="admin-moderacao-delete-confirm-cancel-button"
                onClick={() => setShowDeleteConfirm(false)}
                style={{
                  background: 'transparent',
                  color: '#929aa5',
                  border: '1px solid rgba(146, 154, 165, 0.3)',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                data-testid="admin-moderacao-delete-confirm-button"
                onClick={handleBulkPermanentDelete}
                disabled={bulkLoading}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: '#f6465d',
                  color: '#fff',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: bulkLoading ? 'not-allowed' : 'pointer',
                  opacity: bulkLoading ? 0.6 : 1,
                }}
              >
                <Trash2 size={14} />
                {bulkLoading ? 'Deletando...' : 'Deletar permanentemente'}
              </button>
            </div>
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
          display: flex;
          align-items: center;
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

        .post-card.removed {
          border-color: rgba(246, 70, 93, 0.2);
          opacity: 0.85;
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
