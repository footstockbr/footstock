'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { AlertCircle, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface SponsoredLeagueLgpdModalProps {
  isOpen: boolean
  leagueId: string
  leagueName: string
  onClose: () => void
  onAccept: () => void
}

export function SponsoredLeagueLgpdModal({
  isOpen,
  leagueId,
  leagueName,
  onClose,
  onAccept,
}: SponsoredLeagueLgpdModalProps) {
  const [isLoading, setIsLoading] = useState(false)

  if (!isOpen) return null

  async function handleAccept() {
    setIsLoading(true)
    try {
      // T-12: Criar consent para SPONSORED_LEAGUES
      const res = await fetch('/api/v1/users/me/consents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purpose: 'SPONSORED_LEAGUES',
          granted: true,
        }),
      })

      if (!res.ok) {
        toast.error('Erro ao aceitar termos de privacidade')
        return
      }

      toast.success('Termos aceitos!')
      onAccept()
    } catch (err) {
      toast.error('Erro ao processar consentimento')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
      data-testid="modal-lgpd-sponsored-league"
    >
      <div
        className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.18)] max-w-md mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-4">
          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-[rgba(240,185,11,.15)] flex items-center justify-center">
            <Lock className="h-4 w-4 text-[#F0B90B]" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-[#EAECEF]">Termos de Privacidade</h2>
            <p className="text-xs text-[#929AA5] mt-1">
              Para participar de ligas patrocinadas, você precisa aceitar o tratamento de dados.
            </p>
          </div>
        </div>

        <div className="bg-[rgba(240,185,11,.05)] border border-[rgba(240,185,11,.15)] rounded-lg p-3 mb-4">
          <p className="text-xs text-[#C0C4CE] leading-relaxed">
            A liga <strong>{leagueName}</strong> é uma liga patrocinada. Ao participar, você concorda que seus dados de
            desempenho e participação possam ser compartilhados com o patrocinador para análises e relatórios. Seus dados
            serão tratados conforme nossa política de privacidade.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 h-9 px-4 rounded-lg border border-[rgba(240,185,11,.18)] text-sm font-medium text-[#929AA5] hover:text-[#EAECEF] transition-colors disabled:opacity-50"
          >
            Não aceitar
          </button>
          <Button
            onClick={handleAccept}
            disabled={isLoading}
            data-testid="modal-lgpd-accept-button"
            className="flex-1 bg-[#F0B90B] hover:bg-[#d4ad52] text-[#0c0b09]"
          >
            {isLoading ? 'Processando...' : 'Aceitar e continuar'}
          </Button>
        </div>
      </div>
    </div>
  )
}
