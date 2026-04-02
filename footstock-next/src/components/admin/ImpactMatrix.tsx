import { cn } from '@/lib/utils'

const IMPACT_DATA: {
  category: string
  a: number
  b: number
  c: number
  d: number
}[] = [
  { category: 'Resultado (vitória)', a: 3, b: 2, c: 1.5, d: 1 },
  { category: 'Título', a: 8, b: 6, c: 4, d: 2 },
  { category: 'Derrota', a: -3, b: -2, c: -1.5, d: -1 },
  { category: 'Empate', a: 0, b: 0, c: 0, d: 0 },
  { category: 'Contratação', a: 2, b: 1.5, c: 1, d: 0.5 },
  { category: 'Rescisão', a: -1, b: -0.75, c: -0.5, d: -0.25 },
  { category: 'Lesão', a: -1.5, b: -1, c: -0.8, d: -0.5 },
]

function cellStyle(v: number): string {
  const abs = Math.abs(v)
  if (v === 0) return 'bg-slate-700/20 text-slate-500'
  const intensity = abs >= 6 ? 'strong' : abs >= 3 ? 'medium' : 'light'
  if (v > 0) {
    return intensity === 'strong'
      ? 'bg-emerald-500/30 text-emerald-300'
      : intensity === 'medium'
      ? 'bg-emerald-500/20 text-emerald-400'
      : 'bg-emerald-500/10 text-emerald-500'
  }
  return intensity === 'strong'
    ? 'bg-red-500/30 text-red-300'
    : intensity === 'medium'
    ? 'bg-red-500/20 text-red-400'
    : 'bg-red-500/10 text-red-500'
}

export function ImpactMatrix() {
  return (
    <div className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4">
      <h2 className="text-sm font-semibold text-[#EAECEF] mb-1">
        Matriz de Impacto — Variação esperada por evento e divisão
      </h2>
      <p className="text-xs text-[#929AA5] mb-3">% de variação de preço esperada por evento</p>

      <div className="overflow-x-auto rounded-lg">
        <table className="w-full min-w-[380px] text-xs">
          <thead>
            <tr className="text-[#929AA5] border-b border-[rgba(240,185,11,.08)]">
              <th className="text-left py-2 px-2 font-medium">Categoria</th>
              <th className="text-center py-2 px-2 font-medium">Série A</th>
              <th className="text-center py-2 px-2 font-medium">Série B</th>
              <th className="text-center py-2 px-2 font-medium hidden sm:table-cell">Série C</th>
              <th className="text-center py-2 px-2 font-medium hidden sm:table-cell">Série D</th>
            </tr>
          </thead>
          <tbody>
            {IMPACT_DATA.map((row) => (
              <tr key={row.category} className="border-b border-[rgba(240,185,11,.06)] last:border-0">
                <td className="py-2 px-2 text-[#c5b99a]">{row.category}</td>
                <td className="py-2 px-2 text-center">
                  <span className={cn('inline-block px-1.5 py-0.5 rounded text-[11px] font-medium', cellStyle(row.a))}>
                    {row.a > 0 ? '+' : ''}{row.a}%
                  </span>
                </td>
                <td className="py-2 px-2 text-center">
                  <span className={cn('inline-block px-1.5 py-0.5 rounded text-[11px] font-medium', cellStyle(row.b))}>
                    {row.b > 0 ? '+' : ''}{row.b}%
                  </span>
                </td>
                <td className="py-2 px-2 text-center hidden sm:table-cell">
                  <span className={cn('inline-block px-1.5 py-0.5 rounded text-[11px] font-medium', cellStyle(row.c))}>
                    {row.c > 0 ? '+' : ''}{row.c}%
                  </span>
                </td>
                <td className="py-2 px-2 text-center hidden sm:table-cell">
                  <span className={cn('inline-block px-1.5 py-0.5 rounded text-[11px] font-medium', cellStyle(row.d))}>
                    {row.d > 0 ? '+' : ''}{row.d}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
