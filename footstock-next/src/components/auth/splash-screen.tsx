"use client";

import { useEffect, useRef } from "react";

interface SplashScreenProps {
  onComplete: () => void;
}

function SplashScreen({ onComplete }: SplashScreenProps) {
  const logoRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fallback = setTimeout(onComplete, 3500);

    const el = logoRef.current;
    if (!el) return;

    const handleAnimEnd = () => {
      clearTimeout(fallback);
      onComplete();
    };

    el.addEventListener("animationend", handleAnimEnd);
    return () => {
      el.removeEventListener("animationend", handleAnimEnd);
      clearTimeout(fallback);
    };
  }, [onComplete]);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B0E11]"
      role="status"
      aria-label="Carregando Foot Stock"
      style={{
        animation: "splash-bg-fade 2.8s ease-in-out forwards",
      }}
    >
      <div
        ref={logoRef}
        className="flex flex-col items-center gap-4"
        style={{
          animation: "splash-in 2.8s ease-in-out forwards",
        }}
        aria-hidden="true"
      >
        {/* @ASSET_PLACEHOLDER
name: logo-foot
type: image
extension: png
aspect_ratio: 1:1
dimensions: 80x80
description: Logo principal do Foot Stock para a splash screen. Bola de futebol estilizada com elementos de mercado financeiro (gráfico, ticker), fundo transparente, design premium.
context: Tela de splash (carregamento inicial do app)
style: Premium, minimalista, ouro sobre preto
mood: Confiante, premium, esportivo-financeiro
colors: #F0B90B (ouro) como cor principal
elements: Bola de futebol + gráfico estilizado de trading
avoid: Texto, cores frias, complexidade excessiva
        */}
        <img
          src="/logo-foot.png"
          alt="Foot Stock"
          width={80}
          height={80}
          className="w-20 h-20 object-contain"
        />
        <div className="flex flex-col items-center gap-1">
          <h1 className="text-2xl font-bold text-[#EAECEF] tracking-tight">
            Foot Stock
          </h1>
          <p className="text-sm text-[#707A8A]">O mercado do futebol</p>
        </div>

        {/* Loading dots */}
        <div className="flex items-center gap-2" aria-hidden="true">
          {[0, 0.2, 0.4].map((delay, i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-[#F0B90B]"
              style={{
                animation: `pulse-dot 1s ease-in-out infinite`,
                animationDelay: `${delay}s`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export { SplashScreen };
