// ============================================================================
// FootStock — /club/calendario — Calendário de eventos e partidas
// Auth obrigatória CLUB_PARTNER via (portal)/layout.tsx + withClubAuth().
// Exibe próximas partidas. Integração com feed de calendário em fase futura.
// Rastreabilidade: US-025, US-036, FDD painel-admin §2.12, MILESTONE-9
// ============================================================================

import type { Metadata } from 'next'
import { Calendar, Trophy, Clock } from 'lucide-react'
import { withClubAuth } from '@/lib/auth/club-auth'
import { prisma } from '@/lib/prisma'

export const metadata: Metadata = {
  title: 'Calendário — Portal do Clube — FootStock',
}

export default async function ClubCalendarioPage() {
  const { clubId } = await withClubAuth()

  const asset = await prisma.asset.findUnique({
    where: { ticker: clubId },
    select: { id: true, displayName: true },
  })

  if (!asset) {
    return (
      <div className="flex items-center justify-center h-full text-[#929AA5] text-sm p-8">
        Clube {clubId} não encontrado no sistema.
      </div>
    )
  }

  return (
    <div data-testid="page-club-calendario" className="max-w-xl mx-auto px-4 pt-6 pb-10 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-4 bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.18)] p-5">
        <div className="w-12 h-12 rounded-full bg-[rgba(240,185,11,.15)] flex items-center justify-center">
          <Calendar className="h-6 w-6 text-[#F0B90B]" />
        </div>
        <div className="flex-1">
          <h1 className="text-base font-bold text-[#EAECEF]">Calendário de {asset.displayName}</h1>
          <p className="text-xs text-[#929AA5] mt-0.5">Próximas partidas e eventos</p>
        </div>
      </div>

      {/* Estado: sem integração de calendário ainda */}
      <div className="bg-[#1E2329] rounded-xl border border-[#2B3139] p-10 text-center space-y-3">
        <Calendar className="h-10 w-10 text-[#2B3139] mx-auto" />
        <div>
          <p className="text-sm font-semibold text-[#EAECEF]">Calendário em breve</p>
          <p className="text-xs text-[#929AA5] mt-1 max-w-xs mx-auto">
            A integração com o calendário de partidas está em desenvolvimento.
            Em breve você verá aqui os próximos jogos e eventos do clube.
          </p>
        </div>
        <div className="flex items-center justify-center gap-2 pt-1">
          <Clock className="h-3.5 w-3.5 text-[#4B5563]" />
          <span className="text-xs text-[#4B5563]">Disponível em breve</span>
        </div>
      </div>

      {/* Aviso */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-[rgba(240,185,11,.06)] border border-[rgba(240,185,11,.12)]">
        <Trophy className="h-4 w-4 text-[#F0B90B] flex-shrink-0 mt-0.5" />
        <p className="text-xs text-[#929AA5]">
          Calendário atualizado automaticamente quando disponível. Partidas e horários sujeitos a alteração pelas entidades organizadoras.
        </p>
      </div>
    </div>
  )
}
