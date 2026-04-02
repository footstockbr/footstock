"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui";
import { ROUTES } from "@/lib/constants/routes";

export function TourReactivation() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleRestart = async () => {
    setIsLoading(true);
    setError("");
    try {
      const res = await fetch("/api/v1/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tourCompleted: false }),
      });
      if (!res.ok) throw new Error();
      router.push(ROUTES.ONBOARDING);
    } catch {
      setError("Não foi possível reiniciar o tour. Tente novamente.");
      setIsLoading(false);
    }
  };

  return (
    <Card data-testid="tour-reactivation">
      <div className="p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-[#EAECEF]">
            Tour de boas-vindas
          </p>
          <p className="text-xs text-[#929AA5] mt-0.5">
            Refaça o tour para relembrar as funcionalidades
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
          onClick={handleRestart}
          data-testid="tour-restart-btn"
        >
          Refazer
        </Button>
      </div>
    </Card>
  );
}
