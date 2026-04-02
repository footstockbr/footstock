'use client'

// ============================================================================
// Foot Stock — GatewaySelector: radio group acessível de gateways de pagamento
// PCI-DSS: dados de cartão NUNCA passam por este componente
// ============================================================================

interface GatewayOption {
  id: string
  name: string
  subtitle: string
}

const GATEWAY_OPTIONS: GatewayOption[] = [
  { id: 'MERCADO_PAGO', name: 'Mercado Pago', subtitle: 'Pix, cartão, saldo Mercado Pago' },
  { id: 'PAGSEGURO', name: 'PagSeguro', subtitle: 'Cartão, Pix, boleto' },
  { id: 'PAYPAL', name: 'PayPal', subtitle: 'Cartão internacional' },
]

interface GatewaySelectorProps {
  value: string | null
  onChange: (value: string) => void
  /** Plano gratuito: não renderiza o seletor */
  isPlanFree?: boolean
}

export function GatewaySelector({ value, onChange, isPlanFree = false }: GatewaySelectorProps) {
  if (isPlanFree) return null

  return (
    <div className="mt-6">
      <h3 className="text-sm font-medium text-gray-300 mb-3">Forma de pagamento</h3>
      <div
        role="radiogroup"
        aria-label="Forma de pagamento"
        className="flex flex-col gap-2"
      >
        {GATEWAY_OPTIONS.map((option) => {
          const isSelected = value === option.id
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => onChange(option.id)}
              onKeyDown={(e) => {
                if (e.key === ' ' || e.key === 'Enter') {
                  e.preventDefault()
                  onChange(option.id)
                }
              }}
              className={`
                flex items-center gap-4 p-4 rounded-lg border-2 text-left transition-all min-h-[56px] w-full
                ${isSelected
                  ? 'border-yellow-500 bg-yellow-900/10'
                  : 'border-gray-700 hover:border-gray-500 bg-transparent'
                }
              `}
              data-testid={`gateway-${option.id.toLowerCase()}`}
            >
              {/* Logo placeholder — substituir por SVG real */}
              <div
                className="w-10 h-10 rounded-md flex items-center justify-center text-xs font-bold bg-gray-700 text-gray-300 shrink-0"
                aria-hidden="true"
              >
                {option.id.substring(0, 2)}
              </div>
              <div>
                <p className="font-medium text-sm text-white">{option.name}</p>
                <p className="text-xs text-gray-400">{option.subtitle}</p>
              </div>
              {isSelected && (
                <div className="ml-auto w-4 h-4 rounded-full border-2 border-yellow-500 bg-yellow-500 flex items-center justify-center" aria-hidden="true">
                  <div className="w-1.5 h-1.5 rounded-full bg-white" />
                </div>
              )}
            </button>
          )
        })}
      </div>
      <p className="text-xs text-gray-500 mt-3">
        Você será redirecionado para o ambiente seguro do parceiro. O Foot Stock não armazena seus dados de cartão.
      </p>
    </div>
  )
}
