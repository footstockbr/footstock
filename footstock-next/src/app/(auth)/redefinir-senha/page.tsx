import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata: Metadata = {
  title: "Redefinir Senha — FootStock",
  description: "Defina uma nova senha para a sua conta FootStock.",
  robots: { index: false, follow: false },
};

interface ResetPasswordPageProps {
  searchParams: Promise<{ token?: string }>;
}

/**
 * Página de redefinição de senha.
 * Lê o token do link de recuperação enviado por email (via searchParams).
 * Renderiza ResetPasswordForm com o token para validação no formulário.
 */
export default async function RedefinirSenhaPage({ searchParams }: ResetPasswordPageProps) {
  const params = await searchParams;
  const token = params.token ?? null;

  return (
    <div data-testid="page-redefinir-senha">
      <ResetPasswordForm token={token} />
    </div>
  );
}
