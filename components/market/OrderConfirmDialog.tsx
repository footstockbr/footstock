'use client'

interface Props {
  isOpen: boolean
  type: 'BUY' | 'SELL'
  ticker: string
  qty: number
  price: number
  fee: number
  onConfirm: () => void
  onCancel: () => void
  loading?: boolean
}

const TYPE_LABELS = { BUY: 'Comprar', SELL: 'Vender' }

export function OrderConfirmDialog({ isOpen, type, ticker, qty, price, fee, onConfirm, onCancel, loading }: Props) {
  if (!isOpen) return null

  const total = qty * price
  const typeLabel = TYPE_LABELS[type]

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50" role="dialog" aria-modal="true" aria-label="Confirmar ordem">
      <div className="w-full max-w-sm rounded-xl bg-bg-surface border border-border-default shadow-xl p-5 space-y-4">
        <h2 className="text-base font-semibold text-text-primary">Confirmar {typeLabel}</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between text-text-secondary">
            <span>Ativo</span>
            <span className="font-medium text-text-primary">{ticker}</span>
          </div>
          <div className="flex justify-between text-text-secondary">
            <span>Tipo</span>
            <span className={`font-medium ${type === 'BUY' ? 'text-green-500' : 'text-red-500'}`}>{typeLabel}</span>
          </div>
          <div className="flex justify-between text-text-secondary">
            <span>Quantidade</span>
            <span className="font-medium text-text-primary">{qty.toLocaleString('pt-BR')}</span>
          </div>
          <div className="flex justify-between text-text-secondary">
            <span>Preço unitário</span>
            <span className="font-medium text-text-primary">FS$ {price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="border-t border-border-default pt-2 flex justify-between text-text-secondary">
            <span>Total</span>
            <span className="font-medium text-text-primary">FS$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="flex justify-between text-text-secondary">
            <span>Taxa</span>
            <span className="text-text-secondary">FS$ {fee.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-2.5 rounded-lg border border-border-default text-sm text-text-secondary hover:bg-bg-card transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50 ${
              type === 'BUY' ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'
            }`}
          >
            {loading ? 'Enviando...' : `Confirmar ${typeLabel}`}
          </button>
        </div>
      </div>
    </div>
  )
}
