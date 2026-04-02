'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'

interface SplashScreenProps {
  onComplete: () => void
}

export function SplashScreen({ onComplete }: SplashScreenProps) {
  const [isVisible, setIsVisible] = useState(true)
  const hasCompleted = useRef(false)

  useEffect(() => {
    // Fallback timeout caso a animacao CSS nao dispare
    const timer = setTimeout(() => {
      if (!hasCompleted.current) {
        hasCompleted.current = true
        setIsVisible(false)
        onComplete()
      }
    }, 2800)

    return () => clearTimeout(timer)
  }, [onComplete])

  function handleAnimationEnd(e: React.AnimationEvent) {
    if (e.animationName === 'splashIn' && !hasCompleted.current) {
      hasCompleted.current = true
      setIsVisible(false)
      onComplete()
    }
  }

  if (!isVisible) return null

  return (
    <div
      role="status"
      aria-label="Carregando Foot Stock"
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg-primary"
      style={{ animation: 'splashBgFade 3s ease-in-out forwards' }}
    >
      <div
        className="flex flex-col items-center gap-6"
        style={{ animation: 'splashIn 2.8s ease-out forwards' }}
        onAnimationEnd={handleAnimationEnd}
      >
        {/* Logo */}
        <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl bg-black/5 shadow-lg">
          <Image
            src="/logo-foot.png"
            alt="Logo Foot Stock"
            width={80}
            height={80}
            className="h-full w-full object-contain"
            priority
          />
        </div>

        {/* Titulo */}
        <h1 className="text-3xl font-bold text-text-primary">Foot Stock</h1>

        {/* Subtitulo */}
        <p className="text-text-secondary text-sm tracking-[0.24em] uppercase">
          A BOLSA DO FUTEBOL
        </p>

        {/* Loading dots */}
        <div className="flex items-center gap-2" aria-hidden="true">
          <span
            className="h-2 w-2 rounded-full bg-accent"
            style={{ animation: 'pulse-dot 1.4s ease-in-out infinite' }}
          />
          <span
            className="h-2 w-2 rounded-full bg-accent"
            style={{ animation: 'pulse-dot 1.4s ease-in-out 0.2s infinite' }}
          />
          <span
            className="h-2 w-2 rounded-full bg-accent"
            style={{ animation: 'pulse-dot 1.4s ease-in-out 0.4s infinite' }}
          />
        </div>
      </div>

      <style jsx>{`
        @keyframes splashIn {
          0% {
            opacity: 0;
            transform: scale(0.8) translateY(20px);
          }
          30% {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
          80% {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
          100% {
            opacity: 0;
            transform: scale(1.05) translateY(-10px);
          }
        }

        @keyframes splashBgFade {
          0%, 80% {
            opacity: 1;
          }
          100% {
            opacity: 0;
          }
        }

        @keyframes pulse-dot {
          0%, 80%, 100% {
            opacity: 0.3;
            transform: scale(0.8);
          }
          40% {
            opacity: 1;
            transform: scale(1.2);
          }
        }
      `}</style>
    </div>
  )
}
