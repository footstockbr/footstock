"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, Button, Badge } from "@/components/ui";
import { PlanBadge } from "@/components/shared/plan-badge";
import { PlanType } from "@/lib/constants/plans";
import { ROUTES } from "@/lib/constants/routes";
import { SubscriptionManage } from "./subscription-manage";
import type { User } from "@/types";

interface Subscription {
  status: string;
  expiresAt: string | null;
  cancelledAt: string | null;
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

export function PlanCard({ user }: PlanCardProps) {
  const isFreePlan = user.planType === "JOGADOR";
  const [sub, setSub] = useState<Subscription | null>(null);

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

  const isCancelled = sub?.status === "CANCELLED";

  return (
    <Card data-testid="profile-plan-card">
      <div className="p-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-[#929AA5] mb-1">Plano atual</p>
          <PlanBadge plan={user.planType as PlanType} size="md" />
        </div>
        {isFreePlan && (
          <Link href={ROUTES.PLANOS}>
            <Button variant="plan" size="sm" data-testid="plan-upgrade-cta">
              Fazer upgrade
            </Button>
          </Link>
        )}
      </div>

      {!isFreePlan && (
        <div className="px-4 pb-4 flex items-center justify-between border-t border-[rgba(240,185,11,.1)] pt-3">
          <div>
            {isCancelled ? (
              <>
                <p className="text-xs text-[#929AA5]">Cancelamento</p>
                <Badge variant="warning" size="sm" className="mt-1">
                  Cancelamento solicitado
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
          {!isCancelled && <SubscriptionManage />}
        </div>
      )}
    </Card>
  );
}
