'use client'

// ============================================================================
// Foot Stock — CreatePost
// Formulário de criação de post (280 chars) com contador e ticker selector
// Fonte: module-18/TASK-2/ST001
// ============================================================================

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { cn } from '@/lib/utils/cn'
import { Btn } from '@/components/ui/Btn'
import { useToast } from '@/hooks/useToast'
import { apiClient } from '@/lib/api/client'
import { TICKERS_40 } from '@/lib/constants/tickers'
import { MESSAGES } from '@/lib/constants/messages'

const createPostSchema = z.object({
  content: z.string().min(1).max(280),
  ticker: z.string().optional(),
})

type CreatePostFields = z.infer<typeof createPostSchema>

interface CreatePostProps {
  onSuccess: () => void
}

function getCounterColor(len: number): string {
  if (len <= 239) return 'text-emerald-400'
  if (len <= 260) return 'text-yellow-400'
  return 'text-red-400'
}

export function CreatePost({ onSuccess }: CreatePostProps) {
  const [tickerInput, setTickerInput] = useState('')
  const [tickerSuggestions, setTickerSuggestions] = useState<string[]>([])
  const { toast } = useToast()

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { isSubmitting },
  } = useForm<CreatePostFields>({
    resolver: zodResolver(createPostSchema),
    defaultValues: { content: '', ticker: undefined },
  })

  const content = watch('content') ?? ''

  function handleTickerInput(value: string) {
    setTickerInput(value)
    if (value.length >= 2) {
      setTickerSuggestions(
        TICKERS_40.filter(t => t.toLowerCase().includes(value.toLowerCase())).slice(0, 6)
      )
    } else {
      setTickerSuggestions([])
    }
  }

  function selectTicker(t: string) {
    setValue('ticker', t)
    setTickerInput(t)
    setTickerSuggestions([])
  }

  async function onSubmit(data: CreatePostFields) {
    try {
      const response = await apiClient.post('/api/v1/forum', data)

      if (response.data?.error?.code === 'FORUM_051') {
        // Palavra bloqueada — post salvo mas em revisão
        toast.warning('Post em revisão', 'Seu post foi publicado e está em revisão')
        reset()
        setTickerInput('')
        onSuccess()
        return
      }

      toast.success(MESSAGES.FORUM.POST_PUBLISHED, MESSAGES.FORUM.POST_PUBLISHED_DESCRIPTION)
      reset()
      setTickerInput('')
      onSuccess()
    } catch (err: unknown) {
      const code = (err as { response?: { data?: { error?: { code?: string } } } })?.response?.data?.error?.code
      if (code === 'FORUM_051') {
        toast.warning('Post em revisão', 'Seu post foi publicado e está em revisão')
        reset()
        setTickerInput('')
        onSuccess()
      } else if (code === 'RATE_001') {
        toast.error(MESSAGES.FORUM.LIMIT_REACHED, MESSAGES.FORUM.LIMIT_REACHED_DESCRIPTION)
        // Não limpar form — preservar conteúdo
      } else {
        toast.error(MESSAGES.FORUM.POST_PUBLISH_ERROR, MESSAGES.FORUM.POST_PUBLISH_ERROR_DESCRIPTION)
      }
    }
  }

  const isDisabled = content.trim().length === 0 || content.length > 280 || isSubmitting

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="bg-bg-elevated border border-border-default rounded-xl p-4 space-y-3">
      <textarea
        {...register('content')}
        maxLength={280}
        placeholder="Compartilhe sua análise..."
        aria-label="Conteúdo do post"
        rows={3}
        className={cn(
          'w-full bg-transparent resize-none text-sm text-text-primary placeholder:text-text-muted',
          'focus:outline-none focus:ring-1 focus:ring-accent rounded-lg p-2',
          'border border-border-default'
        )}
      />

      {/* Contador */}
      <div className="flex items-center justify-between gap-2">
        <span
          role="status"
          aria-live="polite"
          className={cn('text-xs font-mono', getCounterColor(content.length))}
        >
          {content.length}/280
        </span>

        {/* Ticker selector */}
        <div className="relative">
          <input
            type="text"
            value={tickerInput}
            onChange={e => handleTickerInput(e.target.value)}
            placeholder="Ticker (opcional)"
            aria-label="Filtrar por ticker (opcional)"
            className={cn(
              'w-32 text-xs bg-bg-surface border border-border-default rounded-lg px-2 py-1',
              'text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent'
            )}
          />
          {tickerSuggestions.length > 0 && (
            <ul
              role="listbox"
              className="absolute bottom-8 left-0 bg-bg-elevated border border-border-default rounded-lg py-1 z-10 min-w-[100px]"
            >
              {tickerSuggestions.map(t => (
                <li key={t}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={watch('ticker') === t}
                    onClick={() => selectTicker(t)}
                    className="w-full text-left px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-surface hover:text-accent transition-colors"
                  >
                    {t}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <Btn
        type="submit"
        size="sm"
        disabled={isDisabled}
        aria-disabled={isDisabled}
        aria-busy={isSubmitting}
        className="w-full"
      >
        {isSubmitting ? 'Publicando...' : 'Publicar'}
      </Btn>
    </form>
  )
}
