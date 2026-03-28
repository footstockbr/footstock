"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Card } from "@/components/ui";
import { ROUTES } from "@/lib/constants/routes";
import { DeleteAccountModal } from "./delete-account-modal";

export function LGPDActions() {
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [exportState, setExportState] = useState<"idle" | "loading" | "done" | "error">("idle");

  const handleExport = async () => {
    setExportState("loading");
    try {
      const res = await fetch("/api/v1/users/me/export");
      if (!res.ok) throw new Error();
      setExportState("done");
      setTimeout(() => setExportState("idle"), 4000);
    } catch {
      setExportState("error");
      setTimeout(() => setExportState("idle"), 4000);
    }
  };

  return (
    <>
      <Card data-testid="lgpd-actions">
        <div className="p-4 pb-2">
          <p className="text-sm font-semibold text-[#f0ead6] mb-3">
            Privacidade e dados
          </p>
          <div className="flex flex-col gap-1">
            {/* Exportar dados */}
            <Button
              variant="ghost"
              size="sm"
              fullWidth
              onClick={handleExport}
              isLoading={exportState === "loading"}
              disabled={exportState === "loading"}
              className="justify-start text-[#7a7060] hover:text-[#f0ead6] min-h-[44px]"
              data-testid="lgpd-export-btn"
            >
              <svg
                className="w-4 h-4 mr-2 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              {exportState === "done"
                ? "✓ Exportação solicitada!"
                : exportState === "error"
                ? "Erro — tente novamente"
                : "Exportar meus dados"}
            </Button>

            {/* Consentimentos */}
            <Link href={ROUTES.PERFIL_CONSENTIMENTOS}>
              <Button
                variant="ghost"
                size="sm"
                fullWidth
                className="justify-start text-[#7a7060] hover:text-[#f0ead6] min-h-[44px]"
                data-testid="lgpd-consents-link"
              >
                <svg
                  className="w-4 h-4 mr-2 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                Ver e gerenciar consentimentos
              </Button>
            </Link>

            {/* Excluir conta */}
            <Button
              variant="ghost"
              size="sm"
              fullWidth
              onClick={() => setIsDeleteOpen(true)}
              className="justify-start text-[#ef4444] hover:text-[#ef4444] hover:bg-[rgba(239,68,68,.08)] min-h-[44px]"
              data-testid="lgpd-delete-btn"
            >
              <svg
                className="w-4 h-4 mr-2 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
              Excluir minha conta
            </Button>
          </div>
        </div>
      </Card>

      <DeleteAccountModal
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
      />
    </>
  );
}
