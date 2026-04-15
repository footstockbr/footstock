import { RegisterWizard } from "@/components/auth/register-wizard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Criar conta — Foot Stock",
  robots: "noindex",
};

interface Props {
  searchParams: Promise<{ ref?: string }>
}

export default async function CadastroPage({ searchParams }: Props) {
  const { ref } = await searchParams
  return (
    <div data-testid="page-cadastro">
      <RegisterWizard initialReferredByCode={ref ?? ''} />
    </div>
  );
}
