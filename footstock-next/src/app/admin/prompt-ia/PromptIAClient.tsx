'use client'

import { useEffect, useState, useCallback } from 'react'
import { BrainCircuit, Save, RotateCcw, Loader2 } from 'lucide-react'
import { AdminBreadcrumb } from '@/components/admin/AdminBreadcrumb'
import { cn } from '@/lib/utils'

interface PromptConfig {
  persona: string
  context: string
  analysisGuidelines: string
  riskCriteria: string
  tone: string
  extraInstructions: string
  updatedAt: string | null
  updatedBy: string | null
}

const FIELD_META: { key: keyof PromptConfig; label: string; description: string; rows: number }[] = [
  {
    key: 'persona',
    label: 'Persona do Assessor',
    description: 'Define quem o assessor de IA é. Personalidade, expertise e papel na interação com o usuário.',
    rows: 4,
  },
  {
    key: 'context',
    label: 'Contexto do Foot Stock',
    description: 'Informações sobre a plataforma, moeda virtual, mecânica do mercado e propósito educacional.',
    rows: 5,
  },
  {
    key: 'analysisGuidelines',
    label: 'Diretrizes de Análise',
    description: 'Critérios que o assessor deve considerar ao analisar um ativo: desempenho, mercado, fatores externos, etc.',
    rows: 6,
  },
  {
    key: 'riskCriteria',
    label: 'Critérios de Risco',
    description: 'Definição dos níveis de risco (BAIXO, MEDIO, ALTO) e quando cada um se aplica.',
    rows: 4,
  },
  {
    key: 'tone',
    label: 'Tom e Linguagem',
    description: 'Como o assessor deve se comunicar: formalidade, idioma, complexidade de vocabulário.',
    rows: 3,
  },
  {
    key: 'extraInstructions',
    label: 'Instruções Extras',
    description: 'Regras adicionais, restrições ou instruções especiais. Deixe vazio se não houver.',
    rows: 3,
  },
]

const EMPTY_CONFIG: PromptConfig = {
  persona: '',
  context: '',
  analysisGuidelines: '',
  riskCriteria: '',
  tone: '',
  extraInstructions: '',
  updatedAt: null,
  updatedBy: null,
}

