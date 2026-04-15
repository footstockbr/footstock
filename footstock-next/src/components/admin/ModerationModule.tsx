'use client'

import { useState, useEffect, useCallback } from 'react'
import { ModerationRuleToggle } from './ModerationRuleToggle'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface ModerationPost {
  id: string
  content: string
  contentRaw: string | null
  ticker: string | null
  flaggedBy: string[]
  flagCount: number
  status: 'FLAGGED' | 'APPROVED' | 'REJECTED' | 'PUBLISHED'
  author: { id: string; name: string; plan: string }
  createdAt: string
}

interface ContentRule {
  id: string
  name: string
  description: string
  isEnabled: boolean
  updatedAt: string
}

type FilterStatus = 'FLAGGED' | 'APPROVED' | 'REJECTED'

const RULE_LABELS: Record<string, string> = {
  new_user_with_links: 'Novo usuário c/ link',
  spam_frequency: 'Spam frequente',
  false_promises: 'Promessa de ganho',
  residual_pii: 'Dado pessoal residual',
  foreign_spam: 'Spam estrangeiro',
}

const STATUS_COLORS: Record<string, string> = {
  FLAGGED: '#f59e0b',
  APPROVED: '#22c55e',
  REJECTED: '#ef4444',
  PUBLISHED: 'var(--muted-foreground)',
}

const STATUS_LABELS: Record<string, string> = {
  FLAGGED: 'Aguardando',
  APPROVED: 'Aprovado',
  REJECTED: 'Rejeitado',
  PUBLISHED: 'Publicado',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTimeAgo(createdAt: string): string {
  const seconds = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000)
  if (seconds < 60) return `${seconds}s atrás`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m atrás`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h atrás`
  return `${Math.floor(seconds / 86400)}d atrás`
}

// ---------------------------------------------------------------------------
// ModerationModule
// ---------------------------------------------------------------------------

