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
        <div className="w-16 h-16 rounded-full bg-[rgba(201,168,76,.12)] flex items-center justify-center">
          <Bot className="h-8 w-8 text-[#c9a84c]" />
        </div>
        <Badge variant="craque" size="md">Plano Craque+</Badge>
        <h1 className="text-xl font-bold text-[#f0ead6]">Assessor IA</h1>
        <p className="text-sm text-[#7a7060] max-w-xs">
          Converse com nosso assessor de investimentos alimentado por IA para receber análises e estratégias personalizadas de trading.
        </p>
        <div className="flex items-center gap-2 text-xs text-[#4a3d2a]">
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
      <div className="flex items-center gap-2 px-4 pt-4 pb-3 border-b border-[rgba(201,168,76,.1)]">
        <Bot className="h-5 w-5 text-[#c9a84c]" />
        <h1 className="text-base font-semibold text-[#f0ead6]">Assessor IA</h1>
        <Badge variant="craque" size="xs">Craque</Badge>
      </div>

      <div className="flex-1 p-4 overflow-y-auto">
        <p className="text-sm text-[#7a7060] text-center mt-8">
          Chat com Assessor IA — integração com backend pendente
        </p>
      </div>

      <div className="px-4 pb-4 border-t border-[rgba(201,168,76,.1)] pt-3">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Pergunte ao seu assessor..."
            className="flex-1 h-11 rounded-lg border border-[rgba(201,168,76,.18)] bg-[#0f0e0b] px-3 text-sm text-[#f0ead6] placeholder:text-[#4a3d2a] focus:outline-none focus:border-[rgba(201,168,76,.4)]"
          />
          <Button variant="primary" size="md">Enviar</Button>
        </div>
      </div>
    </div>
  );
}
