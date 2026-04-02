import { cn } from '@/lib/utils/cn'

export interface EmptyStateProps {
  title: string
  description?: string
  icon?: React.ReactNode
  /** Acao principal (botao ou link) */
  action?: React.ReactNode
  /** Conteudo adicional abaixo da mensagem */
  children?: React.ReactNode
  className?: string
  'aria-label'?: string
}

/** Estado vazio com icone, mensagem e acao opcional */
export function EmptyState({
  title,
  description,
  icon,
  action,
  children,
  className,
  'aria-label': ariaLabel,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 py-12 px-4 text-center',
        className
      )}
      aria-label={ariaLabel}
    >
      {icon && (
        <div className="text-text-muted text-4xl" aria-hidden="true">
          {icon}
        </div>
      )}
      <div>
        <p className="text-sm font-medium text-text-secondary">{title}</p>
        {description && <p className="text-xs text-text-muted mt-1 max-w-xs">{description}</p>}
      </div>
      {action && <div className="mt-2">{action}</div>}
      {children && <div className="mt-2">{children}</div>}
    </div>
  )
}
