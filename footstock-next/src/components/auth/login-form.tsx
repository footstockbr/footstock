"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { createBrowserClient } from "@supabase/ssr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ROUTES } from "@/lib/constants/routes";
import { loginSchema, type LoginFormData } from "@/lib/schemas/auth.schema";
import { DEV_TEST_USERS } from "@/lib/constants/dev-test-users";
import { useAnalytics } from "@/hooks/useAnalytics";

function LoginForm() {
  const router = useRouter();
  const { track, identify } = useAnalytics();
  const [isLoading, setIsLoading] = useState(false);
  const [devLoginRole, setDevLoginRole] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const isDev = process.env.NODE_ENV !== "production";
  const devUsersByRole = Object.entries(DEV_TEST_USERS).map(([email, profile]) => ({
    role: profile.label ?? profile.adminRole ?? profile.planType,
    email,
    password: profile.password,
  }));

  async function performLogin(email: string, password: string) {
    const isDev = process.env.NODE_ENV !== "production";
    const endpoint = isDev ? "/api/v1/auth/dev-login" : "/api/v1/auth/login";

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const json = await res.json();

    if (json.error) {
      throw new Error(json.error.message || "Email ou senha incorretos");
    }

    // Em produção, setar sessão Supabase nos cookies do browser
    if (!isDev) {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      await supabase.auth.setSession({
        access_token: json.data.session.access_token,
        refresh_token: json.data.session.refresh_token,
      });
    }

    // EVT-005: Login Concluido
    const userData = json.data.user;
    track('login_completed', {
      method: 'email_password',
      plan: (userData?.planType ?? 'JOGADOR') as 'JOGADOR' | 'CRAQUE' | 'LENDA',
    });

    // Store admin role in cookie for middleware redirect
    const userAdminRole = json.data.user?.adminRole;
    if (userAdminRole) {
      document.cookie = `fs-admin-role=${userAdminRole}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
    } else {
      document.cookie = "fs-admin-role=; path=/; max-age=0";
    }

    const adminRoles = ["SUPER_ADMIN", "ADMINISTRADOR", "MONITOR", "EDITOR", "MODERADOR"];
    const isAdmin = userAdminRole && adminRoles.includes(userAdminRole);
    const isClubPartner = userAdminRole === "CLUB_PARTNER";
    router.replace(isAdmin ? ROUTES.ADMIN : isClubPartner ? ROUTES.CLUB : ROUTES.MERCADO);
  }

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    try {
      await performLogin(data.email, data.password);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao conectar. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  async function handleDevCardLogin(email: string, password: string, role: string) {
    setDevLoginRole(role);
    try {
      await performLogin(email, password);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao entrar com usuário de teste");
    } finally {
      setDevLoginRole(null);
    }
  }

  return (
    <div data-testid="login-page" className="w-full max-w-md">
      <div className="flex flex-col items-center gap-1 mb-8">
        {/* Logo mini */}
        {/* @ASSET_PLACEHOLDER
name: logo-foot
type: image
extension: png
aspect_ratio: 1:1
dimensions: 56x56
description: Logo FootStock mini para o formulário de login. Versão compacta da marca.
context: Cabeçalho do formulário de login
style: Premium, ouro
mood: Confiante
colors: #F0B90B
elements: Bola de futebol estilizada
avoid: Texto no logo
        */}
        <Image
          src="/logo-foot.png"
          alt="FootStock"
          width={56}
          height={56}
          className="w-14 h-14 object-contain mb-1"
          priority
        />
        <h1 className="text-xl font-bold text-[#EAECEF]">
          Entrar no FootStock
        </h1>
        <p className="text-sm text-[#707A8A]">O mercado do futebol brasileiro</p>
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
              className="text-xs text-[#F0B90B] hover:text-[#FCD535] transition-colors"
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

      <p className="text-center text-sm text-[#929AA5] mt-6">
        Não tem conta?{" "}
        <Link
          data-testid="login-register-link"
          href={ROUTES.CADASTRO}
          className="text-[#F0B90B] hover:text-[#FCD535] font-medium transition-colors"
        >
          Criar conta
        </Link>
      </p>

      {isDev && (
      <footer className="pt-3 mt-4 border-t border-[#2B3139]/60">
        <div className="mb-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[#707A8A]">
            Usuários de teste
          </h2>
        </div>

        <div className="flex flex-row gap-2 overflow-x-auto pb-1">
          {devUsersByRole.map((user) => (
            <button
              key={user.role}
              type="button"
              onClick={() => void handleDevCardLogin(user.email, user.password, user.role)}
              aria-label={`Entrar como ${user.role}`}
              disabled={isLoading || devLoginRole === user.role}
              className="min-w-[190px] rounded-md border border-[#2B3139] bg-[#1E2329]/50 p-2 text-left transition-colors hover:border-[#F0B90B]/60 hover:bg-[#1E2329] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F0B90B]/60 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <p className="text-[11px] font-bold text-[#F0B90B]">{user.role}</p>
              <p className="mt-1 text-[11px] text-[#929AA5] break-all">
                Login: <span className="font-mono text-[#EAECEF]">{user.email}</span>
              </p>
              <p className="mt-1 text-[11px] text-[#929AA5] break-all">
                Senha: <span className="font-mono text-[#EAECEF]">{user.password}</span>
              </p>
              <p className="mt-2 text-[10px] uppercase tracking-wide text-[#707A8A]">
                {devLoginRole === user.role ? "Entrando..." : "Clique para entrar"}
              </p>
            </button>
          ))}
        </div>
      </footer>
      )}
    </div>
  );
}

export { LoginForm };
