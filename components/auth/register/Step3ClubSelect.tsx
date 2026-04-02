'use client'

import { useState } from 'react'
import { CLUBS } from '@/lib/constants/clubs'
import { Input } from '@/components/ui/Input'
import { Btn } from '@/components/ui/Btn'
import { cn } from '@/lib/utils/cn'
import { useDebounce } from '@/hooks/useDebounce'

interface Step3ClubSelectProps {
  onNext: (club: string | null) => void
  onBack: () => void
  defaultValue?: string | null
}

export function Step3ClubSelect({ onNext, onBack, defaultValue }: Step3ClubSelectProps) {
  const [selected, setSelected] = useState<string | null>(defaultValue ?? null)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)

  const filtered = debouncedSearch
    ? CLUBS.filter((c) =>
        c.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        c.ticker.toLowerCase().includes(debouncedSearch.toLowerCase()),
      )
    : CLUBS

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-text-primary">Clube favorito</h2>
      <p className="text-sm text-text-muted">Selecione seu clube do coracao (opcional)</p>

      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar clube..."
        data-testid="input-search-club"
      />

      <div
        role="radiogroup"
        aria-label="Selecione um clube"
        className="grid grid-cols-3 sm:grid-cols-5 gap-2 max-h-[320px] overflow-y-auto"
      >
        {filtered.length === 0 ? (
          <p className="col-span-full text-center text-sm text-text-muted py-8">
            Nenhum clube encontrado
          </p>
        ) : (
          filtered.map((club) => (
            <button
              key={club.ticker}
              type="button"
              role="radio"
              aria-checked={selected === club.ticker}
              data-testid={`club-${club.ticker}`}
              onClick={() => setSelected(selected === club.ticker ? null : club.ticker)}
              className={cn(
                'min-h-[44px] px-2 py-2 rounded-md border text-xs font-medium',
                'transition-all duration-fast text-center',
                'hover:border-accent hover:text-accent',
                selected === club.ticker
                  ? 'border-accent ring-2 ring-accent/30 text-accent bg-accent/5'
                  : 'border-border-default text-text-secondary bg-bg-surface',
              )}
            >
              <div className="text-[10px] text-text-muted">{club.ticker}</div>
              <div className="truncate">{club.name}</div>
            </button>
          ))
        )}
      </div>

      <div className="flex gap-3">
        <Btn type="button" variant="secondary" onClick={onBack} className="flex-1">
          Voltar
        </Btn>
        <Btn
          type="button"
          variant="ghost"
          onClick={() => onNext(null)}
          data-testid="btn-skip"
          className="flex-1"
        >
          Pular
        </Btn>
        <Btn
          type="button"
          onClick={() => onNext(selected)}
          data-testid="btn-next"
          className="flex-[2]"
        >
          Continuar
        </Btn>
      </div>
    </div>
  )
}
