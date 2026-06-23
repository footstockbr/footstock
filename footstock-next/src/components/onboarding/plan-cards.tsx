"use client";

import { Button, Badge } from "@/components/ui";
import { PlanType, PLAN_LABELS } from "@/lib/constants/plans";
import { ROUTES } from "@/lib/constants/routes";
import {
  PLAN_AMOUNTS_CENTS,
  formatBRLFromCents,
} from "@/lib/constants/plan-amounts-cents";

// SSoT (FIX-12): preco mensal exibido deriva do valor cobrado em centavos.
const craqueMonthlyCents = PLAN_AMOUNTS_CENTS[PlanType.CRAQUE].monthly;
const craqueYearlyCents = PLAN_AMOUNTS_CENTS[PlanType.CRAQUE].yearly;
const lendaMonthlyCents = PLAN_AMOUNTS_CENTS[PlanType.LENDA].monthly;

// Desconto anual real derivado da SSoT (12x mensal vs anual). So exibe quando
// o desconto for genuino e dentro de faixa sa (1-90%); precos de teste com
// mensal==anual nao geram desconto valido e a linha anual e omitida.
const craqueAnnualFullCents = craqueMonthlyCents * 12;
const craqueDiscountPct =
  craqueAnnualFullCents > 0
    ? Math.round((1 - craqueYearlyCents / craqueAnnualFullCents) * 100)
    : 0;
const craqueShowYearly = craqueDiscountPct >= 1 && craqueDiscountPct <= 90;

const PLAN_FEATURES_DISPLAY: Record<PlanType, string[]> = {
  [PlanType.JOGADOR]: [
    "Cotações com delay de 60 min",
    "5 ordens por dia",
    "Taxa de 0.45%",
    "Ligas públicas",
  ],
  [PlanType.CRAQUE]: [
    "Cotações com delay de 30 min",
    "20 ordens por dia",
    "Taxa de 0.35%",
    "Ordens limitadas e OCO",
    "Análise IA por ativo",
    "Exportar dados",
    "Sem anúncios",
  ],
  [PlanType.LENDA]: [
    "Cotações em tempo real",
    "Ordens ilimitadas",
    "Taxa de 0.25%",
    "Todas as ordens (Short, OCO, etc.)",
    "Análise IA por ativo",
    "Ligas PRO",
    "Suporte prioritário",
    "Sem anúncios",
  ],
};

interface PlanCardsProps {
  onSelect?: (plan: PlanType) => void;
  onSkip: () => void;
  currentPlan?: PlanType | string | null;
}

