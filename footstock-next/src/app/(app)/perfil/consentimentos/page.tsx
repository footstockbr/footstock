"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Button, Skeleton } from "@/components/ui";
import { ROUTES } from "@/lib/constants/routes";

interface Consent {
  id: string;
  purpose: string;
  grantedAt: string;
  revoked: boolean;
  revokedAt: string | null;
}

const PURPOSE_LABELS: Record<string, { label: string; description: string; required?: boolean }> = {
  TERMS: {
    label: "Termos de Uso",
    description: "Aceite dos termos de uso e condições gerais do serviço.",
    required: true,
  },
  PRIVACY: {
    label: "Política de Privacidade",
    description: "Aceite da política de privacidade e tratamento de dados.",
    required: true,
  },
  MARKETING: {
    label: "Comunicações de Marketing",
    description: "Receber e-mails e notificações sobre novidades e promoções.",
  },
  ANALYTICS: {
    label: "Análise de Uso",
    description: "Coleta de dados anônimos para melhoria do serviço.",
  },
  THIRD_PARTY: {
    label: "Compartilhamento com Terceiros",
    description: "Compartilhar dados agregados com parceiros selecionados.",
  },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function ConsentimentosPage() {
  const [consents, setConsents] = useState<Consent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/v1/users/me/consents")
      .then((r) => r.json())
      .then((json) => setConsents(json.data ?? []))
      .catch(() => setError("Não foi possível carregar os consentimentos."))
      .finally(() => setIsLoading(false));
  }, []);

  const handleRevoke = useCallback(async (purpose: string) => {
    setRevoking(purpose);
    setError("");
    try {
      const res = await fetch(
        `/api/v1/users/me/consents/${purpose}/revoke`,
        { method: "POST" }
      );
      if (!res.ok) throw new Error();
      setConsents((prev) =>
        prev.map((c) =>
          c.purpose === purpose
            ? { ...c, revoked: true, revokedAt: new Date().toISOString() }
            : c
        )
      );
    } catch {
      setError("Não foi possível revogar este consentimento. Tente novamente.");
    } finally {
      setRevoking(null);
    }
  }, []);

  return (
    <div data-testid="consentimentos-page" className="px-4 py-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href={ROUTES.PERFIL}
          className="text-[#929AA5] hover:text-[#EAECEF] transition-colors"
          aria-label="Voltar ao perfil"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </Link>
        <h1 className="text-lg font-bold text-[#EAECEF]">Consentimentos</h1>
      </div>

      <p className="text-sm text-[#929AA5] mb-6">
        Gerencie suas preferências de privacidade e consentimentos de dados conforme a LGPD.
      </p>

      {error && (
        <div
          role="alert"
          className="mb-4 p-3 rounded-lg bg-[rgba(239,68,68,.1)] border border-[rgba(239,68,68,.3)] text-sm text-[#F6465D]"
        >
          {error}
          <button
            type="button"
            onClick={() => {
              setError("");
              setIsLoading(true);
              fetch("/api/v1/users/me/consents")
                .then((r) => r.json())
                .then((json) => setConsents(json.data ?? []))
                .catch(() => setError("Não foi possível carregar os consentimentos."))
                .finally(() => setIsLoading(false));
            }}
            className="ml-2 underline hover:no-underline"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : consents.length === 0 ? (
        <p className="text-sm text-[#929AA5] text-center py-8">
          Nenhum consentimento registrado.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {consents.map((consent) => {
            const meta = PURPOSE_LABELS[consent.purpose] ?? {
              label: consent.purpose,
              description: "Consentimento de dados.",
            };

            return (
              <div
                key={consent.id}
                data-testid={`consent-item-${consent.purpose}`}
                className="bg-[#1E2329] border border-[rgba(240,185,11,.18)] rounded-lg p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-medium text-[#EAECEF]">
                        {meta.label}
                      </p>
                      {meta.required && (
                        <span className="text-[10px] text-[#929AA5] bg-[rgba(240,185,11,.08)] border border-[rgba(240,185,11,.18)] px-1.5 py-0.5 rounded-sm">
                          Obrigatório
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#929AA5]">{meta.description}</p>
                    <p className="text-[11px] text-[#5a5040] mt-1">
                      {consent.revoked && consent.revokedAt
                        ? `Revogado em ${formatDate(consent.revokedAt)}`
                        : `Concedido em ${formatDate(consent.grantedAt)}`}
                    </p>
                  </div>

                  <div className="flex-shrink-0">
                    {consent.revoked ? (
                      <span
                        className="text-xs text-[#F6465D] font-medium"
                        aria-label={`${meta.label} revogado`}
                      >
                        Revogado
                      </span>
                    ) : meta.required ? (
                      <span
                        className="text-xs text-[#2EBD85] font-medium"
                        aria-label={`${meta.label} ativo — obrigatório`}
                      >
                        Ativo
                      </span>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        isLoading={revoking === consent.purpose}
                        disabled={!!revoking}
                        onClick={() => handleRevoke(consent.purpose)}
                        className="text-[#F6465D] hover:text-[#F6465D] text-xs"
                        data-testid={`revoke-btn-${consent.purpose}`}
                      >
                        Revogar
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
