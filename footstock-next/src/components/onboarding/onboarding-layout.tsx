"use client";

import type { ReactNode } from "react";

type OnboardingStep = "profile" | "plan" | "tour";

const STEPS: { key: OnboardingStep; label: string }[] = [
  { key: "profile", label: "Perfil" },
  { key: "plan", label: "Plano" },
  { key: "tour", label: "Tour" },
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
                    ? "bg-[#c9a84c]"
                    : "bg-[rgba(201,168,76,.18)]"
                }`}
              />
              <span
                className={`text-[10px] mt-1 ${
                  i <= currentIndex ? "text-[#c9a84c]" : "text-[#5a5040]"
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
