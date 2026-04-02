import type { Metadata } from "next";
import { Bot, Lock } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ROUTES } from "@/lib/constants/routes";

export const metadata: Metadata = {
  title: "Assessor IA — Foot Stock",
};

export default function AssessorPage() {
  // TODO: verificar plano do usuário — este componente mostra upgrade gate para plano Jogador
  const isLocked = true;

  if (isLocked) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center gap-4">
        <div className="w-16 h-16 rounded-full bg-[rgba(240,185,11,.12)] flex items-center justify-center">
          <Bot className="h-8 w-8 text-[#F0B90B]" />
        </div>
        <Badge variant="craque" size="md">Plano Craque+</Badge>
        <h1 className="text-xl font-bold text-[#EAECEF]">Assessor IA</h1>
        <p className="text-sm text-[#929AA5] max-w-xs">
          Converse com nosso assessor de investimentos alimentado por IA para receber análises e estratégias personalizadas de trading.
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
    <div className="flex flex-col h-[calc(100dvh-56px-56px)]">
      <div className="flex items-center gap-2 px-4 pt-4 pb-3 border-b border-[rgba(240,185,11,.1)]">
        <Bot className="h-5 w-5 text-[#F0B90B]" />
        <h1 className="text-base font-semibold text-[#EAECEF]">Assessor IA</h1>
        <Badge variant="craque" size="xs">Craque</Badge>
      </div>

      <div className="flex-1 p-4 overflow-y-auto">
        <p className="text-sm text-[#929AA5] text-center mt-8">
          Chat com Assessor IA — integração com backend pendente
        </p>
      </div>

      <div className="px-4 pb-4 border-t border-[rgba(240,185,11,.1)] pt-3">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Pergunte ao seu assessor..."
            aria-label="Pergunte ao assessor IA"
            className="flex-1 h-11 rounded-lg border border-[rgba(240,185,11,.18)] bg-[#181A20] px-3 text-sm text-[#EAECEF] placeholder:text-[#707A8A] focus:outline-none focus:border-[rgba(240,185,11,.4)]"
          />
          <Button variant="primary" size="md" aria-label="Enviar pergunta">Enviar</Button>
        </div>
      </div>
    </div>
  );
}
