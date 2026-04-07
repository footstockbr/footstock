import { ShieldCheck, ShieldAlert } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AgeVerificationBadgeProps {
  verified: boolean
  method?: 'self_declaration' | 'date_only'
  className?: string
}

/**
 * Badge de verificação de maioridade.
 * Exibido no perfil do usuário e durante o cadastro.
 */
export function AgeVerificationBadge({
  verified,
  className,
}: AgeVerificationBadgeProps) {
  if (verified) {
    return (
      <div
        className={cn(
          'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full',
          'bg-[rgba(34,197,94,.12)] text-[#2EBD85] border border-[rgba(34,197,94,.25)]',
          className
        )}
        title="Maioridade confirmada por autodeclaração"
      >
        <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
        <span>Maior de idade confirmado</span>
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
        title="Confirmação de maioridade pendente"
      >
        <ShieldAlert className="w-3.5 h-3.5" aria-hidden="true" />
        <span>Confirmação pendente</span>
      </div>
    )
  }

  return null
}
