'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useDebounce } from '@/hooks/useDebounce'
import type { WizardData } from '../register-wizard'
import { ClubCrest } from '@/components/market/ClubCrest'

interface ClubForSelection {
  ticker: string
  displayName: string
  realName: string
  division: 'SERIE_A' | 'SERIE_B'
  colors: { primary: string; secondary: string }
}

interface Step3Props {
  data: WizardData
  onNext: (data: Partial<WizardData>) => void
}

export function Step3ClubSelect({ data, onNext }: Step3Props) {
  const [selectedClub, setSelectedClub] = useState<string>(data.favoriteClub ?? '')
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [clubs, setClubs] = useState<ClubForSelection[]>([])
  const [loadError, setLoadError] = useState(false)
  const debouncedSearch = useDebounce(search)

  // Buscar lista com realName do endpoint dedicado ao cadastro
  useEffect(() => {
    fetch('/api/v1/assets/clubs-for-selection')
      .then((res) => {
        if (!res.ok) throw new Error('Failed')
        return res.json()
      })
      .then((json: { data: ClubForSelection[] }) => setClubs(json.data))
      .catch(() => setLoadError(true))
  }, [])

  const filteredClubs = clubs.filter(
    (c) =>
      c.realName.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      c.displayName.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
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
        placeholder="Ex: Flamengo, Palmeiras, Corinthians..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {error && (
        <p role="alert" className="text-xs text-[#F6465D]">
          {error}
        </p>
      )}

      {loadError && (
        <p role="alert" className="text-xs text-[#F6465D]">
          Erro ao carregar clubes. Recarregue a página.
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
            {/* Escudo com as cores reais do time equivalente */}
            <ClubCrest
              ticker={club.ticker}
              colorPrimary={club.colors?.primary}
              colorSecondary={club.colors?.secondary}
              size={32}
            />
            <div className="min-w-0">
              {/* Exibe realName para ajudar identificação — único local onde realName aparece na UI */}
              <p className="text-xs font-medium truncate">{club.realName}</p>
              <p className="text-[10px] text-[#707A8A]">
                {club.division === 'SERIE_A' ? 'Série A' : 'Série B'}
              </p>
            </div>
          </button>
        ))}
      </div>

      {clubs.length > 0 && filteredClubs.length === 0 && (
        <p className="text-sm text-[#929AA5] text-center py-4" role="status">
          Nenhum clube encontrado
        </p>
      )}

      {clubs.length === 0 && !loadError && (
        <p className="text-sm text-[#929AA5] text-center py-4" role="status" aria-live="polite">
          Carregando clubes...
        </p>
      )}

      <Button
        data-testid="form-register-step3-next-button"
        variant="primary"
        size="lg"
        fullWidth
        disabled={!selectedClub || clubs.length === 0}
        onClick={handleNext}
        className="mt-2"
      >
        Próximo →
      </Button>
    </div>
  )
}
