"use client";

import { useState, useCallback } from "react";
import { Button, Modal } from "@/components/ui";

export function SubscriptionManage() {
  const [isOpen, setIsOpen] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const handleCancel = useCallback(async () => {
    setIsCancelling(true);
    try {
      const res = await fetch("/api/v1/subscriptions/me", { method: "DELETE" });
      if (!res.ok) throw new Error();
      setToast({ type: "success", msg: "Assinatura cancelada. Seu plano será rebaixado ao final do período." });
      setIsOpen(false);
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
              ? "bg-[rgba(34,197,94,.15)] border border-[rgba(34,197,94,.3)] text-[#22c55e]"
              : "bg-[rgba(239,68,68,.15)] border border-[rgba(239,68,68,.3)] text-[#ef4444]"
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

      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="text-[#ef4444] hover:text-[#ef4444]"
        data-testid="subscription-cancel-btn"
      >
        Cancelar
      </Button>

      <Modal
        isOpen={isOpen}
        onClose={() => !isCancelling && setIsOpen(false)}
        title="Cancelar assinatura"
        description="Você perderá acesso aos recursos do plano atual ao final do período."
        size="sm"
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-[#7a7060]">
            Tem certeza? Você pode reativar a qualquer momento.
          </p>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              fullWidth
              onClick={() => setIsOpen(false)}
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
    </>
  );
}
