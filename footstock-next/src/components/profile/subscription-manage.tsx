"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button, Modal } from "@/components/ui";
import { CheckoutButton } from "@/components/payments/CheckoutButton";

interface SubscriptionManageProps {
  planType?: string | null;
}

export function SubscriptionManage({ planType }: SubscriptionManageProps) {
  const router = useRouter();
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [isChangeOpen, setIsChangeOpen] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const isCraque = planType === "CRAQUE";
  const isLenda  = planType === "LENDA";
  const changePlanLabel = "Subir para Lenda";

  const handleCancel = useCallback(async () => {
    setIsCancelling(true);
    try {
      const res = await fetch("/api/v1/subscriptions/me", { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "Não foi possível cancelar. Tente novamente.");

      const effectiveAt = json?.data?.cancellationEffectiveAt ?? json?.data?.expiresAt;
      const formattedDate = effectiveAt
        ? new Date(effectiveAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
        : null;

      toast.success(
        formattedDate
          ? `Cancelamento agendado. Você mantém o plano até ${formattedDate}.`
          : "Cancelamento agendado. Você mantém o plano até o fim do período.",
        { duration: 3000 }
      );
      setIsCancelOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível cancelar. Tente novamente.", { duration: 2000 });
    } finally {
      setIsCancelling(false);
    }
  }, [router]);

  return (
    <>
      <div className="flex items-center gap-2">
        {isCraque && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsChangeOpen(true)}
            data-testid="subscription-change-plan-btn"
          >
            {changePlanLabel}
          </Button>
        )}

        {isLenda && (
          <Button
            variant="secondary"
            size="sm"
            disabled
            title="A migração para Craque ao fim do período pago ainda não está disponível."
            data-testid="subscription-downgrade-unavailable-btn"
          >
            Downgrade em breve
          </Button>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsCancelOpen(true)}
          className="text-[#F6465D] hover:text-[#F6465D]"
          data-testid="subscription-cancel-btn"
        >
          Cancelar
        </Button>
      </div>

      {/* Modal: cancelar assinatura */}
      <Modal
        isOpen={isCancelOpen}
        onClose={() => !isCancelling && setIsCancelOpen(false)}
        title="Cancelar assinatura"
        description="Você perderá acesso aos recursos do plano atual ao final do período."
        size="sm"
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-[#929AA5]">
            Tem certeza? Você pode reativar a qualquer momento.
          </p>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              fullWidth
              onClick={() => setIsCancelOpen(false)}
              disabled={isCancelling}
            >
              Manter plano
            </Button>
            <Button
              variant="destructive"
              fullWidth
              isLoading={isCancelling}
              onClick={handleCancel}
              data-testid="subscription-confirm-cancel"
            >
              Cancelar mesmo assim
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: trocar plano */}
      {isChangeOpen && isCraque && (
        <div
          data-testid="subscription-change-plan-modal"
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.8)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 1000,
            padding: "16px",
          }}
          onClick={() => setIsChangeOpen(false)}
        >
          <div
            style={{
              background: "#1E2329",
              border: "1px solid rgba(240,185,11,.2)",
              borderRadius: "12px",
              padding: "24px",
              width: "100%",
              maxWidth: "360px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ color: "#EAECEF", fontSize: "16px", fontWeight: 700, marginBottom: "4px" }}>
              {changePlanLabel}
            </h2>
            <p style={{ color: "#929AA5", fontSize: "12px", marginBottom: "20px" }}>
              Faça upgrade para Lenda e desbloqueie todos os recursos premium.
            </p>

            <CheckoutButton planType="LENDA" label={changePlanLabel} />

            <button
              type="button"
              onClick={() => setIsChangeOpen(false)}
              style={{
                marginTop: "12px",
                width: "100%",
                padding: "8px",
                background: "transparent",
                border: "1px solid rgba(240,185,11,.15)",
                borderRadius: "6px",
                color: "#929AA5",
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </>
  );
}
