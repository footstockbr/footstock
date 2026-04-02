// ============================================================================
// Foot Stock — ImpactMatrix
// Tabela estática de variação máxima por categoria canônica do INTAKE.
// Rastreabilidade: INT-086, TASK-3/ST010
// ============================================================================

import { cn } from '@/lib/utils/cn'

const IMPACT_DATA = [
  {
    category: 'Financeira Crítica',
    maxPercent: 5,
    maxDecimal: 0.05,
    examples: 'Patrocínio master, bloqueio judicial, atraso salarial crítico',
  },
  {
    category: 'Esportiva Majoritária',
    maxPercent: 3,
    maxDecimal: 0.03,
    examples: 'Título, eliminação, rebaixamento',
  },
  {
    category: 'Mercado de Ativos',
    maxPercent: 2,
    maxDecimal: 0.02,
    examples: 'Venda e contratação de jogadores',
  },
  {
    category: 'Integridade e Saúde',
    maxPercent: 1.5,
    maxDecimal: 0.015,
    examples: 'Doping, lesão grave, suspensão',
  },
  {
    category: 'Institucional',
    maxPercent: 1,
    maxDecimal: 0.01,
    examples: 'Eleição, investidor SAF, parceria',
  },
  {
    category: 'Esportiva Menor',
    maxPercent: 0.5,
    maxDecimal: 0.005,
    examples: 'Jogo-treino, promoção de base, amistoso',
  },
] as const

function cellStyle(v: number): string {
  if (v >= 3) return 'bg-emerald-500/30 text-emerald-300'
  if (v >= 1.5) return 'bg-emerald-500/20 text-emerald-400'
  return 'bg-emerald-500/10 text-emerald-500'
}

export function ImpactMatrix() {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      <h3 className="mb-1 text-sm font-semibold text-zinc-100">
        Matriz de Impacto
      </h3>
      <p className="mb-3 text-xs text-zinc-500">
        Limites canônicos de variação por categoria de notícia (conforme INTAKE)
      </p>

      <div className="overflow-x-auto rounded-lg">
        <table
          className="w-full min-w-[620px] text-xs"
          aria-label="Matriz de impacto por categoria de notícia"
        >
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-500">
              <th className="px-2 py-2 text-left font-medium">Categoria</th>
              <th className="px-2 py-2 text-center font-medium">Máx. (%)</th>
              <th className="px-2 py-2 text-center font-medium">Máx. (decimal)</th>
              <th className="px-2 py-2 text-left font-medium">Exemplos</th>
            </tr>
          </thead>
          <tbody>
            {IMPACT_DATA.map(row => (
              <tr key={row.category} className="border-b border-zinc-800/50 last:border-0">
                <td className="px-2 py-2 text-zinc-300">{row.category}</td>
                <td className="px-2 py-2 text-center">
                  <span
                    className={cn(
                      'inline-block rounded px-1.5 py-0.5 text-[11px] font-medium',
                      cellStyle(row.maxPercent)
                    )}
                  >
                    ±{row.maxPercent.toFixed(1)}%
                  </span>
                </td>
                <td className="px-2 py-2 text-center font-mono text-zinc-400">
                  {row.maxDecimal.toFixed(3)}
                </td>
                <td className="px-2 py-2 text-zinc-500">{row.examples}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
