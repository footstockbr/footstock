"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ProfileSelector } from "@/components/onboarding/profile-selector";
import { PlanCards } from "@/components/onboarding/plan-cards";
import { TourGuide } from "@/components/onboarding/tour-guide";
import { OnboardingLayout } from "@/components/onboarding/onboarding-layout";
import { ROUTES } from "@/lib/constants/routes";
import type { InvestorProfile, PlanType } from "@/types";

type OnboardingStep = "profile" | "plan" | "tour";

/**
 * Página de onboarding — exibida após primeiro registro (tourCompleted = false).
 * Guard no middleware: se tourCompleted = true → redirect /mercado.
 */
export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<OnboardingStep>("profile");
  const [investorProfile, setInvestorProfile] =
    useState<InvestorProfile | null>(null);
  const [currentPlan, setCurrentPlan] = useState<PlanType | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // MUS-502 EDGE: se investorProfile já definido (refazer tour), pular para 'tour'
  useEffect(() => {
    fetch("/api/v1/users/me")
      .then((r) => r.json())
      .then((json) => {
        const user = json.data ?? json;
        if (user.investorProfile) {
          setInvestorProfile(user.investorProfile);
          setCurrentPlan(user.planType ?? null);
          setStep("tour");
        }
        if (user.planType) {
          setCurrentPlan(user.planType);
        }
      })
      .catch(() => {
        // Se falhar, começar do início (comportamento padrão)
      });
  }, []);

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
        setErrorMsg(
          "Não foi possível salvar seu perfil. Tente novamente."
        );
        return;
      }
      setInvestorProfile(profile);
      setStep("plan");
    },
    [patchUser]
  );

  const handlePlanSelect = useCallback(
    (plan: PlanType) => {
      if (plan !== "JOGADOR") {
        router.push(`${ROUTES.CHECKOUT}?plan=${plan}&source=onboarding`);
        return;
      }
      setStep("tour");
    },
    [router]
  );

  const handlePlanSkip = useCallback(() => {
    setStep("tour");
  }, []);

  const handleTourComplete = useCallback(async () => {
    setIsLoading(true);
    await patchUser({ tourCompleted: true });
    setIsLoading(false);
    router.replace(ROUTES.DASHBOARD);
  }, [patchUser, router]);

  const handleTourSkip = useCallback(async () => {
    await patchUser({ tourCompleted: true });
    router.replace(ROUTES.DASHBOARD);
  }, [patchUser, router]);

  return (
    <div
      className="w-full max-w-sm"
      data-testid="onboarding-page"
    >
      {/* Logo */}
      <div className="flex justify-center mb-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-foot.png"
          className="h-10 w-auto"
          alt="Foot Stock"
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

        {step === "tour" && investorProfile && (
          <TourGuide
            investorProfile={investorProfile}
            onComplete={handleTourComplete}
            onSkip={handleTourSkip}
            isLoading={isLoading}
          />
        )}
      </OnboardingLayout>
    </div>
  );
}
