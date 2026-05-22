'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Newspaper } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { CLUBS_PUBLIC as CLUBS } from '@/lib/constants/clubs-public'

const CATEGORIES = [
  { value: 'ESPORTIVA_MAJORITARIA', label: 'Esportiva Majoritária (+/-3%)' },
  { value: 'FINANCEIRA_CRITICA', label: 'Financeira Crítica (+/-5%)' },
  { value: 'MERCADO_ATIVOS', label: 'Mercado/Ativos (+/-2%)' },
  { value: 'INTEGRIDADE_SAUDE', label: 'Integridade/Saúde (+/-1.5%)' },
  { value: 'INSTITUCIONAL', label: 'Institucional (+/-1%)' },
  { value: 'ESPORTIVA_MENOR', label: 'Esportiva Menor (+/-0.5%)' },
] as const

const Schema = z.object({
  title: z.string().min(10, 'Mínimo 10 caracteres').max(200, 'Máximo 200 caracteres'),
  ticker: z.string().min(1, 'Selecione um ativo'),
  impactCategory: z.enum(['ESPORTIVA_MAJORITARIA', 'FINANCEIRA_CRITICA', 'MERCADO_ATIVOS', 'INTEGRIDADE_SAUDE', 'INSTITUCIONAL', 'ESPORTIVA_MENOR']),
  sentiment: z.number().min(-1).max(1),
})

type FormData = z.infer<typeof Schema>

function sentimentLabel(v: number) {
  if (v < -0.7) return 'Muito Negativo'
  if (v < -0.3) return 'Negativo'
  if (v < 0.3) return 'Neutro'
  if (v < 0.7) return 'Positivo'
  return 'Muito Positivo'
}

export function NewsInjector() {
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const { register, handleSubmit, watch, setValue, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(Schema),
    defaultValues: { sentiment: 0, impactCategory: 'ESPORTIVA_MAJORITARIA', ticker: '', title: '' },
  })

  const sentiment = watch('sentiment')
  const ticker = watch('ticker')

  const onSubmit = async (data: FormData) => {
    setSuccessMsg(null)
    setErrorMsg(null)
    try {
      const res = await fetch('/api/v1/admin/news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const body = await res.json()
        setErrorMsg(body?.error?.message ?? 'Serviço de notícias temporariamente indisponível. Tente novamente em breve.')
        return
      }
      setSuccessMsg(`Notícia injetada. Aparecerá no feed em breve e impactará o preço de ${data.ticker}.`)
      reset()
    } catch {
      setErrorMsg('Serviço de notícias temporariamente indisponível. Tente novamente em breve.')
    }
  }

  return (
    <div className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4">
      <div className="flex items-center gap-2 mb-4">
        <Newspaper className="h-4 w-4 text-[#F0B90B]" />
        <h2 className="text-sm font-semibold text-[#EAECEF]">Injetar Notícia</h2>
      </div>

      {successMsg && (
        <div className="mb-3 text-xs bg-emerald-500/10 text-emerald-400 rounded-lg p-3">{successMsg}</div>
      )}
      {errorMsg && (
        <div className="mb-3 text-xs bg-red-500/10 text-red-400 rounded-lg p-3">{errorMsg}</div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        <div>
          <label className="text-xs text-[#929AA5] mb-1 block">Título *</label>
          <Input
            {...register('title')}
            placeholder="Título da notícia (min 10 chars)"
            className="text-sm"
          />
          {errors.title && <p className="text-red-400 text-xs mt-0.5">{errors.title.message}</p>}
        </div>

        <div>
          <label className="text-xs text-[#929AA5] mb-1 block">Ativo *</label>
          <select
            {...register('ticker')}
            className="w-full bg-[#0e0d0c] border border-[rgba(240,185,11,.15)] rounded-lg px-3 py-2 text-sm text-[#c5b99a] focus:outline-none focus:border-[#F0B90B]"
          >
            <option value="">Selecionar ativo...</option>
            {CLUBS.map((c) => (
              <option key={c.ticker} value={c.ticker}>
                {c.ticker} — {c.displayName}
              </option>
            ))}
          </select>
          {errors.ticker && <p className="text-red-400 text-xs mt-0.5">{errors.ticker.message}</p>}
        </div>

        <div>
          <label className="text-xs text-[#929AA5] mb-1 block">Categoria *</label>
          <select
            {...register('impactCategory')}
            className="w-full bg-[#0e0d0c] border border-[rgba(240,185,11,.15)] rounded-lg px-3 py-2 text-sm text-[#c5b99a] focus:outline-none focus:border-[#F0B90B]"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs text-[#929AA5] mb-1 flex items-center justify-between">
            <span>Sentimento *</span>
            <span className={cn(
              'font-medium',
              sentiment < -0.3 ? 'text-red-400' : sentiment > 0.3 ? 'text-emerald-400' : 'text-[#929AA5]'
            )}>
              {sentiment.toFixed(2)} — {sentimentLabel(sentiment)}
            </span>
          </label>
          <input
            type="range"
            min="-1"
            max="1"
            step="0.05"
            value={sentiment}
            onChange={(e) => setValue('sentiment', parseFloat(e.target.value))}
            className="w-full accent-[#F0B90B]"
          />
        </div>

        <Button
          type="submit"
          variant="destructive"
          size="sm"
          disabled={isSubmitting}
          className="w-full mt-1"
        >
          {isSubmitting ? 'Injetando...' : 'Injetar Notícia'}
        </Button>
      </form>
    </div>
  )
}
