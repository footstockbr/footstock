'use client'

import { useState, useCallback, useEffect, useRef } from 'react'

/**
 * DevDataTestOverlay — Overlay visual de debug para data-testid
 *
 * SOMENTE para ambiente de desenvolvimento.
 * Este componente NUNCA deve aparecer em produção.
 *
 * Funcionalidades:
 * - Botão flutuante [data-test] arrastável — reposicionável na tela
 * - Ao clicar, exibe overlays com todos os data-testid do DOM
 * - Ao clicar em um overlay, copia o data-testid para o clipboard
 * - Segundo clique no botão esconde todos os overlays
 */

export function DevDataTestOverlay() {
  const [isActive, setIsActive] = useState(false)
  const [elements, setElements] = useState<Array<{ id: string; rect: DOMRect }>>([])
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Posição do botão draggable (inicia no canto superior direito)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const isDragging = useRef(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const hasDragged = useRef(false)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Inicializa posição após mount (precisa de window)
  useEffect(() => {
    setPos({ x: window.innerWidth - 120, y: 12 })
  }, [])

  const scanDataTestIds = useCallback(() => {
    const allElements = document.querySelectorAll('[data-testid]')
    const mapped = Array.from(allElements).map((el) => ({
      id: el.getAttribute('data-testid')!,
      rect: el.getBoundingClientRect(),
    }))
    setElements(mapped)
  }, [])

  const handleToggle = useCallback(() => {
    if (hasDragged.current) {
      hasDragged.current = false
      return
    }
    if (!isActive) {
      scanDataTestIds()
    }
    setIsActive((prev) => !prev)
  }, [isActive, scanDataTestIds])

  const handleCopy = useCallback(async (testId: string) => {
    const copyText = `data-testid="${testId}"`
    try {
      await navigator.clipboard.writeText(copyText)
      setCopiedId(testId)
      setTimeout(() => setCopiedId(null), 1500)
    } catch {
      // Fallback para browsers que não suportam clipboard API
      const textArea = document.createElement('textarea')
      textArea.value = copyText
      textArea.style.position = 'fixed'
      textArea.style.left = '-9999px'
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      setCopiedId(testId)
      setTimeout(() => setCopiedId(null), 1500)
    }
  }, [])

  // Drag handlers (mouse)
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!pos) return
    isDragging.current = true
    hasDragged.current = false
    dragOffset.current = {
      x: e.clientX - pos.x,
      y: e.clientY - pos.y,
    }
    e.preventDefault()
  }, [pos])

  // Touch start para drag
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!pos || !e.touches[0]) return
    isDragging.current = true
    hasDragged.current = false
    dragOffset.current = {
      x: e.touches[0].clientX - pos.x,
      y: e.touches[0].clientY - pos.y,
    }
  }, [pos])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      hasDragged.current = true
      const newX = Math.max(0, Math.min(window.innerWidth - 100, e.clientX - dragOffset.current.x))
      const newY = Math.max(0, Math.min(window.innerHeight - 36, e.clientY - dragOffset.current.y))
      setPos({ x: newX, y: newY })
    }

    const handleMouseUp = () => {
      isDragging.current = false
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging.current || !e.touches[0]) return
      hasDragged.current = true
      const touch = e.touches[0]
      const newX = Math.max(0, Math.min(window.innerWidth - 100, touch.clientX - dragOffset.current.x))
      const newY = Math.max(0, Math.min(window.innerHeight - 36, touch.clientY - dragOffset.current.y))
      setPos({ x: newX, y: newY })
      e.preventDefault()
    }

    const handleTouchEnd = () => {
      isDragging.current = false
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('touchmove', handleTouchMove, { passive: false })
    window.addEventListener('touchend', handleTouchEnd)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleTouchEnd)
    }
  }, [])

  // Atualizar posições dos overlays no scroll e resize
  useEffect(() => {
    if (!isActive) return

    const handleUpdate = () => scanDataTestIds()

    window.addEventListener('scroll', handleUpdate, true)
    window.addEventListener('resize', handleUpdate)

    return () => {
      window.removeEventListener('scroll', handleUpdate, true)
      window.removeEventListener('resize', handleUpdate)
    }
  }, [isActive, scanDataTestIds])

  // Camada 1: verificação de ambiente — APÓS todos os hooks
  if (process.env.NODE_ENV !== 'development') {
    return null
  }

  // Aguarda posição inicial (SSR safety)
  if (!pos) return null

  return (
    <>
      {/* Botão flutuante arrastável */}
      <button
        ref={buttonRef}
        onClick={handleToggle}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        style={{
          position: 'fixed',
          top: `${pos.y}px`,
          left: `${pos.x}px`,
          zIndex: 99999,
          padding: '6px 12px',
          fontSize: '12px',
          fontWeight: 600,
          fontFamily: 'monospace',
          border: '2px solid',
          borderColor: isActive ? '#ffffff' : '#F6465D',
          borderRadius: '6px',
          backgroundColor: isActive ? '#F6465D' : '#ffffff',
          color: isActive ? '#ffffff' : '#F6465D',
          cursor: 'grab',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          transition: 'background-color 150ms ease, border-color 150ms ease, color 150ms ease',
          userSelect: 'none',
          touchAction: 'none',
        }}
        aria-label={isActive ? 'Esconder data-testid overlays' : 'Mostrar data-testid overlays'}
      >
        [data-test]
      </button>

      {/* Overlays dos data-testid */}
      {isActive &&
        elements.map((el) => (
          <button
            key={`${el.id}-${el.rect.top}-${el.rect.left}`}
            onClick={() => handleCopy(el.id)}
            title={`Clique para copiar: ${el.id}`}
            style={{
              position: 'fixed',
              top: `${el.rect.top}px`,
              left: `${el.rect.left}px`,
              zIndex: 99998,
              padding: '2px 6px',
              fontSize: '10px',
              fontWeight: 600,
              fontFamily: 'monospace',
              backgroundColor: copiedId === el.id ? '#16a34a' : '#F6465D',
              color: '#ffffff',
              borderRadius: '3px',
              border: 'none',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              pointerEvents: 'auto',
              boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
              transition: 'background-color 150ms ease',
              lineHeight: '1.4',
            }}
          >
            {copiedId === el.id ? 'Copiado!' : el.id}
          </button>
        ))}
    </>
  )
}