export function PromptIAClient() {
  const [config, setConfig] = useState<PromptConfig>(EMPTY_CONFIG)
  const [original, setOriginal] = useState<PromptConfig>(EMPTY_CONFIG)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const fetchConfig = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/admin/ai-prompt-config', { credentials: 'include' })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error?.message ?? `HTTP ${res.status}`)
      }
      const { data } = await res.json()
      setConfig(data)
      setOriginal(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar configuração')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchConfig()
  }, [fetchConfig])

  const hasChanges = JSON.stringify(config) !== JSON.stringify(original)

  function handleFieldChange(key: keyof PromptConfig, value: string) {
    setConfig(prev => ({ ...prev, [key]: value }))
    setSuccess(null)
  }

  function handleReset() {
    setConfig(original)
    setSuccess(null)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSuccess(null)

    // Build diff (only send changed editable fields)
    const diff: Record<string, string> = {}
    for (const field of FIELD_META) {
      if (config[field.key] !== original[field.key]) {
        diff[field.key] = (config[field.key] as string) ?? ''
      }
    }

    try {
      const res = await fetch('/api/v1/admin/ai-prompt-config', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(diff),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error?.message ?? `HTTP ${res.status}`)
      }
      const { data } = await res.json()
      setConfig(data)
      setOriginal(data)
      setSuccess('Configuração salva com sucesso. O cache do prompt será atualizado na próxima análise.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <AdminBreadcrumb />
        <div className="flex items-center gap-3 text-[#929AA5]">
          <Loader2 className="h-5 w-5 animate-spin" />
          Carregando configuração do prompt...
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <AdminBreadcrumb />

      <div data-testid="admin-prompt-ia-header" className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#EAECEF] flex items-center gap-2">
            <BrainCircuit className="h-5 w-5 text-[#F0B90B]" />
            Prompt Assessor IA
          </h1>
          <p className="text-xs text-[#929AA5] mt-0.5">
            Edite as seções do prompt que definem o comportamento do assessor.
            Alterações <strong className="text-[#F0B90B]">não afetam</strong> o formato da resposta (JSON), apenas o conteúdo da análise.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="prompt-ia-reset-btn"
            onClick={handleReset}
            disabled={!hasChanges || saving}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
              hasChanges && !saving
                ? 'bg-[#1E2329] text-[#929AA5] border border-[rgba(240,185,11,.1)] hover:border-[rgba(240,185,11,.3)]'
                : 'bg-[#1E2329] text-[#707A8A] border border-transparent cursor-not-allowed opacity-50'
            )}
          >
            <RotateCcw className="h-4 w-4" />
            Desfazer
          </button>
          <button
            type="button"
            data-testid="prompt-ia-save-btn"
            onClick={() => void handleSave()}
            disabled={!hasChanges || saving}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
              hasChanges && !saving
                ? 'bg-[#F0B90B] text-[#080b12] hover:bg-[#F0B90B]/90'
                : 'bg-[#F0B90B]/30 text-[#080b12]/50 cursor-not-allowed'
            )}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>

      {error && (
        <div data-testid="prompt-ia-error" role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {success && (
        <div data-testid="prompt-ia-success" role="status" className="rounded-lg border border-[#2EBD85]/30 bg-[#2EBD85]/10 px-4 py-3 text-sm text-[#2EBD85]">
          {success}
        </div>
      )}

      {original.updatedAt && (
        <p className="text-xs text-[#707A8A]">
          Última atualização: {new Date(original.updatedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
          {original.updatedBy ? ` por ${original.updatedBy}` : ''}
        </p>
      )}

      <div className="space-y-4">
        {FIELD_META.map((field) => (
          <div
            key={field.key}
            data-testid={`prompt-ia-field-${field.key}`}
            className="rounded-xl border border-[rgba(240,185,11,.1)] bg-[#0d1117] p-4"
          >
            <label className="block mb-1.5">
              <span className="text-sm font-semibold text-[#EAECEF]">{field.label}</span>
              <span className="block text-xs text-[#707A8A] mt-0.5">{field.description}</span>
            </label>
            <textarea
              data-testid={`prompt-ia-textarea-${field.key}`}
              value={(config[field.key] as string) ?? ''}
              onChange={(e) => handleFieldChange(field.key, e.target.value)}
              rows={field.rows}
              className={cn(
                'w-full rounded-lg border bg-[#1E2329] px-3 py-2 text-sm text-[#EAECEF] placeholder-[#707A8A]',
                'focus:outline-none focus:ring-1 focus:ring-[#F0B90B]/50 focus:border-[#F0B90B]/50',
                'resize-y min-h-[60px]',
                config[field.key] !== original[field.key]
                  ? 'border-[#F0B90B]/40'
                  : 'border-[rgba(240,185,11,.1)]'
              )}
            />
            {config[field.key] !== original[field.key] && (
              <p className="text-xs text-[#F0B90B] mt-1">Campo modificado (não salvo)</p>
            )}
          </div>
        ))}
      </div>

      {/* Info card about what changes affect */}
      <div className="rounded-xl border border-[rgba(240,185,11,.1)] bg-[#0d1117] p-4 text-xs text-[#707A8A] space-y-1">
        <p className="font-semibold text-[#929AA5]">Como funciona:</p>
        <ul className="list-disc pl-4 space-y-0.5">
          <li>O prompt é montado com estas seções como <strong>system message</strong> do Claude.</li>
          <li>Alterações afetam o <strong>conteúdo e estilo</strong> das análises, não o formato JSON da resposta.</li>
          <li>Após salvar, o cache Redis é invalidado. Novas análises usarão o prompt atualizado.</li>
          <li>Análises já em cache (TTL 30min) continuarão com o prompt anterior até expirar.</li>
        </ul>
      </div>
    </div>
  )
}
