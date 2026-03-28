import Image from 'next/image'
import { cn } from '@/lib/utils/cn'

export interface AvatarProps {
  /** URL da imagem do avatar */
  src?: string | null
  /** Texto alternativo (obrigatorio para acessibilidade) */
  alt: string
  /** Tamanho do avatar */
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
}

const sizeMap = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
}

const sizePx = { xs: 24, sm: 32, md: 40, lg: 48 }

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

/** Avatar com imagem ou fallback de iniciais */
export function Avatar({ src, alt, size = 'md', className }: AvatarProps) {
  return (
    <div
      className={cn(
        'relative rounded-full overflow-hidden flex-shrink-0',
        'bg-accent-muted border border-border-default',
        'flex items-center justify-center',
        sizeMap[size],
        className
      )}
      role="img"
      aria-label={alt}
    >
      {src ? (
        <Image src={src} alt={alt} fill className="object-cover" sizes={`${sizePx[size]}px`} />
      ) : (
        <span className="font-semibold text-accent select-none" aria-hidden="true">
          {getInitials(alt)}
        </span>
      )}
    </div>
  )
}
