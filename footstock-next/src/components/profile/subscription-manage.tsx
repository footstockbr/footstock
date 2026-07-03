"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button, Modal } from "@/components/ui";
import { CheckoutButton } from "@/components/payments/CheckoutButton";
import { ROUTES } from "@/lib/constants/routes";

interface SubscriptionManageProps {
  planType?: string | null;
}

// M067 — shape do bloco `refund` do GET /api/v1/subscriptions/me (CDC Art. 49).
interface RefundInfo {
  deadlineAt: string;
  amountCents: number;
  restrictedPositionsCount: number;
  outcome:
    | { kind: "DOWNGRADE_JOGADOR" }
    | { kind: "RESTORE_PREVIOUS"; restoredPlanType: string; restoredUntil: string; fsToRevert: number };
}

interface MeResponse {
  isEligibleForRefund?: boolean;
  cancellationEffectiveAt?: string | null;
  expiresAt?: string;
  refund?: RefundInfo | null;
}

function formatBRL(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;
}

function formatDateBRT(iso: string, withTime = false): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    });
  } catch {
    return iso;
  }
}

function planLabel(plan: string): string {
  return plan === "LENDA" ? "Lenda" : plan === "CRAQUE" ? "Craque" : "Jogador";
}

export function SubscriptionManage({ planType }: SubscriptionManageProps) {
  const router = useRouter();
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [isChangeOpen, setIsChangeOpen] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isRefunding, setIsRefunding] = useState(false);
  // M067: dados do arrependimento carregados ao ABRIR o modal (fonte: GET /me).
  const [me, setMe] = useState<MeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(false);
  const [meFailed, setMeFailed] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);

  const isCraque = planType === "CRAQUE";
  const isLenda  = planType === "LENDA";
  const changePlanLabel = "Subir para Lenda";

  const refund = me?.isEligibleForRefund && me?.refund ? me.refund : null;
  const refundBlocked = (refund?.restrictedPositionsCount ?? 0) > 0;

  // M067 — abrir o modal de cancelar SEMPRE consulta o /me: dentro dos 7 dias o direito
  // de arrependimento (CDC 49) tem que ser ofertado de forma clara e ostensiva
  // (CDC 6º III/31 + Dec. 7.962), com o reembolso como ação primária.
  const openCancelModal = useCallback(async () => {
    setIsCancelOpen(true);
    setRefundError(null);
    setMeLoading(true);
    setMeFailed(false);
    try {
      const res = await fetch("/api/v1/subscriptions/me", { credentials: "include" });
      const json = await res.json();
      if (res.ok) {
        setMe(json?.data as MeResponse);
      } else {
        setMe(null);
        setMeFailed(true);
      }
    } catch {
      // M067-F3 (review codex): NUNCA esconder silenciosamente o direito de arrependimento —
      // o fluxo clássico continua disponível, mas com aviso visível de que a verificação falhou.
      setMe(null);
      setMeFailed(true);
    } finally {
      setMeLoading(false);
    }
  }, []);

  const handleCancel = useCallback(async () => {
    setIsCancelling(true);
    try {
      // M067-F7: quando o reembolso foi OFERTADO e o usuário escolheu o agendado, envia a
      // prova de consentimento (persistida server-side em upgradeProrationMeta.cancelConsent).
      const res = await fetch("/api/v1/subscriptions/me", {
        method: "DELETE",
        ...(refund
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ refundOffered: true, snapshot: refund }),
            }
          : {}),
      });
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
  }, [router, refund]);

  // M067 — arrependimento: estorno integral + efeito imediato (JOGADOR ou plano anterior).
  const handleRefund = useCallback(async () => {
    setIsRefunding(true);
    setRefundError(null);
    try {
      const res = await fetch("/api/v1/subscriptions/me/refund", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        // Zero Silêncio: motivo objetivo na tela (ex.: posições restritas não zeradas).
        setRefundError(json?.error?.message ?? "Não foi possível processar o reembolso. Tente novamente.");
        return;
      }
      const remedy = json?.data?.remedy;
      toast.success(
        remedy?.kind === "RESTORE_PREVIOUS"
          ? `Reembolso confirmado. Seu plano ${planLabel(remedy.restoredPlanType)} foi restaurado até ${formatDateBRT(remedy.restoredUntil)}.`
          : "Reembolso confirmado. Você voltou ao plano Jogador. O valor retorna em até 7 dias úteis.",
        { duration: 4000 }
      );
      setIsCancelOpen(false);
      router.refresh();
    } catch {
      setRefundError("Erro de conexão. Verifique sua internet e tente novamente.");
    } finally {
      setIsRefunding(false);
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
          onClick={openCancelModal}
          className="text-[#F6465D] hover:text-[#F6465D]"
          data-testid="subscription-cancel-btn"
        >
          Cancelar
        </Button>
      </div>

      {/* Modal: cancelar — dual quando dentro do prazo de arrependimento (CDC 49) */}
      <Modal
        isOpen={isCancelOpen}
        onClose={() => !isCancelling && !isRefunding && setIsCancelOpen(false)}
        title="Cancelar assinatura"
        description={
          refund
            ? "Você está no prazo de arrependimento — escolha como quer cancelar."
            : "Seu plano atual termina ao final do período pago; sua conta e histórico continuam."
        }
        size="sm"
      >
        <div className="flex flex-col gap-3">
          {meLoading && (
            <p className="text-sm text-[#929AA5]">Verificando suas opções de cancelamento...</p>
          )}

          {!meLoading && refund && (
            <>
              {/* Opção primária: arrependimento (CDC Art. 49) */}
              <div
                data-testid="cancel-refund-option"
                className="rounded-lg border border-[rgba(46,189,133,.35)] bg-[rgba(46,189,133,.06)] p-3 flex flex-col gap-2"
              >
                <p className="text-sm font-semibold text-[#EAECEF]">
                  Cancelar agora com reembolso integral
                </p>
                <p className="text-xs text-[#C0C4CE]">
                  Você está no prazo de 7 dias (até {formatDateBRT(refund.deadlineAt, true)}).{" "}
                  {refund.amountCents > 0 && (
                    <>O valor de <span className="font-semibold">{formatBRL(refund.amountCents)}</span> será
                    estornado no mesmo meio de pagamento em até 7 dias úteis. </>
                  )}
                  {refund.outcome.kind === "RESTORE_PREVIOUS" ? (
                    <>
                      Seu plano <span className="font-semibold">{planLabel(refund.outcome.restoredPlanType)}</span>{" "}
                      anterior será restaurado até {formatDateBRT(refund.outcome.restoredUntil)}
                      {refund.outcome.fsToRevert > 0 && (
                        <> e FS$ {refund.outcome.fsToRevert.toLocaleString("pt-BR")} de créditos de migração serão revertidos</>
                      )}
                      .
                    </>
                  ) : (
                    <>
                      Seu plano volta para <span className="font-semibold">Jogador imediatamente</span>, seu
                      FS$ é redefinido para 2.000 (ganhos e bônus são zerados) e posições restritas (short,
                      alavancada ou OCO) serão encerradas.
                    </>
                  )}
                </p>

                {refundBlocked ? (
                  <div data-testid="cancel-refund-blocked" className="flex flex-col gap-1">
                    <Button variant="secondary" fullWidth disabled>
                      Reembolso indisponível no momento
                    </Button>
                    <p className="text-xs text-[#F0B90B]">
                      Para receber o reembolso, encerre primeiro suas{" "}
                      {refund.restrictedPositionsCount} posição(ões) restrita(s) (short/alavancada).{" "}
                      <Link href={ROUTES.PORTFOLIO} className="underline underline-offset-2">
                        Ver carteira
                      </Link>
                    </p>
                  </div>
                ) : (
                  <Button
                    variant="primary"
                    fullWidth
                    isLoading={isRefunding}
                    disabled={isCancelling}
                    onClick={handleRefund}
                    data-testid="subscription-confirm-refund"
                  >
                    Cancelar agora e receber reembolso
                  </Button>
                )}
                {refundError && (
                  <p role="alert" className="text-xs text-[#F6465D]">
                    {refundError}
                  </p>
                )}
              </div>

              {/* Opção secundária: cancelar só a renovação */}
              <div className="rounded-lg border border-[rgba(240,185,11,.15)] p-3 flex flex-col gap-2">
                <p className="text-sm font-semibold text-[#EAECEF]">Cancelar só a renovação</p>
                <p className="text-xs text-[#929AA5]">
                  Você mantém o acesso até{" "}
                  {me?.expiresAt ? formatDateBRT(me.expiresAt) : "o fim do período pago"}, sem reembolso.
                  Depois volta ao plano gratuito Jogador. Você pode reverter antes do fim do período.
                </p>
                <Button
                  variant="destructive"
                  fullWidth
                  isLoading={isCancelling}
                  disabled={isRefunding}
                  onClick={handleCancel}
                  data-testid="subscription-confirm-cancel"
                >
                  Cancelar renovação
                </Button>
              </div>

              <Button variant="ghost" fullWidth onClick={() => setIsCancelOpen(false)} disabled={isCancelling || isRefunding}>
                Manter plano
              </Button>
            </>
          )}

          {!meLoading && !refund && (
            <>
              {meFailed && (
                <p
                  role="alert"
                  data-testid="cancel-refund-check-failed"
                  className="text-xs text-[#F0B90B] rounded border border-[rgba(240,185,11,.3)] bg-[rgba(240,185,11,.06)] p-2"
                >
                  Não foi possível verificar agora seu direito a reembolso (7 dias). Se você comprou há
                  menos de 7 dias, tente novamente em instantes ou fale com o suporte antes de cancelar —
                  o cancelamento abaixo NÃO inclui reembolso.
                </p>
              )}
              <p className="text-sm text-[#929AA5]">
                Depois disso, você volta ao plano gratuito Jogador. Você pode reverter antes do fim do período pago.
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
            </>
          )}
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
