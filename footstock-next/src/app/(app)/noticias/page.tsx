import type { Metadata } from "next";
import { Suspense } from "react";
import { NoticiasContent } from "./noticias-content";

export const metadata: Metadata = {
  title: "Notícias — FootStock",
};

export default function NoticiasPage() {
  return (
    <Suspense fallback={<div className="px-4 pt-4 text-[#929AA5]">Carregando...</div>}>
      <NoticiasContent />
    </Suspense>
  );
}