export function PlanCards({ onSelect, onSkip, currentPlan }: PlanCardsProps) {
  const handlePlanClick = (plan: PlanType) => {
    if (onSelect) {
      onSelect(plan);
    } else if (plan === PlanType.JOGADOR) {
      onSkip();
    } else {
      window.location.href = `${ROUTES.CHECKOUT}?plan=${plan}&source=onboarding`;
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="text-center mb-2">
        <h2 className="text-xl font-bold text-[#EAECEF]">Escolha seu plano</h2>
        <p className="text-sm text-[#929AA5] mt-1">Você pode mudar depois</p>
      </div>

      {/* Jogador (gratuito) */}
      <div
        data-testid="plan-card-jogador"
        className="flex flex-col gap-3 bg-[#1E2329] border border-[rgba(240,185,11,.18)] rounded-xl p-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[#EAECEF]">
              ⚽ {PLAN_LABELS[PlanType.JOGADOR]}
            </span>
            {currentPlan === PlanType.JOGADOR && (
              <Badge variant="default" size="sm">Seu plano atual</Badge>
            )}
          </div>
          <span className="text-base font-bold text-[#EAECEF]">Grátis</span>
        </div>
        <ul className="flex flex-col gap-1">
          {PLAN_FEATURES_DISPLAY[PlanType.JOGADOR].map((f) => (
            <li
              key={f}
              className="flex items-center gap-2 text-xs text-[#929AA5]"
            >
              <span className="text-[#5a5040]" aria-hidden="true">
                →
              </span>
              {f}
            </li>
          ))}
        </ul>
        <Button
          variant="secondary"
          fullWidth
          size="sm"
          onClick={() => handlePlanClick(PlanType.JOGADOR)}
          data-testid="plan-select-jogador"
        >
          Começar grátis
        </Button>
      </div>

      {/* Craque */}
      <div
        data-testid="plan-card-craque"
        className="flex flex-col gap-3 bg-[#1E2329] border border-[rgba(56,189,248,.3)] rounded-xl p-4 relative"
      >
        <Badge
          variant="success"
          size="sm"
          className="absolute -top-2.5 left-4"
        >
          Popular
        </Badge>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[#F0B90B]">
              ⭐ {PLAN_LABELS[PlanType.CRAQUE]}
            </span>
            {currentPlan === PlanType.CRAQUE && (
              <Badge variant="default" size="sm">Seu plano atual</Badge>
            )}
          </div>
          <div className="text-right">
            <span className="text-base font-bold text-[#EAECEF]">
              {formatBRLFromCents(craqueMonthlyCents)}
            </span>
            <span className="text-xs text-[#929AA5]">/mês</span>
            {craqueShowYearly && (
              <p className="text-[10px] text-[#2EBD85]">
                ou {formatBRLFromCents(craqueYearlyCents)}/ano
                <span className="ml-1 opacity-80">(-{craqueDiscountPct}%)</span>
              </p>
            )}
          </div>
        </div>
        <ul className="flex flex-col gap-1">
          {PLAN_FEATURES_DISPLAY[PlanType.CRAQUE].map((f) => (
            <li
              key={f}
              className="flex items-center gap-2 text-xs text-[#929AA5]"
            >
              <span className="text-[#2EBD85]" aria-hidden="true">
                ✓
              </span>
              {f}
            </li>
          ))}
        </ul>
        <Button
          variant="primary"
          fullWidth
          size="sm"
          onClick={() => handlePlanClick(PlanType.CRAQUE)}
          data-testid="plan-select-craque"
        >
          Assinar Craque
        </Button>
      </div>

      {/* Lenda */}
      <div
        data-testid="plan-card-lenda"
        className="flex flex-col gap-3 bg-[#1E2329] border border-[rgba(240,185,11,.3)] rounded-xl p-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[#F0B90B]">
              👑 {PLAN_LABELS[PlanType.LENDA]}
            </span>
            {currentPlan === PlanType.LENDA && (
              <Badge variant="default" size="sm">Seu plano atual</Badge>
            )}
          </div>
          <div className="text-right">
            <span className="text-base font-bold text-[#EAECEF]">
              {formatBRLFromCents(lendaMonthlyCents)}
            </span>
            <span className="text-xs text-[#929AA5]">/mês</span>
          </div>
        </div>
        <ul className="flex flex-col gap-1">
          {PLAN_FEATURES_DISPLAY[PlanType.LENDA].map((f) => (
            <li
              key={f}
              className="flex items-center gap-2 text-xs text-[#929AA5]"
            >
              <span className="text-[#F0B90B]" aria-hidden="true">
                ★
              </span>
              {f}
            </li>
          ))}
        </ul>
        <Button
          variant="plan"
          fullWidth
          size="sm"
          onClick={() => handlePlanClick(PlanType.LENDA)}
          data-testid="plan-select-lenda"
        >
          Assinar Lenda
        </Button>
      </div>

      <button
        type="button"
        onClick={onSkip}
        className="text-xs text-[#929AA5] hover:text-[#EAECEF] text-center mt-1 transition-colors min-h-[44px] flex items-center justify-center"
        data-testid="plan-skip"
      >
        Pular por agora, começar com Jogador
      </button>
    </div>
  );
}
