import { ShieldCheck, ShieldAlert } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AgeVerificationBadgeProps {
  verified: boolean
  method?: 'flagcheck' | 'self_declaration' | 'date_only'
  className?: string
}

/**
 * Badge de verificação ECA Digital (Lei 14.790/2023).
 * Exibido no perfil do usuário e durante o cadastro.
 */
export function AgeVerificationBadge({
  verified,
  method,
  className,
}: AgeVerificationBadgeProps) {
  if (verified && method === 'flagcheck') {
    return (
      <div
        className={cn(
          'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full',
          'bg-[rgba(34,197,94,.12)] text-[#2EBD85] border border-[rgba(34,197,94,.25)]',
          className
        )}
        title="Maioridade verificada via FlagCheck (ECA Digital)"
      >
        <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
        <span>Maior de idade verificado</span>
      </div>
    )
  }

  if (!verified) {
    return (
      <div
        className={cn(
          'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full',
          'bg-[rgba(240,185,11,.1)] text-[#F0B90B] border border-[rgba(240,185,11,.25)]',
          className
        )}
        title="Verificação de maioridade pendente"
      >
        <ShieldAlert className="w-3.5 h-3.5" aria-hidden="true" />
        <span>Verificação pendente</span>
      </div>
    )
  }

  return null
}
