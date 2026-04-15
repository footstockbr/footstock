"use client";

/**
 * T-013 — Componente de reativação do onboarding tour na página de Perfil.
 *
 * Busca o estado atual de tourCompleted do usuário.
 * - tourCompleted = true  → mostra botão "Rever tour" habilitado
 * - tourCompleted = false → botão desabilitado com tooltip "Tour já ativo"
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui";
import { ROUTES } from "@/lib/constants/routes";

export function TourReactivation() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [tourCompleted, setTourCompleted] = useState<boolean | null>(null);

  // Verificar estado atual do tour
  useEffect(() => {
    fetch("/api/v1/me")
      .then((r) => r.json())
      .then((json) => {
        const user = json.data ?? json;
        setTourCompleted(user.tourCompleted ?? true);
      })
      .catch(() => setTourCompleted(true));
  }, []);

  const handleRestart = async () => {
    setIsLoading(true);
    setError("");
    try {
      // T-013: endpoint dedicado tour-reset (tourCompleted=false + limpa tourSkippedAt)
      const res = await fetch("/api/v1/users/me/tour-reset", { method: "PATCH" });
      if (!res.ok) throw new Error();
      // Redirecionar para mercado — OnboardingTour detecta tourCompleted=false e inicia
      router.push(ROUTES.MERCADO);
    } catch {
      setError("Não foi possível reiniciar o tour. Tente novamente.");
      setIsLoading(false);
    }
  };

  // Tour ativo (não completo) → botão desabilitado
  const isTourActive = tourCompleted === false;

  return (
    <Card data-testid="tour-reactivation">
      <div className="p-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[#EAECEF]">
            Tour de boas-vindas
          </p>
          <p className="text-xs text-[#929AA5] mt-0.5">
            {isTourActive
              ? "Tour já está ativo"
              : "Refaça o tour para relembrar as funcionalidades"}
          </p>
          {error && (
            <p role="alert" className="text-xs text-[#F6465D] mt-1">
              {error}
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          isLoading={isLoading}
          disabled={isTourActive || isLoading}
          onClick={handleRestart}
          data-testid="tour-restart-btn"
          title={isTourActive ? "Tour já ativo" : "Rever tour de boas-vindas"}
          aria-label={isTourActive ? "Tour já está ativo" : "Rever tour de boas-vindas"}
        >
          {isTourActive ? "Ativo" : "Rever tour"}
        </Button>
      </div>
    </Card>
  );
}
