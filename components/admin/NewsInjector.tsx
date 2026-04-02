'use client'
// ============================================================================
// Foot Stock — NewsInjector
// Formulário para injeção manual de notícias com impacto no motor.
// Rastreabilidade: INT-049, INT-086, TASK-3/ST009
// ============================================================================

import { useActionState, useState } from 'react'
import { Newspaper } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { TICKERS_40 } from '@/lib/constants/tickers'
import { IMPACT_CATEGORY } from '@/lib/enums'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { injectNewsAction } from '@/app/actions/admin/news'
import { initialActionState, type ActionResult } from '@/lib/action-utils'

const CATEGORY_LABELS: Record<string, string> = {
  VITORIA: 'Vitória',
  DERROTA: 'Derrota',
  EMPATE: 'Empate',
  TITULO: 'Título',
  REBAIXAMENTO: 'Rebaixamento',
  CONTRATACAO: 'Contratação',
  VENDA: 'Venda',
  LESAO: 'Lesão',
  SUSPENSAO: 'Suspensão',
  TECNICO: 'Mudança de Técnico',
  FINANCEIRO: 'Financeiro',
  PATROCINIO: 'Patrocínio',
  ESTADIO: 'Estádio',
  TORCIDA: 'Torcida',
  ARBITRAGEM: 'Arbitragem',
}

function sentimentLabel(v: number) {
  if (v < -0.7) return 'Muito Negativo'
  if (v < -0.3) return 'Negativo'
  if (v < 0.3) return 'Neutro'
  if (v < 0.7) return 'Positivo'
  return 'Muito Positivo'
}

export function NewsInjector() {
  // Controle do slider de sentimento (dado não-texto, precisa de estado local)
  const [sentiment, setSentiment] = useState(0)

  const [state, formAction] = useActionState(
    injectNewsAction,
    initialActionState as ActionResult<{ newsId: string }>
  )

  const inputClass =
    'mt-1 block w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-[#F0B90B] focus:outline-none focus:ring-1 focus:ring-[#F0B90B]'

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="mb-4 flex items-center gap-2">
        <Newspaper size={16} className="text-[#F0B90B]" />
        <h3 className="text-sm font-semibold text-zinc-100">Injetar Notícia</h3>
      </div>

      {state.success && state.message && (
        <div role="status" className="mb-3 rounded-lg bg-emerald-500/10 p-3 text-xs text-emerald-400">
          {state.message}
        </div>
      )}
      {!state.success && state.error && (
        <div role="alert" className="mb-3 rounded-lg bg-red-500/10 p-3 text-xs text-red-400">
          {state.error}
        </div>
      )}

      <form action={formAction} className="space-y-3" noValidate>
        {/* Hidden input para o sentimento (valor numérico do slider) */}
        <input type="hidden" name="sentiment" value={sentiment} />

        <div>
          <label htmlFor="ni-title" className="block text-xs text-zinc-500">
            Título *
          </label>
          <input
            id="ni-title"
            name="title"
            placeholder="Título da notícia (mín. 5 chars)"
            className={inputClass}
            aria-describedby={state.success === false && state.fieldErrors?.title ? 'ni-title-error' : undefined}
            aria-invalid={!!(state.success === false && state.fieldErrors?.title)}
          />
          {!state.success && state.fieldErrors?.title && (
            <p id="ni-title-error" className="mt-0.5 text-xs text-red-400">
              {state.fieldErrors.title[0]}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="ni-content" className="block text-xs text-zinc-500">
            Conteúdo *
          </label>
          <textarea
            id="ni-content"
            name="content"
            rows={3}
            placeholder="Descrição da notícia..."
            className={cn(inputClass, 'resize-none')}
            aria-describedby={state.success === false && state.fieldErrors?.content ? 'ni-content-error' : undefined}
            aria-invalid={!!(state.success === false && state.fieldErrors?.content)}
          />
          {!state.success && state.fieldErrors?.content && (
            <p id="ni-content-error" className="mt-0.5 text-xs text-red-400">
              {state.fieldErrors.content[0]}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="ni-ticker" className="block text-xs text-zinc-500">
            Ativo *
          </label>
          <select
            id="ni-ticker"
            name="ticker"
            className={inputClass}
            aria-describedby={state.success === false && state.fieldErrors?.ticker ? 'ni-ticker-error' : undefined}
            aria-invalid={!!(state.success === false && state.fieldErrors?.ticker)}
          >
            <option value="">Selecionar ativo...</option>
            {TICKERS_40.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          {!state.success && state.fieldErrors?.ticker && (
            <p id="ni-ticker-error" className="mt-0.5 text-xs text-red-400">
              {state.fieldErrors.ticker[0]}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="ni-category" className="block text-xs text-zinc-500">
            Categoria de Impacto *
          </label>
          <select id="ni-category" name="impactCategory" className={inputClass}>
            {Object.entries(IMPACT_CATEGORY).map(([, v]) => (
              <option key={v} value={v}>{CATEGORY_LABELS[v] ?? v}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="ni-sentiment" className="flex items-center justify-between text-xs text-zinc-500">
            <span>Sentimento *</span>
            <span
              className={cn(
                'font-medium',
                sentiment < -0.3 ? 'text-red-400' : sentiment > 0.3 ? 'text-emerald-400' : 'text-zinc-500'
              )}
            >
              {sentiment.toFixed(2)} — {sentimentLabel(sentiment)}
            </span>
          </label>
          <input
            id="ni-sentiment"
            type="range"
            min="-1"
            max="1"
            step="0.05"
            value={sentiment}
            onChange={e => setSentiment(parseFloat(e.target.value))}
            className="mt-1 w-full accent-[#F0B90B]"
            aria-valuemin={-1}
            aria-valuemax={1}
            aria-valuenow={sentiment}
            aria-label={`Sentimento: ${sentimentLabel(sentiment)}`}
          />
        </div>

        <SubmitButton
          variant="plan"
          size="md"
          fullWidth
          loadingText="Injetando..."
          className="mt-1"
        >
          Injetar Notícia
        </SubmitButton>
      </form>
    </div>
  )
}
