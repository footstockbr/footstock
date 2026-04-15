'use client'

import { useState } from 'react'
import { Zap, X, ArrowUpCircle } from 'lucide-react'
import Link from 'next/link'
import { formatFS } from '@/lib/utils/format'
import { ROUTES } from '@/lib/constants/routes'

interface Props {
  ticker: string
  totalPending: number
  /** Callback ao fechar o tooltip */
  onClose?: () => void
}

/**
 * Tooltip detalhado para JOGADOR exibindo yield pendente não realizado.
 * Inclui explicação educacional e CTA de upgrade de plano.
 * Visível apenas quando totalPending > 0.
 */
export function YieldPendingTooltip({ ticker, totalPending, onClose }: Props) {
  const [visible, setVisible] = useState(true)

  if (!visible || totalPending <= 0) return null

  const handleClose = () => {
    setVisible(false)
    onClose?.()
  }

  return (
    <div
      className="rounded-xl border p-4 text-sm"
      style={{
        background: '#1A1F2E',
        borderColor: 'rgba(102,126,234,.3)',
      }}
      data-testid="yield-pending-tooltip"
      role="region"
      aria-label="Yield diferencial pendente"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(102,126,234,.15)' }}
          >
            <Zap className="h-3.5 w-3.5" style={{ color: '#667EEA' }} />
          </div>
          <span className="font-semibold" style={{ color: '#EAECEF' }}>
            Yield Pendente — {ticker}
          </span>
        </div>
        <button
          onClick={handleClose}
          className="p-1 rounded hover:bg-white/5 transition-colors"
          aria-label="Fechar"
        >
          <X className="h-3.5 w-3.5" style={{ color: '#929AA5' }} />
        </button>
      </div>

      {/* Valor */}
      <p className="text-lg font-bold mb-2" style={{ color: '#667EEA' }}>
        {formatFS(totalPending)}
      </p>

      {/* Explicação */}
      <p className="text-xs leading-relaxed mb-3" style={{ color: '#929AA5' }}>
        Como usuário <strong style={{ color: '#EAECEF' }}>Jogador</strong>, seu yield é realizado
        ao <strong style={{ color: '#EAECEF' }}>vender a posição</strong>. Este valor será
        incorporado automaticamente ao seu saldo quando você vender ações do {ticker}.
      </p>

      {/* Dica educacional */}
      <p className="text-[11px] mb-4" style={{ color: '#707A8A' }}>
        Usuários <strong style={{ color: '#EAECEF' }}>Craque</strong> e{' '}
        <strong style={{ color: '#EAECEF' }}>Lenda</strong> recebem yield direto na carteira,
        sem precisar vender. Isso é a diferença entre dividendo e ganho de capital.
      </p>

      {/* CTA Upgrade */}
      <Link
        href={ROUTES.PLANOS ?? '/planos'}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors w-full justify-center"
        style={{
          background: 'rgba(102,126,234,.15)',
          color: '#667EEA',
          border: '1px solid rgba(102,126,234,.3)',
        }}
        data-testid="yield-pending-upgrade-cta"
      >
        <ArrowUpCircle className="h-3.5 w-3.5" />
        Fazer upgrade para Craque ou Lenda
      </Link>
    </div>
  )
}
