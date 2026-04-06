'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import type { AdminNewsFormItem } from '@/lib/types/admin'

const newsFormSchema = z.object({
  title: z.string().min(1, 'Título é obrigatório').max(200, 'Máximo 200 caracteres'),
  ticker: z.string().max(10, 'Máximo 10 caracteres').optional().or(z.literal('')),
  sentiment: z.enum(['positive', 'negative', 'neutral'], {
    error: () => ({ message: 'Sentimento inválido' }),
  }),
  category: z.string().min(1, 'Categoria é obrigatória'),
})

type NewsFormValues = z.infer<typeof newsFormSchema>

interface NewsFormProps {
  news: AdminNewsFormItem
  onSave: (updated: AdminNewsFormItem) => void
  onCancel: () => void
}

const IMPACT_CATEGORIES = [
  { value: 'RESULTADO_ESPORTIVO', label: 'Resultado Esportivo' },
  { value: 'CONTRATACAO', label: 'Contratação' },
  { value: 'FINANCEIRO', label: 'Financeiro' },
  { value: 'LESAO', label: 'Lesão' },
  { value: 'SUSPENSAO', label: 'Suspensão' },
  { value: 'INSTITUCIONAL', label: 'Institucional' },
]

export function NewsForm({ news, onSave, onCancel }: NewsFormProps) {
  const [submitError, setSubmitError] = useState('')

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<NewsFormValues>({
    resolver: zodResolver(newsFormSchema),
    defaultValues: {
      title: news.title,
      ticker: news.ticker,
      sentiment: news.sentiment,
      category: news.category,
    },
  })

  async function onSubmit(values: NewsFormValues) {
    setSubmitError('')

    try {
      const res = await fetch(`/api/v1/admin/news/${news.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })

      if (res.ok) {
        const { data } = await res.json()
        onSave({ ...data, category: data.category ?? values.category })
      } else {
        const body = await res.json().catch(() => null)
        const message = body?.message ?? `Erro ao salvar notícia (${res.status})`
        setSubmitError(message)
      }
    } catch {
      setSubmitError('Erro de conexão. Tente novamente.')
    }
  }

  const inputClass = [
    'h-10 w-full rounded-lg border border-[rgba(240,185,11,.18)] bg-[#181A20]',
    'px-3 text-sm text-[#EAECEF] placeholder:text-[#707A8A]',
    'focus:outline-none focus:border-[#F0B90B]',
    'disabled:opacity-50 disabled:cursor-not-allowed',
  ].join(' ')

  const selectClass = [
    'h-10 w-full rounded-lg border border-[rgba(240,185,11,.18)] bg-[#181A20]',
    'px-3 text-sm text-[#EAECEF]',
    'focus:outline-none focus:border-[#F0B90B]',
    'disabled:opacity-50 disabled:cursor-not-allowed',
  ].join(' ')

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      {/* Erro geral do submit */}
      {submitError && (
        <div className="rounded-lg border border-[rgba(239,68,68,.3)] bg-[rgba(239,68,68,.06)] px-3 py-2.5" role="alert">
          <p className="text-sm text-[#F6465D]">{submitError}</p>
        </div>
      )}

      {/* Título */}
      <div>
        <label htmlFor="news-title" className="block text-xs font-medium text-[#929AA5] mb-1.5">Título *</label>
        <input
          id="news-title"
          {...register('title')}
          disabled={isSubmitting}
          aria-describedby={errors.title ? 'title-error' : undefined}
          className={inputClass}
          placeholder="Título da notícia"
        />
        {errors.title && (
          <span id="title-error" className="mt-1 text-xs text-[#F6465D]" role="alert">
            {errors.title.message}
          </span>
        )}
      </div>

      {/* Ticker */}
      <div>
        <label htmlFor="news-ticker" className="block text-xs font-medium text-[#929AA5] mb-1.5">Ticker</label>
        <input
          id="news-ticker"
          {...register('ticker')}
          disabled={isSubmitting}
          aria-describedby={errors.ticker ? 'ticker-error' : undefined}
          className={inputClass}
          placeholder="Ex: URU3"
        />
        {errors.ticker && (
          <span id="ticker-error" className="mt-1 text-xs text-[#F6465D]" role="alert">
            {errors.ticker.message}
          </span>
        )}
      </div>

      {/* Sentimento */}
      <div>
        <label htmlFor="news-sentiment" className="block text-xs font-medium text-[#929AA5] mb-1.5">Sentimento *</label>
        <select
          id="news-sentiment"
          {...register('sentiment')}
          disabled={isSubmitting}
          aria-describedby={errors.sentiment ? 'sentiment-error' : undefined}
          className={selectClass}
        >
          <option value="positive">Positivo</option>
          <option value="negative">Negativo</option>
          <option value="neutral">Neutro</option>
        </select>
        {errors.sentiment && (
          <span id="sentiment-error" className="mt-1 text-xs text-[#F6465D]" role="alert">
            {errors.sentiment.message}
          </span>
        )}
      </div>

      {/* Categoria */}
      <div>
        <label htmlFor="news-category" className="block text-xs font-medium text-[#929AA5] mb-1.5">Categoria *</label>
        <select
          id="news-category"
          {...register('category')}
          disabled={isSubmitting}
          aria-describedby={errors.category ? 'category-error' : undefined}
          className={selectClass}
        >
          <option value="">Selecione...</option>
          {IMPACT_CATEGORIES.map((cat) => (
            <option key={cat.value} value={cat.value}>
              {cat.label}
            </option>
          ))}
        </select>
        {errors.category && (
          <span id="category-error" className="mt-1 text-xs text-[#F6465D]" role="alert">
            {errors.category.message}
          </span>
        )}
      </div>

      {/* Ações */}
      <div className="flex gap-3 pt-2 sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="h-9 px-4 rounded-lg border border-[rgba(240,185,11,.18)] text-sm text-[#929AA5] hover:text-[#EAECEF] hover:border-[rgba(240,185,11,.4)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-w-[44px] min-h-[44px]"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="h-9 px-4 rounded-lg bg-[#F0B90B] text-sm font-medium text-[#0c0b09] hover:bg-[#b8972f] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 min-w-[44px] min-h-[44px]"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Salvando...
            </>
          ) : (
            'Salvar'
          )}
        </button>
      </div>
    </form>
  )
}
