"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui";
import type { InvestorProfile } from "@/types";

interface TourStep {
  title: string;
  description: string;
  icon: string;
}

const TOUR_STEPS_BY_PROFILE: Record<InvestorProfile, TourStep[]> = {
  INICIANTE: [
    {
      icon: "📊",
      title: "Seu Dashboard",
      description:
        "Aqui você vê o resumo da sua carteira, saldo FS$ e as últimas notícias dos seus clubes.",
    },
    {
      icon: "🏟️",
      title: "Mercado",
      description:
        "No Mercado você pode ver as cotações de todos os 40 clubes e comprar suas primeiras ações.",
    },
    {
      icon: "💰",
      title: "FS$ — A Moeda do Jogo",
      description:
        "Você começou com FS$10.000. Use para comprar ações. É dinheiro virtual, sem riscos reais!",
    },
    {
      icon: "📰",
      title: "Notícias que Movem o Mercado",
      description:
        "Gols, contratações e derrotas afetam o preço das ações. Fique de olho nas notícias!",
    },
    {
      icon: "🏆",
      title: "Ligas",
      description:
        "Compete com amigos em ligas e veja quem monta a melhor carteira!",
    },
  ],
  INTERMEDIARIO: [
    {
      icon: "📊",
      title: "Dashboard Completo",
      description:
        "Acompanhe P&L, posições abertas e performance da carteira em tempo real.",
    },
    {
      icon: "📋",
      title: "Tipos de Ordem",
      description:
        "Além de ordem a mercado, você tem acesso a ordens limitadas e OCO (One-Cancels-Other).",
    },
    {
      icon: "📈",
      title: "Motor de Mercado",
      description:
        "Preços são calculados por 9 camadas quantitativas baseadas em supply/demand real.",
    },
    {
      icon: "🎯",
      title: "Análise de Ativo",
      description:
        "Veja valuation, histórico de preços, sentiment e análise IA por clube.",
    },
    {
      icon: "⚠️",
      title: "Gestão de Risco",
      description:
        "Margem bloqueada, stop-loss e circuit breaker protegem seus FS$.",
    },
  ],
  AVANCADO: [
    {
      icon: "⚡",
      title: "Tempo Real (Plano Lenda)",
      description:
        "Cotações em tempo real via Socket.io. Motor atualiza a cada 2 segundos.",
    },
    {
      icon: "📉",
      title: "Short Selling",
      description:
        "Com o plano Lenda, você pode operar vendido em clubes que acha que vão cair.",
    },
    {
      icon: "🤖",
      title: "9 Camadas Quantitativas",
      description:
        "Order Flow, Kyle's Lambda, GARCH e mais — o motor usa microestrutura de mercado real.",
    },
    {
      icon: "🔄",
      title: "OCO Avançado",
      description:
        "Defina stop-loss e take-profit simultaneamente. Proteção automática de posição.",
    },
    {
      icon: "🏅",
      title: "Ligas PRO",
      description:
        "Crie ligas competitivas com FS$ real em jogo. Ranking por Sharpe Ratio.",
    },
  ],
  FA_FUTEBOL: [
    {
      icon: "⚽",
      title: "Seu Clube no Mercado",
      description:
        "Veja como seu clube vai nos jogos — cada vitória aumenta o preço da ação!",
    },
    {
      icon: "📰",
      title: "Notícias do Clube",
      description:
        "Contratações, lesões e resultados em tempo real afetam o mercado.",
    },
    {
      icon: "🏆",
      title: "Ligas de Fãs",
      description:
        "Compete com outros torcedores. Quem apoia o clube certo ganha mais FS$!",
    },
    {
      icon: "🌟",
      title: "Torça e Lucre",
      description:
        "Simplesmente torça pelo seu clube e veja seu saldo crescer com as vitórias.",
    },
    {
      icon: "👥",
      title: "Fórum de Torcedores",
      description:
        "Discuta táticas, resultados e o futuro do clube com outros fãs.",
    },
  ],
};

interface TourGuideProps {
  investorProfile: InvestorProfile;
  onComplete: () => void;
  onSkip: () => void;
  isLoading?: boolean;
}

export function TourGuide({
  investorProfile,
  onComplete,
  onSkip,
  isLoading,
}: TourGuideProps) {
  const steps = TOUR_STEPS_BY_PROFILE[investorProfile];
  const [currentStep, setCurrentStep] = useState(0);

  const isLastStep = currentStep === steps.length - 1;
  const step = steps[currentStep]!;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-[#7a7060]">
          {currentStep + 1} de {steps.length}
        </span>
        <button
          type="button"
          onClick={onSkip}
          className="text-xs text-[#7a7060] hover:text-[#f0ead6] transition-colors min-h-[44px] px-2"
          aria-label="Pular tour de boas-vindas"
          data-testid="tour-skip"
        >
          Pular tour
        </button>
      </div>

      {/* Progress bar */}
      <div
        className="flex gap-1"
        role="progressbar"
        aria-valuenow={currentStep + 1}
        aria-valuemax={steps.length}
        aria-valuemin={1}
        aria-label="Progresso do tour"
      >
        {steps.map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-all duration-150",
              i <= currentStep ? "bg-[#c9a84c]" : "bg-[rgba(201,168,76,.18)]"
            )}
          />
        ))}
      </div>

      {/* Step content */}
      <div
        className="flex flex-col items-center gap-4 py-8 text-center"
        aria-live="polite"
        aria-atomic="true"
      >
        <span className="text-5xl" aria-hidden="true">
          {step.icon}
        </span>
        <div>
          <h2 className="text-lg font-bold text-[#f0ead6]">{step.title}</h2>
          <p className="text-sm text-[#7a7060] mt-2 leading-relaxed">
            {step.description}
          </p>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex gap-3">
        {currentStep > 0 && (
          <Button
            variant="ghost"
            onClick={() => setCurrentStep((p) => p - 1)}
            className="flex-1"
            data-testid="tour-prev"
          >
            Anterior
          </Button>
        )}
        <Button
          variant="primary"
          isLoading={isLoading && isLastStep}
          onClick={() => {
            if (isLastStep) onComplete();
            else setCurrentStep((p) => p + 1);
          }}
          className="flex-1"
          data-testid="tour-next"
        >
          {isLastStep ? "Começar a investir! 🚀" : "Próximo"}
        </Button>
      </div>
    </div>
  );
}
