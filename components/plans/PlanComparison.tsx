'use client'

// ============================================================================
// Foot Stock — PlanComparison: tabela comparativa de features por plano
// ============================================================================

import { useState } from 'react'
import type { PlanType } from '@/lib/enums'
import { ROUTES } from '@/lib/constants'

interface ComparisonRow {
  feature: string
  jogador: string | boolean
  craque: string | boolean
  lenda: string | boolean
}

const COMPARISON_ROWS: ComparisonRow[] = [
  { feature: 'Ordens diárias', jogador: '2/dia', craque: '5/dia', lenda: 'Ilimitadas' },
  { feature: 'Tipos de ordem', jogador: 'Mercado', craque: 'Mercado + Limitada + Agendada', lenda: 'Todos' },
  { feature: 'Delay de cotações', jogador: '1h de atraso', craque: '30min de atraso', lenda: 'Tempo real' },
  { feature: 'Short selling', jogador: false, craque: false, lenda: true },
  { feature: 'Alavancagem', jogador: false, craque: false, lenda: '2x' },
  { feature: 'Bandas de Bollinger', jogador: true, craque: true, lenda: true },
  { feature: 'MM9 + MM21', jogador: false, craque: false, lenda: true },
  { feature: 'Bônus inicial', jogador: 'FS$2.000', craque: 'FS$5.000', lenda: 'FS$25.000' },
]

function CellValue({ value, isCurrent }: { value: string | boolean; isCurrent: boolean }) {
  if (typeof value === 'boolean') {
    return value ? (
      <span className="text-green-400" aria-label="incluído">✓</span>
    ) : (
      <span className="text-gray-500" aria-label="não incluído">✗</span>
    )
  }
  return <span className={isCurrent ? 'font-medium text-white' : 'text-gray-300'}>{value}</span>
}

interface PlanComparisonProps {
  currentPlan: PlanType
}

export function PlanComparison({ currentPlan }: PlanComparisonProps) {
  const [isOpen, setIsOpen] = useState(false)

  const content = (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] text-sm" role="table">
        <thead>
          <tr className="border-b border-gray-700">
            <th scope="col" className="text-left py-2 pr-4 text-gray-400 font-medium w-1/4">Feature</th>
            <th scope="col" className={`text-center py-2 px-2 font-medium ${currentPlan === 'JOGADOR' ? 'text-white' : 'text-gray-400'}`}>Jogador</th>
            <th scope="col" className={`text-center py-2 px-2 font-medium ${currentPlan === 'CRAQUE' ? 'text-white' : 'text-gray-400'}`}>Craque</th>
            <th scope="col" className={`text-center py-2 px-2 font-medium ${currentPlan === 'LENDA' ? 'text-white' : 'text-gray-400'}`}>Lenda</th>
          </tr>
        </thead>
        <tbody>
          {COMPARISON_ROWS.map((row) => (
            <tr key={row.feature} className="border-b border-gray-800 hover:bg-gray-800/30">
              <th scope="row" className="text-left py-3 pr-4 text-gray-300 font-normal">{row.feature}</th>
              <td className={`text-center py-3 px-2 ${currentPlan === 'JOGADOR' ? 'bg-primary/5' : ''}`}>
                <CellValue value={row.jogador} isCurrent={currentPlan === 'JOGADOR'} />
              </td>
              <td className={`text-center py-3 px-2 ${currentPlan === 'CRAQUE' ? 'bg-primary/5' : ''}`}>
                <CellValue value={row.craque} isCurrent={currentPlan === 'CRAQUE'} />
              </td>
              <td className={`text-center py-3 px-2 ${currentPlan === 'LENDA' ? 'bg-primary/5' : ''}`}>
                <CellValue value={row.lenda} isCurrent={currentPlan === 'LENDA'} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-gray-500 mt-3">
        <a href={ROUTES.TERMOS} target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-300">
          Ver termos completos
        </a>
      </p>
    </div>
  )

  return (
    <div className="mt-6">
      {/* Accordion em mobile, expandido em desktop */}
      <button
        className="sm:hidden w-full flex items-center justify-between py-3 px-4 bg-gray-800/50 rounded-lg text-sm font-medium text-gray-300"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
      >
        Comparar todos os planos
        <span aria-hidden="true">{isOpen ? '▲' : '▼'}</span>
      </button>

      {/* Desktop: sempre visível */}
      <div className="hidden sm:block">{content}</div>

      {/* Mobile: condicional */}
      {isOpen && <div className="sm:hidden mt-2">{content}</div>}
    </div>
  )
}
