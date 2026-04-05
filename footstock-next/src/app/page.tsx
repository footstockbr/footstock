"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SplashScreen } from "@/components/auth/splash-screen";
import { LoginForm } from "@/components/auth/login-form";
import { Spinner } from "@/components/ui/spinner";
import { ROUTES } from "@/lib/constants/routes";

type PageState = "splash" | "checking-auth" | "show-login" | "redirecting";
// BOUNDARY NOTE: a verificação de auth é feita client-side por design intencional.
// O splash screen animado exige "use client" nesta página; o middleware já redireciona
// usuários autenticados para /mercado antes de chegarem aqui. O fetch abaixo é o
// fallback para o caso em que a sessão não pôde ser resolvida no middleware.
// Follow-up: /nextjs:server-actions para avaliar consolidação via middleware.

export default function RootPage() {
  const router = useRouter();
  const [state, setState] = useState<PageState>("splash");

  const checkAuth = useCallback(async () => {
    setState("checking-auth");
    try {
      const res = await fetch("/api/v1/auth/session");
      const json = await res.json();

      if (json.authenticated && json.user) {
        setState("redirecting");
        router.replace(ROUTES.MERCADO);
      } else {
        setState("show-login");
      }
    } catch {
      setState("show-login");
    }
  }, [router]);

  const handleSplashComplete = useCallback(() => {
    checkAuth();
  }, [checkAuth]);

  if (state === "splash") {
    return <SplashScreen onComplete={handleSplashComplete} />;
  }

  if (state === "checking-auth" || state === "redirecting") {
    return (
      <div className="flex items-center justify-center min-h-dvh bg-[#0B0E11]">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-dvh bg-[#0B0E11] px-4">
      <LoginForm />
    </div>
  );
}
