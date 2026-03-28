"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal, Button, Input } from "@/components/ui";
import { ROUTES } from "@/lib/constants/routes";

const DELETE_REASONS = [
  { value: "NOT_USING", label: "Não estou usando o app" },
  { value: "PRIVACY_CONCERNS", label: "Preocupações com privacidade" },
  { value: "EXPENSIVE", label: "Plano muito caro" },
  { value: "FOUND_ALTERNATIVE", label: "Encontrei uma alternativa melhor" },
  { value: "OTHER", label: "Outro motivo" },
];

interface DeleteAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DeleteAccountModal({
  isOpen,
  onClose,
}: DeleteAccountModalProps) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [reason, setReason] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState("");

  const isConfirmed = confirmation === "EXCLUIR";

  const handleDelete = async () => {
    if (!isConfirmed) {
      setError('Digite "EXCLUIR" para confirmar');
      return;
    }

    setIsDeleting(true);
    try {
      const res = await fetch("/api/v1/users/me", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });

      if (!res.ok) throw new Error();

      // Redirecionar para home — sessão foi revogada pelo service
      router.replace(ROUTES.HOME);
    } catch {
      setError(
        "Não foi possível excluir sua conta. Tente novamente ou entre em contato com o suporte."
      );
      setIsDeleting(false);
    }
  };

  const handleClose = () => {
    if (isDeleting) return;
    setConfirmation("");
    setReason("");
    setError("");
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Excluir conta"
      description="Esta ação é irreversível e removerá todos os seus dados pessoais."
      size="sm"
    >
      <div className="flex flex-col gap-4">
        {/* Aviso */}
        <div className="bg-[rgba(239,68,68,.1)] border border-[rgba(239,68,68,.3)] rounded-lg p-3">
          <p className="text-xs text-[#ef4444] font-medium">
            Esta ação é permanente
          </p>
          <p className="text-xs text-[#7a7060] mt-1">
            Seus dados pessoais serão anonimizados. Registros financeiros são
            mantidos por obrigação legal (5 anos).
          </p>
        </div>

        {/* Motivo */}
        <div>
          <label
            htmlFor="delete-reason"
            className="text-sm font-medium text-[#7a7060] block mb-1.5"
          >
            Motivo da exclusão
          </label>
          <select
            id="delete-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full h-11 bg-[#141210] border border-[rgba(201,168,76,.18)] rounded-md px-3 text-sm text-[#f0ead6] focus:border-[#c9a84c] focus:outline-none focus:ring-1 focus:ring-[#c9a84c]"
          >
            <option value="">Selecione um motivo</option>
            {DELETE_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        {/* Confirmação */}
        <Input
          label='Digite "EXCLUIR" para confirmar'
          type="text"
          placeholder="EXCLUIR"
          value={confirmation}
          onChange={(e) => {
            setConfirmation(e.target.value);
            setError("");
          }}
          error={error || undefined}
          autoComplete="off"
          data-testid="delete-confirmation-input"
        />

        {/* Botões */}
        <div className="flex gap-2">
          <Button
            variant="ghost"
            fullWidth
            onClick={handleClose}
            disabled={isDeleting}
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            fullWidth
            isLoading={isDeleting}
            disabled={!isConfirmed || isDeleting}
            onClick={handleDelete}
            data-testid="delete-confirm-btn"
          >
            Excluir conta
          </Button>
        </div>
      </div>
    </Modal>
  );
}
