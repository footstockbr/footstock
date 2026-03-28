import { RegisterWizard } from "@/components/auth/register-wizard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Criar conta — Foot Stock",
  robots: "noindex",
};

export default function CadastroPage() {
  return <RegisterWizard />;
}
