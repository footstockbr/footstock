"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui";
import type { InvestorProfile } from "@/types";

const PROFILES: Array<{
  value: InvestorProfile;
  icon: string;
  title: string;
  description: string;
}> = [
  {
    value: "INICIANTE",
    icon: "🌱",
    title: "Iniciante",
    description:
      "Nunca investi. Quero aprender investindo no futebol de forma simples.",
  },
  {
    value: "INTERMEDIARIO",
    icon: "📈",
    title: "Intermediário",
    description:
      "Tenho noções básicas de mercado financeiro e quero praticar.",
  },
  {
    value: "AVANCADO",
    icon: "🎯",
    title: "Avançado",
    description:
      "Experiência com ações/cripto. Quero usar estratégias avançadas.",
  },
  {
    value: "FA",
    icon: "⚽",
    title: "Fã de Futebol",
    description:
      "Prefiro apoiar meu clube do que investir. O app é para acompanhar.",
  },
];

interface ProfileSelectorProps {
  onSelect: (profile: InvestorProfile) => void;
  isLoading?: boolean;
}

export function ProfileSelector({ onSelect, isLoading }: ProfileSelectorProps) {
  const [selected, setSelected] = useState<InvestorProfile | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="text-center mb-2">
        <h1 className="text-xl font-bold text-[#EAECEF]">
          Bem-vindo ao FootStock!
        </h1>
        <p className="text-sm text-[#929AA5] mt-1">
          Como você se descreveria?
        </p>
      </div>

      <div
        className="flex flex-col gap-3"
        role="radiogroup"
        aria-label="Selecione seu perfil de investidor"
      >
        {PROFILES.map((profile) => (
          <button
            key={profile.value}
            type="button"
            role="radio"
            aria-checked={selected === profile.value}
            onClick={() => setSelected(profile.value)}
            className={cn(
              "flex items-start gap-3 p-4 rounded-lg border text-left min-h-[56px]",
              "transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F0B90B]",
              selected === profile.value
                ? "border-[#F0B90B] bg-[rgba(240,185,11,.08)]"
                : "border-[rgba(240,185,11,.18)] bg-[#1E2329] hover:border-[rgba(240,185,11,.4)]"
            )}
          >
            <span className="text-2xl flex-shrink-0 mt-0.5" aria-hidden="true">
              {profile.icon}
            </span>
            <div className="flex-1">
              <p
                className={cn(
                  "text-sm font-semibold",
                  selected === profile.value
                    ? "text-[#F0B90B]"
                    : "text-[#EAECEF]"
                )}
              >
                {profile.title}
              </p>
              <p className="text-xs text-[#929AA5] mt-0.5">
                {profile.description}
              </p>
            </div>
            {selected === profile.value && (
              <svg
                className="w-4 h-4 text-[#F0B90B] ml-auto flex-shrink-0 mt-0.5"
                fill="currentColor"
                viewBox="0 0 20 20"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
            )}
          </button>
        ))}
      </div>

      <Button
        variant="primary"
        fullWidth
        disabled={!selected || isLoading}
        isLoading={isLoading}
        onClick={() => selected && onSelect(selected)}
        className="mt-2"
        data-testid="onboarding-profile-continue"
      >
        Continuar
      </Button>
    </div>
  );
}
