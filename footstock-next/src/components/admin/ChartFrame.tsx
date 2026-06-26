'use client'

import { useEffect, useRef, useState, type HTMLAttributes, type ReactNode } from 'react'

/**
 * Wrapper de gráfico resiliente a container de tamanho zero/negativo.
 *
 * PROBLEMA: os gráficos recharts do admin usavam `<ResponsiveContainer width="100%"
 * height="100%">`. Durante a navegação entre páginas admin (ex.: dashboard → /admin/motor)
 * o container do gráfico que está sendo desmontado colapsa para tamanho 0; o ResponsiveContainer
 * mede `width(-1)/height(-1)` e o recharts quebra lendo `.dot` de um ponto indefinido
 * (TypeError: Cannot read properties of undefined (reading 'dot')), estourando o error boundary
 * e mostrando o erro "antes de carregar corretamente" na aba de destino.
 *
 * SOLUÇÃO: medir o container com ResizeObserver e renderizar o gráfico com width/height EM PIXELS
 * (API não-responsiva do recharts), SOMENTE quando há tamanho positivo. Sem ResponsiveContainer,
 * o recharts nunca recebe dimensão -1, então o crash de transição não acontece. Só atualizamos o
 * tamanho quando > 0, então um colapso momentâneo mantém o último tamanho válido até desmontar.
 */
export function ChartFrame({
  className,
  children,
  ...rest
}: {
  className?: string
  children: (size: { width: number; height: number }) => ReactNode
} & Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'children'>) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const width = Math.floor(el.clientWidth)
      const height = Math.floor(el.clientHeight)
      if (width > 0 && height > 0) {
        setSize((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }))
      }
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={ref} className={className} {...rest}>
      {size ? children(size) : null}
    </div>
  )
}