export function ModerationModule() {
  const [activeFilter, setActiveFilter] = useState<FilterStatus>('FLAGGED')
  const [posts, setPosts] = useState<ModerationPost[]>([])
  const [rules, setRules] = useState<ContentRule[]>([])
  const [isLoadingPosts, setIsLoadingPosts] = useState(true)
  const [isLoadingRules, setIsLoadingRules] = useState(true)
  const [postsError, setPostsError] = useState<string | null>(null)
  const [pendingCount, setPendingCount] = useState(0)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [showRaw, setShowRaw] = useState<string | null>(null)

  // ─── Carregar posts por status ───────────────────────────────────────────
  const loadPosts = useCallback(async (filter: FilterStatus) => {
    setIsLoadingPosts(true)
    setPostsError(null)
    try {
      const res = await fetch(`/api/v1/admin/moderation?filter=${filter.toLowerCase()}`, { credentials: 'include' })
      if (!res.ok) throw new Error('Erro ao carregar posts.')
      const data = await res.json()
      const items: ModerationPost[] = (data.data ?? []).map((p: Record<string, unknown>) => ({
        id: p.id,
        content: p.content,
        contentRaw: p.contentRaw ?? null,
        ticker: p.ticker ?? null,
        flaggedBy: Array.isArray(p.flaggedBy) ? (p.flaggedBy as string[]) : [],
        flagCount: (p.flagCount as number) ?? 0,
        status: (p.status as string) ?? 'FLAGGED',
        author: {
          id: (p.user as { id: string })?.id ?? '',
          name: (p.user as { name: string })?.name ?? 'Usuário',
          plan: (p.user as { planType: string })?.planType ?? '',
        },
        createdAt: p.createdAt as string,
      }))
      setPosts(items)
    } catch (e) {
      setPostsError(e instanceof Error ? e.message : 'Erro ao carregar posts.')
    } finally {
      setIsLoadingPosts(false)
    }
  }, [])

  // ─── Carregar count de FLAGGED para badge ───────────────────────────────
  const loadPendingCount = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/admin/moderation/stats', { credentials: 'include' })
      if (!res.ok) return
      const data = await res.json()
      setPendingCount(data.data?.flagged ?? 0)
    } catch {
      // Não crítico
    }
  }, [])

  // ─── Carregar regras de conteúdo ─────────────────────────────────────────
  const loadRules = useCallback(async () => {
    setIsLoadingRules(true)
    try {
      const res = await fetch('/api/v1/admin/moderation/content-rules', { credentials: 'include' })
      if (!res.ok) return
      const data = await res.json()
      setRules(data.data ?? [])
    } catch {
      // Non-critical
    } finally {
      setIsLoadingRules(false)
    }
  }, [])

  useEffect(() => {
    void loadRules()
    void loadPendingCount()
  }, [loadRules, loadPendingCount])

  useEffect(() => {
    void loadPosts(activeFilter)
  }, [activeFilter, loadPosts])

  // ─── Ações de moderação ───────────────────────────────────────────────────
  const handleAction = async (postId: string, action: 'approve' | 'reject') => {
    setActionLoading(postId)
    try {
      const res = await fetch(`/api/v1/admin/moderation/${postId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: action === 'approve' ? 'APPROVED' : 'REMOVED' }),
      })
      if (!res.ok) throw new Error('Erro ao executar ação.')
      // Remover da lista atual
      setPosts((prev) => prev.filter((p) => p.id !== postId))
      if (action === 'approve') {
        setPendingCount((c) => Math.max(0, c - 1))
      } else {
        setPendingCount((c) => Math.max(0, c - 1))
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao executar ação.')
    } finally {
      setActionLoading(null)
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
      {/* ── Coluna Esquerda: Lista de posts ───────────────────────────────── */}
      <div style={{ flex: '1 1 400px', minWidth: 0 }}>
        {/* Header com filtros */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '1rem',
            flexWrap: 'wrap',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--foreground)' }}>
            Posts
            {pendingCount > 0 && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginLeft: '0.5rem',
                  minWidth: '1.25rem',
                  height: '1.25rem',
                  borderRadius: '9999px',
                  background: '#ef4444',
                  color: '#fff',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  padding: '0 0.3rem',
                }}
                aria-label={`${pendingCount} posts aguardando moderação`}
              >
                {pendingCount > 99 ? '99+' : pendingCount}
              </span>
            )}
          </h2>

          {/* Filtros */}
          <div
            role="tablist"
            aria-label="Filtrar posts por status"
            style={{ display: 'flex', gap: '0.25rem', marginLeft: 'auto' }}
          >
            {(['FLAGGED', 'APPROVED', 'REJECTED'] as FilterStatus[]).map((f) => (
              <button
                key={f}
                role="tab"
                aria-selected={activeFilter === f}
                onClick={() => setActiveFilter(f)}
                style={{
                  padding: '0.25rem 0.625rem',
                  borderRadius: '0.375rem',
                  border: '1px solid',
                  borderColor: activeFilter === f ? STATUS_COLORS[f] : 'var(--border)',
                  background: activeFilter === f ? `${STATUS_COLORS[f]}15` : 'transparent',
                  color: activeFilter === f ? STATUS_COLORS[f] : 'var(--muted-foreground)',
                  fontSize: '0.75rem',
                  fontWeight: activeFilter === f ? 600 : 400,
                  cursor: 'pointer',
                }}
              >
                {STATUS_LABELS[f]}
              </button>
            ))}
          </div>
        </div>

        {/* Lista de posts */}
        {isLoadingPosts ? (
          <div
            role="status"
            aria-label="Carregando posts"
            style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
          >
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                style={{
                  height: '7rem',
                  borderRadius: '0.5rem',
                  background: 'var(--muted)',
                  animation: 'pulse 1.5s ease-in-out infinite',
                }}
              />
            ))}
          </div>
        ) : postsError ? (
          <div
            role="alert"
            style={{
              padding: '2rem',
              textAlign: 'center',
              color: 'var(--destructive)',
              borderRadius: '0.5rem',
              border: '1px solid var(--destructive)',
            }}
          >
            <p style={{ margin: '0 0 0.5rem' }}>{postsError}</p>
            <button
              onClick={() => loadPosts(activeFilter)}
              style={{
                padding: '0.375rem 0.75rem',
                borderRadius: '0.375rem',
                background: 'var(--destructive)',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.875rem',
              }}
            >
              Tentar novamente
            </button>
          </div>
        ) : posts.length === 0 ? (
          <div
            style={{
              padding: '3rem',
              textAlign: 'center',
              color: 'var(--muted-foreground)',
              borderRadius: '0.5rem',
              border: '1px dashed var(--border)',
            }}
          >
            <p style={{ margin: 0 }}>Nenhum post com status &quot;{STATUS_LABELS[activeFilter]}&quot;.</p>
          </div>
        ) : (
          <div
            role="list"
            aria-label="Posts para moderação"
            style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
          >
            {posts.map((post) => (
              <article
                key={post.id}
                role="listitem"
                style={{
                  padding: '0.875rem 1rem',
                  borderRadius: '0.5rem',
                  border: `1px solid ${STATUS_COLORS[post.status]}40`,
                  background: 'var(--surface)',
                }}
              >
                {/* Header do post */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: '0.5rem',
                    marginBottom: '0.5rem',
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--foreground)' }}>
                      {post.author.name}
                    </span>
                    <span
                      style={{
                        marginLeft: '0.5rem',
                        fontSize: '0.7rem',
                        color: 'var(--muted-foreground)',
                      }}
                    >
                      {post.author.plan}
                    </span>
                    {post.ticker && (
                      <span
                        style={{
                          marginLeft: '0.5rem',
                          padding: '0.1rem 0.4rem',
                          borderRadius: '9999px',
                          background: 'var(--accent)',
                          color: 'var(--accent-foreground)',
                          fontSize: '0.7rem',
                          fontWeight: 600,
                        }}
                      >
                        {post.ticker}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--muted-foreground)', flexShrink: 0 }}>
                    {getTimeAgo(post.createdAt)}
                  </span>
                </div>

                {/* Conteúdo */}
                <p
                  style={{
                    margin: '0 0 0.5rem',
                    fontSize: '0.875rem',
                    color: 'var(--foreground)',
                    lineHeight: 1.5,
                    wordBreak: 'break-word',
                  }}
                >
                  {post.content}
                </p>

                {/* Conteúdo original (toggle) */}
                {post.contentRaw && (
                  <div style={{ marginBottom: '0.5rem' }}>
                    <button
                      onClick={() => setShowRaw(showRaw === post.id ? null : post.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--muted-foreground)',
                        fontSize: '0.7rem',
                        cursor: 'pointer',
                        padding: 0,
                        textDecoration: 'underline',
                      }}
                    >
                      {showRaw === post.id ? 'Ocultar original' : 'Ver original (com PII)'}
                    </button>
                    {showRaw === post.id && (
                      <p
                        style={{
                          marginTop: '0.25rem',
                          padding: '0.5rem',
                          background: 'var(--destructive-subtle, rgba(239,68,68,0.05))',
                          borderRadius: '0.25rem',
                          fontSize: '0.8rem',
                          color: 'var(--foreground)',
                          border: '1px solid var(--destructive)',
                          wordBreak: 'break-word',
                        }}
                      >
                        {post.contentRaw}
                      </p>
                    )}
                  </div>
                )}

                {/* Regras que ativaram */}
                {post.flaggedBy.length > 0 && (
                  <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginBottom: '0.625rem' }}>
                    {post.flaggedBy.map((ruleId) => (
                      <span
                        key={ruleId}
                        title={`Regra: ${ruleId}`}
                        style={{
                          padding: '0.15rem 0.4rem',
                          borderRadius: '9999px',
                          background: '#f59e0b20',
                          color: '#b45309',
                          fontSize: '0.65rem',
                          fontWeight: 600,
                          border: '1px solid #f59e0b40',
                        }}
                      >
                        {RULE_LABELS[ruleId] ?? ruleId}
                      </span>
                    ))}
                  </div>
                )}

                {/* Ações (apenas para FLAGGED) */}
                {post.status === 'FLAGGED' && (
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={() => handleAction(post.id, 'approve')}
                      disabled={actionLoading === post.id}
                      aria-label={`Aprovar post de ${post.author.name}`}
                      style={{
                        padding: '0.375rem 0.75rem',
                        borderRadius: '0.375rem',
                        background: '#22c55e',
                        color: '#fff',
                        border: 'none',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: actionLoading === post.id ? 'not-allowed' : 'pointer',
                        opacity: actionLoading === post.id ? 0.6 : 1,
                      }}
                    >
                      {actionLoading === post.id ? 'Processando...' : 'Aprovar'}
                    </button>
                    <button
                      onClick={() => handleAction(post.id, 'reject')}
                      disabled={actionLoading === post.id}
                      aria-label={`Rejeitar post de ${post.author.name}`}
                      style={{
                        padding: '0.375rem 0.75rem',
                        borderRadius: '0.375rem',
                        background: '#ef4444',
                        color: '#fff',
                        border: 'none',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: actionLoading === post.id ? 'not-allowed' : 'pointer',
                        opacity: actionLoading === post.id ? 0.6 : 1,
                      }}
                    >
                      {actionLoading === post.id ? 'Processando...' : 'Rejeitar'}
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </div>

      {/* ── Coluna Direita: Regras de conteúdo ────────────────────────────── */}
      <div style={{ width: '280px', flexShrink: 0 }}>
        <h2
          style={{
            margin: '0 0 0.75rem',
            fontSize: '1rem',
            fontWeight: 700,
            color: 'var(--foreground)',
          }}
        >
          Regras de conteúdo
        </h2>
        <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginBottom: '0.75rem' }}>
          Posts que ativam uma regra ficam com status Aguardando até aprovação do admin. A
          sanitização de PII/links é sempre ativa e não pode ser desabilitada.
        </p>

        {isLoadingRules ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                style={{
                  height: '4rem',
                  borderRadius: '0.5rem',
                  background: 'var(--muted)',
                  animation: 'pulse 1.5s ease-in-out infinite',
                }}
              />
            ))}
          </div>
        ) : rules.length === 0 ? (
          <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>
            Nenhuma regra configurada.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {rules.map((rule) => (
              <ModerationRuleToggle
                key={rule.id}
                rule={rule}
                onToggle={() => {
                  // Reload rules para sincronizar estado
                  void loadRules()
                }}
              />
            ))}
          </div>
        )}

        {/* Nota LGPD */}
        <div
          style={{
            marginTop: '1rem',
            padding: '0.75rem',
            borderRadius: '0.5rem',
            background: 'var(--muted)',
            fontSize: '0.7rem',
            color: 'var(--muted-foreground)',
            lineHeight: 1.4,
          }}
        >
          <strong>LGPD:</strong> O conteúdo original (com PII) é armazenado em campo privado com
          prazo de retenção de 90 dias para fins de auditoria e moderação. Apenas admins com
          acesso ao painel podem visualizá-lo.
        </div>
      </div>
    </div>
  )
}
