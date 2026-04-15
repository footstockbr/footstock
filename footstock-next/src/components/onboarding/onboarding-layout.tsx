"use client";

import type { ReactNode } from "react";

// T-013: removido step "tour" — agora o tour ocorre no /mercado via OnboardingTour overlay
type OnboardingStep = "profile" | "plan";

const STEPS: { key: OnboardingStep; label: string }[] = [
  { key: "profile", label: "Perfil" },
  { key: "plan", label: "Plano" },
];

interface OnboardingLayoutProps {
  currentStep: OnboardingStep;
  children: ReactNode;
}

export function OnboardingLayout({ currentStep, children }: OnboardingLayoutProps) {
  const currentIndex = STEPS.findIndex((s) => s.key === currentStep);

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Step indicator */}
      <div className="flex items-center gap-2" role="navigation" aria-label="Etapas do onboarding">
        {STEPS.map((step, i) => (
          <div key={step.key} className="flex items-center gap-2 flex-1">
            <div className="flex flex-col items-center flex-1">
              <div
                className={`h-1 w-full rounded-full transition-all duration-300 ${
                  i <= currentIndex
                    ? "bg-[#F0B90B]"
                    : "bg-[rgba(240,185,11,.18)]"
                }`}
              />
              <span
                className={`text-[10px] mt-1 ${
                  i <= currentIndex ? "text-[#F0B90B]" : "text-[#5a5040]"
                }`}
                aria-current={i === currentIndex ? "step" : undefined}
              >
                {step.label}
              </span>
            </div>
          </div>
        ))}
      </div>

      {children}
    </div>
  );
}
