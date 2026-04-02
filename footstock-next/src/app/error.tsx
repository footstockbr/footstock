"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ROUTES } from "@/lib/constants/routes";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorProps) {
  const router = useRouter();

  useEffect(() => {
    console.error("[error boundary]", error);
  }, [error]);

  return (
    <div className="min-h-dvh bg-[#0B0E11] flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <div className="w-12 h-12 rounded-xl bg-[rgba(240,185,11,.1)] flex items-center justify-center mx-auto mb-4">
          <span className="text-xl" aria-hidden="true">⚠</span>
        </div>
        <h1 className="text-lg font-bold text-[#EAECEF] mb-2">Algo deu errado</h1>
        <p className="text-sm text-[#929AA5] mb-6">
          Ocorreu um erro inesperado. Tente novamente ou volte ao início.
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={reset}
            className="w-full h-11 rounded-lg bg-[#F0B90B] text-[#0B0E11] text-sm font-semibold transition-opacity hover:opacity-90"
          >
            Tentar novamente
          </button>
          <button
            onClick={() => router.replace(ROUTES.HOME)}
            className="w-full h-11 rounded-lg border border-[rgba(240,185,11,.2)] text-[#929AA5] text-sm transition-colors hover:text-[#c5b99a]"
          >
            Voltar ao início
          </button>
        </div>
      </div>
    </div>
  );
}
