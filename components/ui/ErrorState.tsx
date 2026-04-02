import { cn } from '@/lib/utils/cn'
import { Btn } from '@/components/ui/Btn'

export interface ErrorStateProps {
  title?: string
  /** Mensagem de erro. Alias: pode ser passado sem title para uso compacto */
  message: string
  onRetry?: () => void
  compact?: boolean
  className?: string
}

/** Estado de erro com icone, mensagem e botao de retry opcional */
export function ErrorState({
  title = 'Algo deu errado',
  message,
  onRetry,
  compact = false,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 text-center',
        compact ? 'py-4 px-3' : 'py-12 px-4',
        className
      )}
      role="alert"
    >
      <div className="text-error" aria-hidden="true">
        <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
          />
        </svg>
      </div>
      <div>
        <p className="text-sm font-medium text-text-primary">{title}</p>
        <p className="text-xs text-text-secondary mt-1">{message}</p>
      </div>
      {onRetry && (
        <Btn variant="secondary" size="sm" onClick={onRetry} className="mt-2">
          Tentar novamente
        </Btn>
      )}
    </div>
  )
}
