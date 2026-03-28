import Link from "next/link";
import { ROUTES } from "@/lib/constants/routes";

export default function NotFound() {
  return (
    <div className="min-h-dvh bg-[#080808] flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <div className="text-6xl font-black text-[#c9a84c] mb-4">404</div>
        <h1 className="text-lg font-bold text-[#f0ead6] mb-2">Página não encontrada</h1>
        <p className="text-sm text-[#7a7060] mb-6">
          A página que você está procurando não existe ou foi movida.
        </p>
        <Link
          href={ROUTES.HOME}
          className="inline-flex items-center justify-center w-full h-11 rounded-lg bg-[#c9a84c] text-[#080808] text-sm font-semibold transition-opacity hover:opacity-90"
        >
          Voltar ao início
        </Link>
      </div>
    </div>
  );
}
