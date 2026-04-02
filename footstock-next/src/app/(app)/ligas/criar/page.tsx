import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, Trophy, Info } from 'lucide-react'
import { CreateLeagueForm } from '@/components/leagues/CreateLeagueForm'

export const metadata: Metadata = {
  title: 'Criar Liga — Foot Stock',
  description: 'Crie sua própria liga e convide amigos para competir.',
}

export default function CriarLigaPage() {
  return (
    <div className="px-4 pt-4 pb-10 max-w-lg mx-auto">
      {/* Back nav */}
      <Link
        href="/ligas"
        className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-[#EAECEF] mb-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F0B90B] rounded"
        aria-label="Voltar para lista de ligas"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Ligas
      </Link>

      <div className="flex items-center gap-2 mb-6">
        <Trophy className="h-5 w-5 text-[#F0B90B]" aria-hidden="true" />
        <h1 className="text-lg font-bold text-[#EAECEF]">Criar Liga</h1>
      </div>

      {/* Informational banner for Jogador plan */}
      <div
        className="flex items-start gap-3 p-3 mb-6 rounded-lg bg-[#F0B90B]/8 border border-[#F0B90B]/20"
        role="note"
        aria-label="Informação sobre planos"
      >
        <Info className="h-4 w-4 text-[#F0B90B] flex-shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-xs text-gray-400 leading-relaxed">
          Ligas públicas estão disponíveis para todos os planos.
          Para criar ligas de amigos ou PRO, faça upgrade para{' '}
          <span className="text-[#F0B90B] font-medium">Craque</span> ou{' '}
          <span className="text-[#F0B90B] font-medium">Lenda</span>.
        </p>
      </div>

      <CreateLeagueForm />
    </div>
  )
}
