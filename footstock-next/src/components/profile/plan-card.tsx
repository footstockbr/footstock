"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, Button, Badge } from "@/components/ui";
import { PlanBadge } from "@/components/shared/plan-badge";
import { PlanType } from "@/lib/constants/plans";
import { ROUTES } from "@/lib/constants/routes";
import { SubscriptionManage } from "./subscription-manage";
import { useAnalytics } from "@/hooks/useAnalytics";
import type { User } from "@/types";

interface Subscription {
  status: string;
  expiresAt: string | null;
  cancelledAt: string | null;
  // T-021: campos de bônus com carência
  bonusAmount: number | null;
  bonusScheduledAt: string | null;
  bonusCreditedAt: string | null;
}

interface PlanCardProps {
  user: User;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatFS(amount: number) {
  return `FS$ ${amount.toLocaleString("pt-BR")}`;
}

export function PlanCard({ user }: PlanCardProps) {
  // Staff (ADMIN/CLUB_PARTNER): planType=null. isFreePlan=true para skip do fetch.
  const isStaff = !user.planType;
  const isFreePlan = isStaff || user.planType === "JOGADOR";
  const [sub, setSub] = useState<Subscription | null>(null);
  const { track } = useAnalytics();

  useEffect(() => {
    if (isFreePlan) return;
    fetch("/api/v1/subscriptions/me")
      .then((r) => {
        if (!r.ok) return null;
        return r.json();
      })
      .then((json) => {
        if (json?.data) setSub(json.data);
      })
      .catch(() => {
        // Silently fail — show fallback
      });
  }, [isFreePlan]);

  // Staff render: card neutro (sem plano de player, sem assinatura).
  if (isStaff) {
    return (
      <Card data-testid="profile-plan-card">
        <div className="p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-[#929AA5] mb-1">Tipo de conta</p>
            <p className="text-sm text-[#EAECEF] font-medium">
              {user.userType === "CLUB_PARTNER"
                ? "Clube Parceiro"
                : "Conta administrativa"}
            </p>
            <p className="text-xs text-[#929AA5] mt-1">
              Sem plano de player. Sem assinatura.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const isCancelled = sub?.status === "CANCELLED";
  const isCancellationLock = sub?.status === "CANCELLATION_LOCK";
  const isScheduledCancel = isCancelled || isCancellationLock;

  // T-021: bônus pendente = agendado mas não creditado
  const hasPendingBonus =
    sub?.bonusScheduledAt != null && sub?.bonusCreditedAt == null;

  return (
    <Card data-testid="profile-plan-card">
      <div className="p-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-[#929AA5] mb-1">Plano atual</p>
          <PlanBadge plan={user.planType as PlanType} size="md" />
        </div>
        {isFreePlan && (
          <Link
            href={ROUTES.PLANOS}
            onClick={() => {
              // EVT-019: plan_upgrade_clicked
              track("plan_upgrade_clicked", {
                origin: "profile_plan_card",
                current_plan: user.planType as "JOGADOR" | "CRAQUE" | "LENDA",
              });
            }}
          >
            <Button variant="plan" size="sm" data-testid="plan-upgrade-cta">
              Fazer upgrade
            </Button>
          </Link>
        )}
      </div>

      {!isFreePlan && (
        <div className="px-4 pb-4 flex flex-col gap-3 border-t border-[rgba(240,185,11,.1)] pt-3">
          <div className="flex items-center justify-between">
            <div>
              {isScheduledCancel ? (
                <>
                  <p className="text-xs text-[#929AA5]">Acesso até</p>
                  <p className="text-sm text-[#EAECEF] font-medium">
                    {sub?.expiresAt ? formatDate(sub.expiresAt) : "—"}
                  </p>
                  <Badge variant="warning" size="sm" className="mt-1">
                    Cancelamento agendado
                  </Badge>
                </>
              ) : (
                <>
                  <p className="text-xs text-[#929AA5]">Próxima renovação</p>
                  <p className="text-sm text-[#EAECEF] font-medium">
                    {sub?.expiresAt ? formatDate(sub.expiresAt) : "Automática"}
                  </p>
                </>
              )}
            </div>
            {!isCancelled && (
              <SubscriptionManage planType={user.planType} />
            )}
          </div>

          {/* T-021: status de bônus pendente */}
          {hasPendingBonus && sub?.bonusScheduledAt && (
            <div
              data-testid="bonus-pending-banner"
              className="flex items-center gap-2 rounded-md bg-[rgba(46,189,133,.08)] border border-[rgba(46,189,133,.2)] px-3 py-2"
            >
              <span className="text-[#2EBD85] text-xs font-semibold shrink-0">
                Bônus pendente
              </span>
              <span className="text-[#929AA5] text-xs">
                {sub.bonusAmount
                  ? `${formatFS(sub.bonusAmount)} disponível em ${formatDate(sub.bonusScheduledAt)}`
                  : `Disponível em ${formatDate(sub.bonusScheduledAt)}`}
              </span>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
