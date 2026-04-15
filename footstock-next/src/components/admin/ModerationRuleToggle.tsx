'use client'

import { useState } from 'react'

interface ModerationRuleToggleProps {
  rule: {
    id: string
    name: string
    description: string
    isEnabled: boolean
    updatedAt: string
  }
  onToggle?: (name: string, isEnabled: boolean) => void
}

const RULE_LABELS: Record<string, string> = {
  new_user_with_links: 'Novo usuário com links',
  spam_frequency: 'Frequência de spam',
  false_promises: 'Promessas falsas de ganho',
  residual_pii: 'Dados pessoais residuais',
  foreign_spam: 'Spam em idioma estrangeiro',
}

export function ModerationRuleToggle({ rule, onToggle }: ModerationRuleToggleProps) {
  const [isEnabled, setIsEnabled] = useState(rule.isEnabled)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleToggle = async () => {
    const newValue = !isEnabled
    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/v1/admin/moderation/content-rules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: rule.name, isEnabled: newValue }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error?.message ?? 'Erro ao atualizar regra.')
      }

      setIsEnabled(newValue)
      onToggle?.(rule.name, newValue)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao atualizar.')
    } finally {
      setIsLoading(false)
    }
  }

  const label = RULE_LABELS[rule.name] ?? rule.name
  const updatedAt = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(rule.updatedAt))

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: '1rem',
        padding: '0.875rem 1rem',
        borderRadius: '0.5rem',
        border: '1px solid var(--border)',
        background: isEnabled ? 'var(--accent-subtle, rgba(255,193,7,0.05))' : 'var(--surface)',
      }}
    >
      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
          <span
            style={{
              display: 'inline-block',
              width: '0.5rem',
              height: '0.5rem',
              borderRadius: '50%',
              background: isEnabled ? '#22c55e' : 'var(--muted-foreground)',
              flexShrink: 0,
            }}
          />
          <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--foreground)' }}>
            {label}
          </span>
        </div>
        <p
          style={{
            fontSize: '0.75rem',
            color: 'var(--muted-foreground)',
            margin: 0,
            lineHeight: 1.4,
          }}
        >
          {rule.description}
        </p>
        <p style={{ fontSize: '0.7rem', color: 'var(--muted-foreground)', margin: '0.25rem 0 0' }}>
          Atualizado em {updatedAt}
        </p>
        {error && (
          <p
            role="alert"
            style={{ fontSize: '0.75rem', color: 'var(--destructive)', margin: '0.25rem 0 0' }}
          >
            {error}
          </p>
        )}
      </div>

      {/* Toggle switch */}
      <button
        role="switch"
        aria-checked={isEnabled}
        aria-label={`${isEnabled ? 'Desabilitar' : 'Habilitar'} regra: ${label}`}
        onClick={handleToggle}
        disabled={isLoading}
        style={{
          flexShrink: 0,
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          width: '2.75rem',
          height: '1.5rem',
          borderRadius: '9999px',
          border: 'none',
          cursor: isLoading ? 'not-allowed' : 'pointer',
          transition: 'background-color 0.2s',
          background: isEnabled ? '#22c55e' : 'var(--muted)',
          opacity: isLoading ? 0.6 : 1,
        }}
      >
        <span
          style={{
            position: 'absolute',
            left: isEnabled ? '1.375rem' : '0.125rem',
            width: '1.25rem',
            height: '1.25rem',
            borderRadius: '50%',
            background: '#fff',
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            transition: 'left 0.2s',
          }}
        />
        {isLoading && (
          <span
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span
              style={{
                width: '0.75rem',
                height: '0.75rem',
                border: '2px solid rgba(255,255,255,0.6)',
                borderTopColor: '#fff',
                borderRadius: '50%',
                animation: 'spin 0.6s linear infinite',
              }}
            />
          </span>
        )}
      </button>
    </div>
  )
}
