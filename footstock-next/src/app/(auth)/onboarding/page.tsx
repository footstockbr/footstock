"use client";

/**
 * Página de onboarding — exibida após primeiro registro (tourCompleted = false).
 *
 * Fluxo: profile → plan → /mercado
 * O OnboardingTour (overlay spotlight) inicia automaticamente no /mercado
 * quando tourCompleted = false.
 *
 * Guard no middleware: se tourCompleted = true → redirect /mercado.
 */

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ProfileSelector } from "@/components/onboarding/profile-selector";
import { PlanCards } from "@/components/onboarding/plan-cards";
import { OnboardingLayout } from "@/components/onboarding/onboarding-layout";
import { ROUTES } from "@/lib/constants/routes";
import { useAnalytics } from "@/hooks/useAnalytics";
import Image from "next/image";
import type { InvestorProfile, PlanType } from "@/types";

type OnboardingStep = "profile" | "plan";

export default function OnboardingPage() {
  const router = useRouter();
  const { track } = useAnalytics();
  const [step, setStep] = useState<OnboardingStep>("profile");
  const [investorProfile, setInvestorProfile] =
    useState<InvestorProfile | null>(null);
  const [currentPlan, setCurrentPlan] = useState<PlanType | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Se usuário já tem investorProfile (ex: refazer onboarding), ir direto para mercado
  useEffect(() => {
    fetch("/api/v1/users/me")
      .then((r) => r.json())
      .then((json) => {
        const user = json.data ?? json;
        if (user.investorProfile) {
          setInvestorProfile(user.investorProfile);
          setCurrentPlan(user.planType ?? null);
          // Já tem perfil — ir direto para mercado onde o OnboardingTour pode re-iniciar
          if (!user.tourCompleted) {
            router.replace(ROUTES.MERCADO);
          }
        }
        if (user.planType) {
          setCurrentPlan(user.planType);
        }
      })
      .catch(() => {
        // Falha silenciosa — começar do início
      });
  }, [router]);

  const patchUser = useCallback(
    async (data: Record<string, unknown>): Promise<boolean> => {
      try {
        const res = await fetch("/api/v1/users/me", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        return res.ok;
      } catch {
        return false;
      }
    },
    []
  );

  const handleProfileSelect = useCallback(
    async (profile: InvestorProfile) => {
      setIsLoading(true);
      setErrorMsg("");
      const ok = await patchUser({ investorProfile: profile });
      setIsLoading(false);
      if (!ok) {
        setErrorMsg("Não foi possível salvar seu perfil. Tente novamente.");
        return;
      }
      setInvestorProfile(profile);
      // EVT-008: investor_profile_selected
      track("investor_profile_selected", { profile: profile as 'INICIANTE' | 'INTERMEDIARIO' | 'AVANCADO' | 'FA_FUTEBOL' });
      setStep("plan");
    },
    [patchUser, track]
  );

  const handlePlanSelect = useCallback(
    (plan: PlanType) => {
      // EVT-007: plan_selected_onboarding
      track("plan_selected_onboarding", { plan_selected: plan as 'JOGADOR' | 'CRAQUE' | 'LENDA' });

      if (plan !== "JOGADOR") {
        router.push(`${ROUTES.CHECKOUT}?plan=${plan}&source=onboarding`);
        return;
      }
      // Plano gratuito — ir para mercado onde o OnboardingTour inicia
      router.replace(ROUTES.MERCADO);
    },
    [router, track]
  );

  const handlePlanSkip = useCallback(() => {
    router.replace(ROUTES.MERCADO);
  }, [router]);

  return (
    <div
      className="w-full max-w-sm"
      data-testid="onboarding-page"
    >
      {/* Logo */}
      <div className="flex justify-center mb-8">
        <Image
          src="/logo-foot.png"
          className="h-10 w-auto"
          alt="FootStock"
          width={40}
          height={40}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      </div>

      <OnboardingLayout currentStep={step}>
        {errorMsg && (
          <div
            role="alert"
            className="mb-4 p-3 rounded-lg bg-[rgba(239,68,68,.1)] border border-[rgba(239,68,68,.3)] text-sm text-[#F6465D]"
          >
            {errorMsg}
            <button
              type="button"
              onClick={() => setErrorMsg("")}
              className="ml-2 underline hover:no-underline"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {step === "profile" && (
          <ProfileSelector
            onSelect={handleProfileSelect}
            isLoading={isLoading}
          />
        )}

        {step === "plan" && (
          <PlanCards
            onSelect={handlePlanSelect}
            onSkip={handlePlanSkip}
            currentPlan={currentPlan}
          />
        )}
      </OnboardingLayout>
    </div>
  );
}
