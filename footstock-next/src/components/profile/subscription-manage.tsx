"use client";

import { useState, useCallback } from "react";
import { Button, Modal } from "@/components/ui";
import { CheckoutButton } from "@/components/payments/CheckoutButton";

interface SubscriptionManageProps {
  planType?: string | null;
}

export function SubscriptionManage({ planType }: SubscriptionManageProps) {
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [isChangeOpen, setIsChangeOpen] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const isCraque = planType === "CRAQUE";
  const isLenda  = planType === "LENDA";
  const changePlanType = isLenda ? "CRAQUE" : "LENDA";
  const changePlanLabel = isLenda ? "Migrar para Craque" : "Subir para Lenda";

  const handleCancel = useCallback(async () => {
    setIsCancelling(true);
    try {
      const res = await fetch("/api/v1/subscriptions/me", { method: "DELETE" });
      if (!res.ok) throw new Error();
      setToast({ type: "success", msg: "Cancelamento solicitado. Você mantém acesso até o fim do período." });
      setIsCancelOpen(false);
    } catch {
      setToast({ type: "error", msg: "Não foi possível cancelar. Tente novamente." });
    } finally {
      setIsCancelling(false);
    }
  }, []);

  return (
    <>
      {toast && (
        <div
          role="alert"
          className={`fixed bottom-24 left-4 right-4 z-50 p-3 rounded-lg text-sm ${
            toast.type === "success"
              ? "bg-[rgba(34,197,94,.15)] border border-[rgba(34,197,94,.3)] text-[#2EBD85]"
              : "bg-[rgba(239,68,68,.15)] border border-[rgba(239,68,68,.3)] text-[#F6465D]"
          }`}
        >
          {toast.msg}
          <button
            type="button"
            onClick={() => setToast(null)}
            className="ml-2 opacity-70 hover:opacity-100"
            aria-label="Fechar aviso"
          >
            ×
          </button>
        </div>
      )}

      <div className="flex items-center gap-2">
        {(isCraque || isLenda) && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsChangeOpen(true)}
            data-testid="subscription-change-plan-btn"
          >
            {changePlanLabel}
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
      {isChangeOpen && (
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
              {isLenda
                ? "Ao migrar para Craque, seu plano Lenda será cancelado ao final do período atual."
                : "Faça upgrade para Lenda e desbloqueie todos os recursos premium."}
            </p>

            <CheckoutButton planType={changePlanType as "CRAQUE" | "LENDA"} label={changePlanLabel} />

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
