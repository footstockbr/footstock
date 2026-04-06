'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { CLUBS } from '@/lib/constants/clubs'
import { useDebounce } from '@/hooks/useDebounce'
import type { WizardData } from '../register-wizard'

interface Step3Props {
  data: WizardData
  onNext: (data: Partial<WizardData>) => void
}

export function Step3ClubSelect({ data, onNext }: Step3Props) {
  const [selectedClub, setSelectedClub] = useState<string>(data.favoriteClub ?? '')
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const debouncedSearch = useDebounce(search)

  const filteredClubs = CLUBS.filter(
    (c) =>
      c.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      c.ticker.toLowerCase().includes(debouncedSearch.toLowerCase())
  )

  const handleNext = () => {
    if (!selectedClub) {
      setError('Selecione o seu clube do coração para continuar')
      return
    }
    onNext({ favoriteClub: selectedClub })
  }

  return (
    <div data-testid="form-register-step3" className="flex flex-col gap-4" aria-labelledby="wizard-heading">
      <p className="text-sm text-[#929AA5]">
        Escolha seu clube do coração para personalizar sua experiência.
      </p>

      <Input
        label="Buscar clube"
        type="search"
        placeholder="Ex: Urubu da Gavea FC, URU3..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {error && (
        <p role="alert" className="text-xs text-[#F6465D]">
          {error}
        </p>
      )}

      {/* Grid de clubes acessível */}
      <div
        className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1"
        role="radiogroup"
        aria-label="Selecione seu clube favorito"
      >
        {filteredClubs.map((club) => (
          <button
            key={club.ticker}
            type="button"
            role="radio"
            aria-checked={selectedClub === club.ticker}
            data-testid={`form-register-club-button-${club.ticker.toLowerCase()}`}
            onClick={() => {
              setSelectedClub(club.ticker)
              setError('')
            }}
            className={cn(
              'flex items-center gap-2 p-2.5 rounded-lg border text-left',
              'transition-all duration-150 min-h-[44px]',
              selectedClub === club.ticker
                ? 'border-[#F0B90B] bg-[rgba(240,185,11,.12)] text-[#F0B90B]'
                : 'border-[rgba(240,185,11,.18)] bg-[#1E2329] text-[#929AA5] hover:border-[rgba(240,185,11,.35)]'
            )}
          >
            {/* @ASSET_PLACEHOLDER: logo do clube {club.ticker} — PNG 32×32px, circular */}
            <div
              className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
                selectedClub === club.ticker ? 'bg-[rgba(240,185,11,.2)]' : 'bg-[#1e1a12]'
              )}
            >
              <span className="text-[10px] font-bold" aria-hidden="true">
                {club.ticker.slice(0, 3)}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium truncate">{club.name}</p>
              <p className="text-[10px] text-[#707A8A]">
                {club.division === 'SERIE_A' ? 'Série A' : 'Série B'}
              </p>
            </div>
          </button>
        ))}
      </div>

      {filteredClubs.length === 0 && (
        <p className="text-sm text-[#929AA5] text-center py-4" role="status">
          Nenhum clube encontrado
        </p>
      )}

      <Button
        data-testid="form-register-step3-next-button"
        variant="primary"
        size="lg"
        fullWidth
        disabled={!selectedClub}
        onClick={handleNext}
        className="mt-2"
      >
        Próximo →
      </Button>
    </div>
  )
}
