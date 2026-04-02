import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils/cn'

export interface SkeletonProps {
  className?: string
  style?: CSSProperties
}

/** Bloco de skeleton com animacao shimmer (usa classe .skeleton de globals.css) */
export function Skeleton({ className, style }: SkeletonProps) {
  return (
    <div
      className={cn('skeleton', className)}
      style={style}
      aria-hidden="true"
    />
  )
}

/** Skeleton de texto com multiplas linhas */
export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn('h-4 rounded', i === lines - 1 ? 'w-3/4' : 'w-full')}
        />
      ))}
    </div>
  )
}
