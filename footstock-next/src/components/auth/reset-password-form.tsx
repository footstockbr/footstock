"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ChevronLeft, AlertTriangle, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ROUTES } from "@/lib/constants/routes";
import { resetPasswordSchema, type ResetPasswordFormData as FormData } from "@/lib/schemas/auth.schema";

interface ResetPasswordFormProps {
  token: string | null;
  magicLinkMode?: boolean;
}

/**
 * Formulário de redefinição de senha.
 * Recebe o token da URL (passado pela página pai via searchParams).
 * Exibe estado de "link inválido" se token estiver ausente.
 */
export function ResetPasswordForm({ token, magicLinkMode = false }: ResetPasswordFormProps) {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(resetPasswordSchema),
    mode: "onBlur",
  });

  // NXAUTH-07: modo passwordless — recuperação é por magic-link clicado no email,
  // não há mais formulário de senha nesta página.
  if (magicLinkMode) {
    return (
      <div className="w-full max-w-sm flex flex-col items-center gap-4 text-center py-8">
        <MailCheck className="h-12 w-12 text-[#F0B90B]" />
        <h1 className="text-xl font-bold text-[#EAECEF]">Verifique seu email</h1>
        <p className="text-sm text-[#929AA5]">
          Enviamos um link de acesso para o email cadastrado. Basta clicar para entrar — você não precisa mais definir uma nova senha.
        </p>
        <Link
          href={ROUTES.FORGOT_PASSWORD}
          className="text-sm text-[#F0B90B] hover:text-[#FCD535] transition-colors"
        >
          Reenviar link
        </Link>
      </div>
    );
  }

  // Token ausente na URL — estado de link inválido
  if (!token) {
    return (
      <div className="w-full max-w-sm flex flex-col items-center gap-4 text-center py-8">
        <AlertTriangle className="h-12 w-12 text-[#f59e0b]" />
        <h1 className="text-xl font-bold text-[#EAECEF]">Link inválido</h1>
        <p className="text-sm text-[#929AA5]">
          Este link de redefinição de senha é inválido ou já foi utilizado.
        </p>
        <Link
          href={ROUTES.FORGOT_PASSWORD}
          className="text-sm text-[#F0B90B] hover:text-[#FCD535] transition-colors"
        >
          Solicitar novo link
        </Link>
      </div>
    );
  }

  const onSubmit = async ({ newPassword }: FormData) => {
    try {
      const res = await fetch("/api/v1/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });

      const json = await res.json();

      if (!res.ok) {
        if (res.status === 422) {
          // Token inválido/expirado
          toast.error("Link expirado. Solicite um novo link de recuperação.");
        } else {
          toast.error("Erro ao redefinir senha. Tente novamente.");
        }
        return;
      }

      toast.success("Senha redefinida com sucesso!");
      router.replace(ROUTES.HOME);
    } catch {
      toast.error("Erro ao redefinir senha. Verifique sua conexão e tente novamente.");
    }
  };

  return (
    <div className="w-full max-w-sm">
      <Link
        href={ROUTES.FORGOT_PASSWORD}
        className="flex items-center gap-1 text-sm text-[#929AA5] hover:text-[#EAECEF] transition-colors mb-6"
      >
        <ChevronLeft className="h-4 w-4" />
        Recuperar senha
      </Link>

      <h1 className="text-xl font-bold text-[#EAECEF] mb-1">Redefinir senha</h1>
      <p className="text-sm text-[#929AA5] mb-6">
        Defina uma nova senha para a sua conta.
      </p>

      <form data-testid="form-redefinir-senha" onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <Input
          data-testid="form-redefinir-senha-password-input"
          label="Nova senha"
          type="password"
          autoFocus
          placeholder="Mínimo 8 caracteres"
          error={errors.newPassword?.message}
          {...register("newPassword")}
        />
        <Input
          data-testid="form-redefinir-senha-confirm-input"
          label="Confirmar nova senha"
          type="password"
          placeholder="Repita a nova senha"
          error={errors.confirmPassword?.message}
          {...register("confirmPassword")}
        />
        <Button data-testid="form-redefinir-senha-submit-button" type="submit" variant="primary" size="lg" fullWidth isLoading={isSubmitting}>
          Redefinir senha
        </Button>
      </form>
    </div>
  );
}
