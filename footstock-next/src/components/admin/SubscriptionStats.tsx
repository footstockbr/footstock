'use client'

import { PieChart, Pie, Cell, Tooltip, Legend } from 'recharts'
import { ChartFrame } from './ChartFrame'
import { formatBRL } from '@/lib/utils/format'
import { PLAN_HEX_COLORS, PLAN_PRICE_VALUES } from '@/lib/constants/admin-ui'

const PLAN_COLORS = PLAN_HEX_COLORS
const PLAN_PRICES = PLAN_PRICE_VALUES

interface RevenueByGateway {
  gateway: string
  revenue: number
}

interface SubscriptionStatsProps {
  planDistribution: Record<string, number>
  revenueByGateway: RevenueByGateway[]
}

export function SubscriptionStats({ planDistribution, revenueByGateway }: SubscriptionStatsProps) {
  const pieData = Object.entries(planDistribution)
    .filter(([, count]) => count > 0)
    .map(([plan, count]) => ({
      name: plan === 'JOGADOR' ? 'Jogador' : plan === 'CRAQUE' ? 'Craque' : 'Lenda',
      value: count,
      price: PLAN_PRICES[plan] ?? 0,
    }))

  const totalSubscribers = pieData.reduce((acc, d) => acc + d.value, 0)

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Donut chart por plano */}
      <div className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4">
        <h3 className="text-sm font-medium text-[#EAECEF] mb-4">Distribuição por Plano</h3>
        {totalSubscribers === 0 ? (
          <div className="flex items-center justify-center h-40 text-sm text-[#929AA5]">
            Sem assinaturas ativas
          </div>
        ) : (
          <ChartFrame className="h-48" role="img" aria-label="Gráfico de distribuição de planos">
            {({ width, height }) => (
              <PieChart width={width} height={height}>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius="55%"
                  outerRadius="75%"
                  paddingAngle={3}
                  dataKey="value"
                >
                  {pieData.map((entry) => (
                    <Cell
                      key={entry.name}
                      fill={PLAN_COLORS[entry.name.toUpperCase() === 'CRAQUE' ? 'CRAQUE' : entry.name.toUpperCase()] ?? '#374151'}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#1a1815', border: '1px solid rgba(240,185,11,.2)', borderRadius: 8, fontSize: 12 }}
                  formatter={(value, name) => [`${value} assinantes`, String(name)]}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(value) => <span style={{ color: '#c5b99a', fontSize: 12 }}>{value}</span>}
                />
              </PieChart>
            )}
          </ChartFrame>
        )}
      </div>

      {/* Receita por gateway */}
      <div className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4">
        <h3 className="text-sm font-medium text-[#EAECEF] mb-4">Receita por Gateway (mês)</h3>
        {revenueByGateway.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-sm text-[#929AA5]">
            Sem pagamentos aprovados este mês
          </div>
        ) : (
          <div className="space-y-3">
            {revenueByGateway.map((g) => {
              const total = revenueByGateway.reduce((acc, r) => acc + r.revenue, 0)
              const pct = total > 0 ? (g.revenue / total) * 100 : 0
              return (
                <div key={g.gateway}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-[#c5b99a]">{g.gateway.replace('_', ' ')}</span>
                    <span className="text-[#F0B90B] font-medium">{formatBRL(g.revenue)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[#2a2420] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#F0B90B] transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
