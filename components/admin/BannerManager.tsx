'use client'

// ============================================================================
// Foot Stock — BannerManager
// Formulário de criação/edição de patrocinador com banners por posição.
// Fonte: module-24/TASK-3/ST006
// RESOLVED: migrado para useForm + zodResolver (padrão do projeto)
// ============================================================================

import { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { BANNER_POSITIONS, type AdSponsorDto, type BannerPosition } from '@/lib/types/sponsors'

const sponsorSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório.'),
  startsAt: z.string().min(1, 'Data de início é obrigatória.'),
  endsAt: z.string().min(1, 'Data de fim é obrigatória.'),
  active: z.boolean(),
})

type SponsorFields = z.infer<typeof sponsorSchema>

interface BannerManagerProps {
  initial?: AdSponsorDto | null
  onSuccess: () => void
  onCancel: () => void
}

interface BannerEntry {
  imageUrl: string
  linkUrl: string
  altText: string
}

const POSITION_LABELS: Record<BannerPosition, string> = {
  home_top: 'Home — Topo (360×80)',
  home_mid: 'Home — Meio (360×60)',
  market_top: 'Mercado — Topo (360×60)',
  cart_top: 'Carteira — Topo (360×60)',
  detail_bot: 'Detalhe Ativo — Rodapé (360×80)',
}

export function BannerManager({ initial, onSuccess, onCancel }: BannerManagerProps) {
  const [banners, setBanners] = useState<Partial<Record<BannerPosition, BannerEntry>>>(
    (initial?.banners as Partial<Record<BannerPosition, BannerEntry>>) ?? {}
  )
  const [submitError, setSubmitError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<SponsorFields>({
    resolver: zodResolver(sponsorSchema),
    defaultValues: {
      name: initial?.name ?? '',
      startsAt: initial ? initial.startsAt.slice(0, 10) : new Date().toISOString().slice(0, 10),
      endsAt: initial
        ? initial.endsAt.slice(0, 10)
        : new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      active: initial?.active ?? false,
    },
  })

  function updateBannerField(
    position: BannerPosition,
    field: keyof BannerEntry,
    value: string
  ) {
    setBanners(prev => ({
      ...prev,
      [position]: {
        imageUrl: '',
        linkUrl: '',
        altText: '',
        ...prev[position],
        [field]: value,
      },
    }))
  }

  function togglePosition(position: BannerPosition) {
    setBanners(prev => {
      if (prev[position]) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { [position]: _removed, ...rest } = prev
        return rest
      }
      return { ...prev, [position]: { imageUrl: '', linkUrl: '', altText: '' } }
    })
  }

  async function onSubmit(data: SponsorFields) {
    setSubmitError(null)
    const payload = {
      ...data,
      banners,
      startsAt: new Date(data.startsAt).toISOString(),
      endsAt: new Date(data.endsAt).toISOString(),
    }

    try {
      const url = initial ? `/api/v1/admin/sponsors/${initial.id}` : '/api/v1/admin/sponsors'
      const method = initial ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const json = (await res.json()) as { error?: string }
        setSubmitError(json.error ?? 'Falha ao salvar patrocinador.')
        return
      }

      onSuccess()
    } catch {
      setSubmitError('Erro de conexão ao salvar.')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label className="mb-1 block text-xs text-zinc-400">Nome do patrocinador</label>
        <input
          {...register('name')}
          className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-[#F0B90B]"
          placeholder="Ex: Bet365 Demo"
        />
        {errors.name && (
          <p className="mt-1 text-xs text-red-400">{errors.name.message}</p>
        )}
      </div>

      <div className="flex gap-4">
        <div className="flex-1">
          <label className="mb-1 block text-xs text-zinc-400">Início</label>
          <input
            type="date"
            {...register('startsAt')}
            className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-[#F0B90B]"
          />
          {errors.startsAt && (
            <p className="mt-1 text-xs text-red-400">{errors.startsAt.message}</p>
          )}
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-xs text-zinc-400">Fim</label>
          <input
            type="date"
            {...register('endsAt')}
            className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-[#F0B90B]"
          />
          {errors.endsAt && (
            <p className="mt-1 text-xs text-red-400">{errors.endsAt.message}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Controller
          name="active"
          control={control}
          render={({ field }) => (
            <input
              type="checkbox"
              id="active"
              checked={field.value}
              onChange={field.onChange}
              className="h-4 w-4 accent-[#F0B90B]"
            />
          )}
        />
        <label htmlFor="active" className="text-sm text-zinc-300">
          Ativo (exibir imediatamente se dentro da vigência)
        </label>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-zinc-400">Posições de banner</p>
        <div className="space-y-3">
          {BANNER_POSITIONS.map(position => {
            const isSelected = !!banners[position]
            return (
              <div key={position} className="rounded-md border border-zinc-800 bg-zinc-950 p-3">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={`pos-${position}`}
                    checked={isSelected}
                    onChange={() => togglePosition(position)}
                    className="h-4 w-4 accent-[#F0B90B]"
                  />
                  <label htmlFor={`pos-${position}`} className="text-sm font-medium text-zinc-200">
                    {POSITION_LABELS[position]}
                  </label>
                </div>

                {isSelected && (
                  <div className="mt-2 space-y-2 pl-6">
                    <input
                      placeholder="URL da imagem do banner"
                      value={banners[position]?.imageUrl ?? ''}
                      onChange={e => updateBannerField(position, 'imageUrl', e.target.value)}
                      className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-[#F0B90B]"
                    />
                    <input
                      placeholder="URL de destino (link)"
                      value={banners[position]?.linkUrl ?? ''}
                      onChange={e => updateBannerField(position, 'linkUrl', e.target.value)}
                      className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-[#F0B90B]"
                    />
                    <input
                      placeholder="Texto alternativo (acessibilidade)"
                      value={banners[position]?.altText ?? ''}
                      onChange={e => updateBannerField(position, 'altText', e.target.value)}
                      className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-[#F0B90B]"
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {submitError && (
        <p className="rounded-md border border-red-900 bg-red-950/40 p-2 text-sm text-red-300">
          {submitError}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-[#F0B90B] px-4 py-2 text-sm font-medium text-zinc-950 disabled:opacity-50"
        >
          {isSubmitting ? 'Salvando...' : initial ? 'Atualizar' : 'Criar patrocinador'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300"
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}
