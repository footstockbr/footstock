import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Bot, Lock } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ROUTES } from "@/lib/constants/routes";
import { getAuthUser } from "@/lib/auth";
import AssessorClient from "./AssessorClient";
import type { PlanType } from "@/types";

export const metadata: Metadata = {
  title: "Assessor IA — FootStock",
};

export default async function AssessorPage() {
  const auth = await getAuthUser();

  if (!auth) {
    redirect(ROUTES.LOGIN);
  }

  const { user } = auth;
  const isLocked = user.planType === "JOGADOR";

  if (isLocked) {
    return (
      <div data-testid="page-assessor" className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center gap-4">
        <div className="w-16 h-16 rounded-full bg-[rgba(240,185,11,.12)] flex items-center justify-center">
          <Bot className="h-8 w-8 text-[#F0B90B]" />
        </div>
        <Badge variant="craque" size="md">Plano Craque+</Badge>
        <h1 className="text-xl font-bold text-[#EAECEF]">Assessor IA</h1>
        <p className="text-sm text-[#929AA5] max-w-xs">
          Selecione qualquer ativo e receba uma análise fundamentalista personalizada gerada por inteligência artificial.
        </p>
        <div className="flex items-center gap-2 text-xs text-[#707A8A]">
          <Lock className="h-3.5 w-3.5" />
          <span>Disponível nos planos Craque e Lenda</span>
        </div>
        <Link href={ROUTES.PLANOS}>
          <Button variant="plan" size="lg">
            ⭐ Fazer Upgrade
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div data-testid="page-assessor" className="flex flex-col min-h-[calc(100dvh-56px-56px)]">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-3 border-b border-[rgba(240,185,11,.1)]">
        <Bot className="h-5 w-5 text-[#F0B90B]" />
        <h1 className="text-base font-semibold text-[#EAECEF]">Assessor IA</h1>
        {user.planType === "LENDA" ? (
          <Badge variant="lenda" size="xs">Lenda</Badge>
        ) : (
          <Badge variant="craque" size="xs">Craque</Badge>
        )}
      </div>

      {/* Client interativo */}
      <div className="flex-1 overflow-y-auto">
        <AssessorClient planType={user.planType as PlanType} />
      </div>
    </div>
  );
}
