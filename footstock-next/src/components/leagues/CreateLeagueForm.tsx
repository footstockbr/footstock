'use client'

import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePlanGuard } from '@/hooks/usePlanGuard'
import type { LeagueType, LeagueDivision, LeagueDuration } from '@/types'

// ─── Zod schema (mirrors league.schema.ts on the server) ──────────────────────

const createLeagueSchema = z.object({
  name:     z.string().min(3, 'Mínimo 3 caracteres').max(50, 'Máximo 50 caracteres'),
  type:     z.enum(['PUBLICA', 'AMIGOS'] as const),
  division: z.enum(['BRONZE', 'PRATA', 'OURO', 'OPEN'] as const),
  duration: z.enum(['1S', '1M', 'TEMPORADA'] as const),
})

type FormValues = z.infer<typeof createLeagueSchema>

// ─── API call ─────────────────────────────────────────────────────────────────

async function createLeague(data: FormValues): Promise<{ id: string }> {
  const res = await fetch('/api/v1/leagues', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  const json = await res.json()
  if (!res.ok) {
    const msg = json?.error?.message ?? 'Erro ao criar liga'
    throw Object.assign(new Error(msg), { code: json?.error?.code })
  }
  return json.data
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface RadioGroupProps<T extends string> {
  id: string
  label: string
  options: { value: T; label: string; restricted?: boolean; restrictedLabel?: string }[]
  value: T | undefined
  onChange: (v: T) => void
  error?: string
}

function RadioGroup<T extends string>({
  id, label, options, value, onChange, error,
}: RadioGroupProps<T>) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-gray-300 mb-2">{label}</legend>
      <div className="flex flex-wrap gap-2" role="group" aria-describedby={error ? `${id}-error` : undefined}>
        {options.map(opt => {
          const checked = value === opt.value
          return (
            <label
              key={opt.value}
              className={cn(
                'relative flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer transition-colors select-none',
                'focus-within:ring-2 focus-within:ring-[#F0B90B]',
                opt.restricted
                  ? 'border-gray-700 text-gray-600 cursor-not-allowed'
                  : checked
                    ? 'border-[#F0B90B] bg-[#F0B90B]/10 text-[#F0B90B] font-medium'
                    : 'border-[#2a2724] text-gray-400 hover:border-gray-500 hover:text-gray-300'
              )}
              title={opt.restricted ? opt.restrictedLabel : undefined}
            >
              <input
                type="radio"
                name={id}
                value={opt.value}
                checked={checked}
                disabled={opt.restricted}
                onChange={() => onChange(opt.value)}
                className="sr-only"
                aria-describedby={opt.restricted ? `${id}-${opt.value}-restricted` : undefined}
              />
              {opt.label}
              {opt.restricted && (
                <>
                  <Lock className="h-3 w-3" aria-hidden="true" />
                  <span id={`${id}-${opt.value}-restricted`} className="sr-only">
                    {opt.restrictedLabel}
                  </span>
                </>
              )}
            </label>
          )
        })}
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-xs text-red-400">
          {error}
        </p>
      )}
    </fieldset>
  )
}

// ─── Main Form ────────────────────────────────────────────────────────────────

