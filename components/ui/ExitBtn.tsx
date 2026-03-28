import { cn } from '@/lib/utils/cn'

export interface ExitBtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label?: string
}

/** Botao X padronizado para fechar modais, drawers, etc. */
export function ExitBtn({ label = 'Fechar', className, ...props }: ExitBtnProps) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        'flex items-center justify-center',
        'w-8 h-8 rounded-md',
        'text-text-muted hover:text-text-primary',
        'hover:bg-bg-surface transition-colors duration-fast',
        'focus-visible:outline-2 focus-visible:outline-accent',
        className
      )}
      {...props}
    >
      <svg
        className="w-4 h-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M6 18L18 6M6 6l12 12"
        />
      </svg>
    </button>
  )
}
