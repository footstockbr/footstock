"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ROUTES } from "@/lib/constants/routes";

const loginSchema = z.object({
  email: z.string().email("Informe um email válido"),
  password: z.string().min(8, "Senha deve ter no mínimo 8 caracteres"),
});

type LoginFormData = z.infer<typeof loginSchema>;

function LoginForm() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();

      if (!json.success) {
        toast.error(json.error?.message || "Email ou senha incorretos");
        return;
      }

      if (json.data?.requiresOnboarding) {
        router.replace("/onboarding");
      } else {
        router.replace(ROUTES.MERCADO);
      }
    } catch {
      toast.error("Erro ao conectar. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div data-testid="login-page" className="w-full max-w-sm">
      <div className="flex flex-col items-center gap-1 mb-8">
        {/* Logo mini */}
        {/* @ASSET_PLACEHOLDER
name: logo-foot
type: image
extension: png
aspect_ratio: 1:1
dimensions: 56x56
description: Logo Foot Stock mini para o formulário de login. Versão compacta da marca.
context: Cabeçalho do formulário de login
style: Premium, ouro
mood: Confiante
colors: #C9A84C
elements: Bola de futebol estilizada
avoid: Texto no logo
        */}
        <img
          src="/logo-foot.png"
          alt="Foot Stock"
          width={56}
          height={56}
          className="w-14 h-14 object-contain mb-1"
        />
        <h1 className="text-xl font-bold text-[#f0ead6]">
          Entrar no Foot Stock
        </h1>
        <p className="text-sm text-[#4a3d2a]">O mercado do futebol brasileiro</p>
      </div>

      <form data-testid="form-login" onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <Input
          data-testid="form-login-email-input"
          label="Email"
          type="email"
          placeholder="seu@email.com"
          autoComplete="email"
          disabled={isLoading}
          error={errors.email?.message}
          {...register("email")}
        />

        <div className="flex flex-col gap-1">
          <Input
            data-testid="form-login-password-input"
            label="Senha"
            type="password"
            placeholder="••••••••"
            autoComplete="current-password"
            showPasswordToggle
            disabled={isLoading}
            error={errors.password?.message}
            {...register("password")}
          />
          <div className="flex justify-end mt-1">
            <Link
              data-testid="login-forgot-password-link"
              href={ROUTES.FORGOT_PASSWORD}
              className="text-xs text-[#c9a84c] hover:text-[#d4b466] transition-colors"
            >
              Esqueci minha senha →
            </Link>
          </div>
        </div>

        <Button
          data-testid="form-login-submit-button"
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          isLoading={isLoading}
          className="mt-2"
        >
          Entrar
        </Button>
      </form>

      <p className="text-center text-sm text-[#7a7060] mt-6">
        Não tem conta?{" "}
        <Link
          data-testid="login-register-link"
          href={ROUTES.CADASTRO}
          className="text-[#c9a84c] hover:text-[#d4b466] font-medium transition-colors"
        >
          Criar conta
        </Link>
      </p>
    </div>
  );
}

export { LoginForm };