export function CreateLeagueForm() {
  const router = useRouter()
  const qc = useQueryClient()
  const { plan, hasAccess } = usePlanGuard()

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(createLeagueSchema),
    defaultValues: {
      type:     'PUBLICA',
      division: 'OPEN',
      duration: '1M',
    },
  })

  const selectedType     = watch('type')
  const selectedDivision = watch('division')
  const selectedDuration = watch('duration')

  const { mutate, isPending, error: mutError } = useMutation({
    mutationFn: createLeague,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['leagues'] })
      qc.invalidateQueries({ queryKey: ['my-leagues'] })
      router.push(`/ligas/${data.id}`)
    },
  })

  const typeOptions: RadioGroupProps<'PUBLICA' | 'AMIGOS'>['options'] = [
    { value: 'PUBLICA', label: 'Pública' },
    {
      value: 'AMIGOS',
      label: 'Amigos',
      restricted: !hasAccess('CRAQUE'),
      restrictedLabel: 'Disponível no plano Craque ou superior',
    },
    // Ligas PRO são criadas exclusivamente por admins via /admin/ligas-pro
  ]

  const divisionOptions: RadioGroupProps<LeagueDivision>['options'] = [
    { value: 'OPEN',   label: 'Open'   },
    { value: 'BRONZE', label: 'Bronze' },
    { value: 'PRATA',  label: 'Prata'  },
    { value: 'OURO',   label: 'Ouro'   },
  ]

  const durationOptions: RadioGroupProps<LeagueDuration>['options'] = [
    { value: '1S',        label: '1 Semana'  },
    { value: '1M',        label: '1 Mês'     },
    { value: 'TEMPORADA', label: 'Temporada' },
  ]

  return (
    <form
      onSubmit={handleSubmit(data => mutate(data))}
      noValidate
      aria-label="Criar nova liga"
      data-testid="form-create-league"
      className="space-y-6"
    >
      {/* Name */}
      <div>
        <label htmlFor="league-name" className="block text-sm font-medium text-gray-300 mb-1.5">
          Nome da liga
        </label>
        <input
          id="league-name"
          type="text"
          autoComplete="off"
          data-testid="form-create-league-name-input"
          placeholder="Ex: Liga dos Craques"
          className={cn(
            'w-full px-3 py-2.5 rounded-lg bg-[#1E2329] border text-sm text-[#EAECEF] placeholder:text-gray-600',
            'focus:outline-none focus:ring-2 focus:ring-[#F0B90B] transition-colors',
            errors.name ? 'border-red-500' : 'border-[#2a2724]'
          )}
          aria-describedby={errors.name ? 'name-error' : undefined}
          aria-invalid={!!errors.name}
          {...register('name')}
        />
        {errors.name && (
          <p id="name-error" role="alert" className="mt-1.5 text-xs text-red-400">
            {errors.name.message}
          </p>
        )}
      </div>

      {/* Type */}
      <RadioGroup<'PUBLICA' | 'AMIGOS'>
        id="type"
        label="Tipo"
        options={typeOptions}
        value={selectedType}
        onChange={v => setValue('type', v, { shouldValidate: true })}
        error={errors.type?.message}
      />

      {/* Plan restriction hint for JOGADOR */}
      {plan === 'JOGADOR' && (
        <p className="text-xs text-gray-500 flex items-center gap-1.5">
          <Lock className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
          Ligas de amigos requerem plano Craque ou superior.
        </p>
      )}

      {/* Division */}
      <RadioGroup<LeagueDivision>
        id="division"
        label="Divisão"
        options={divisionOptions}
        value={selectedDivision}
        onChange={v => setValue('division', v, { shouldValidate: true })}
        error={errors.division?.message}
      />

      {/* Duration */}
      <RadioGroup<LeagueDuration>
        id="duration"
        label="Duração"
        options={durationOptions}
        value={selectedDuration}
        onChange={v => setValue('duration', v, { shouldValidate: true })}
        error={errors.duration?.message}
      />

      {/* API error */}
      {mutError && (
        <p role="alert" className="text-sm text-red-400">
          {(mutError as Error).message}
        </p>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={isPending}
        data-testid="form-create-league-submit-button"
        className="w-full min-h-[48px] px-4 py-3 rounded-lg text-sm font-semibold bg-[#F0B90B] text-black hover:bg-[#d4ad52] disabled:opacity-60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F0B90B]"
        aria-label={isPending ? 'Criando liga...' : 'Criar liga'}
      >
        {isPending ? 'Criando...' : 'Criar Liga'}
      </button>
    </form>
  )
}
