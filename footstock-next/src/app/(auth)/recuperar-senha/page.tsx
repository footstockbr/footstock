"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ChevronLeft, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ROUTES } from "@/lib/constants/routes";

const schema = z.object({
  email: z.string().email("Informe um email válido"),
});

export default function RecuperarSenhaPage() {
  const [sent, setSent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { register, handleSubmit, formState: { errors }, getValues } = useForm({
    resolver: zodResolver(schema),
  });

  const onSubmit = async ({ email }: { email: string }) => {
    setIsLoading(true);
    try {
      await fetch("/api/v1/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } catch {
      toast.error("Erro ao enviar email. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="w-full max-w-sm flex flex-col items-center gap-4 text-center py-8">
        <CheckCircle className="h-12 w-12 text-[#2EBD85]" />
        <h1 className="text-xl font-bold text-[#EAECEF]">Email enviado!</h1>
        <p className="text-sm text-[#929AA5]">
          Enviamos as instruções de recuperação para{" "}
          <span className="text-[#F0B90B]">{getValues("email")}</span>. Verifique sua caixa de entrada.
        </p>
        <Link
          href={ROUTES.LOGIN}
          className="text-sm text-[#F0B90B] hover:text-[#FCD535] transition-colors mt-2"
        >
          ← Voltar ao login
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm">
      <Link
        href={ROUTES.HOME}
        className="flex items-center gap-1 text-sm text-[#929AA5] hover:text-[#EAECEF] transition-colors mb-6"
      >
        <ChevronLeft className="h-4 w-4" />
        Login
      </Link>

      <h1 className="text-xl font-bold text-[#EAECEF] mb-1">Recuperar senha</h1>
      <p className="text-sm text-[#929AA5] mb-6">
        Informe seu email e enviaremos as instruções para redefinir sua senha.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <Input
          label="Email"
          type="email"
          autoFocus
          placeholder="seu@email.com"
          error={errors.email?.message}
          {...register("email")}
        />
        <Button type="submit" variant="primary" size="lg" fullWidth isLoading={isLoading}>
          Enviar instruções
        </Button>
      </form>
    </div>
  );
}
