import type { Metadata } from "next";
import { Shield } from "lucide-react";
import Link from "next/link";
import { ROUTES } from "@/lib/constants/routes";

export const metadata: Metadata = {
  title: "Verificação de Idade — Foot Stock",
  robots: { index: false },
};

export default function VerificarIdadePage() {
  return (
    <div className="min-h-dvh bg-[#080808] flex flex-col items-center justify-center px-6 text-center gap-6">
      <div className="w-16 h-16 rounded-full bg-[rgba(201,168,76,.12)] flex items-center justify-center">
        <Shield className="h-8 w-8 text-[#c9a84c]" />
      </div>

      <div>
        <h1 className="text-2xl font-bold text-[#f0ead6] mb-2">Verificação de Idade</h1>
        <p className="text-sm text-[#7a7060] max-w-xs">
          O Foot Stock é destinado a maiores de 18 anos. Confirme sua data de nascimento para continuar.
        </p>
      </div>

      <div className="w-full max-w-xs space-y-4">
        <div>
          <label className="block text-xs font-medium text-[#7a7060] mb-1.5 text-left uppercase tracking-wide">
            Data de Nascimento
          </label>
          <input
            type="date"
            className="h-11 w-full rounded-lg border border-[rgba(201,168,76,.18)] bg-[#0f0e0b] px-3 text-sm text-[#f0ead6] focus:outline-none focus:border-[rgba(201,168,76,.4)] focus:ring-1 focus:ring-[rgba(201,168,76,.3)]"
          />
        </div>

        <button
          className="w-full h-11 rounded-lg bg-[#c9a84c] text-[#080808] font-bold text-sm hover:bg-[#d4b05a] transition-colors"
        >
          Confirmar
        </button>
      </div>

      <p className="text-xs text-[#4a3d2a] max-w-xs">
        Seus dados são protegidos conforme a LGPD.{" "}
        <Link href="#" className="underline hover:text-[#7a7060]">
          Política de Privacidade
        </Link>
      </p>
    </div>
  );
}
