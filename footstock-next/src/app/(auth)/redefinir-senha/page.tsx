import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { env } from "@/lib/env";

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
  const magicLinkMode =
    env.AUTH_ENABLE_MAGIC_LINK_RESET === "true" && Boolean(env.RESEND_API_KEY);

  return (
    <div data-testid="page-redefinir-senha">
      <ResetPasswordForm token={token} magicLinkMode={magicLinkMode} />
    </div>
  );
}
