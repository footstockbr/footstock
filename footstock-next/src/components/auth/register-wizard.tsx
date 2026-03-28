"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ROUTES } from "@/lib/constants/routes";

type WizardStep = 1 | 2 | 3 | 4;

const STEP_LABELS = ["Dados", "Acesso", "Clube", "Termos"];
const STEP_TITLES = ["Seus dados", "Criar acesso", "Clube favorito", "Termos de uso"];
const STEP_SUBTITLES = [
  "Etapa 1 de 4",
  "Etapa 2 de 4",
  "Etapa 3 de 4",
  "Etapa 4 de 4",
];

// Step 1 schema
const step1Schema = z.object({
  name: z.string().min(3, "Nome deve ter ao menos 3 caracteres"),
  phone: z.string().min(10, "Telefone inválido"),
  birthDate: z.string().refine((v) => {
    const date = new Date(v);
    const age = (Date.now() - date.getTime()) / (365.25 * 24 * 3600 * 1000);
    return age >= 18;
  }, "Você deve ter ao menos 18 anos"),
  cpf: z.string().min(11, "CPF inválido").max(14),
});

// Step 2 schema
const step2Schema = z
  .object({
    email: z.string().email("Informe um email válido"),
    password: z.string().min(8, "Senha deve ter no mínimo 8 caracteres"),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "As senhas não coincidem",
    path: ["confirmPassword"],
  });

type Step1Data = z.infer<typeof step1Schema>;
type Step2Data = z.infer<typeof step2Schema>;

interface WizardData {
  step1?: Step1Data;
  step2?: Step2Data;
  clubId?: string;
  acceptedTerms?: boolean;
}

function PasswordStrength({ password }: { password: string }) {
  const score = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;

  const labels = ["Muito fraca", "Fraca", "Regular", "Forte", "Muito forte"];
  const colors = ["bg-[#ef4444]", "bg-[#ef4444]", "bg-[#c9a84c]", "bg-[#22c55e]/80", "bg-[#22c55e]"];

  if (!password) return null;

  return (
    <div className="flex flex-col gap-1 mt-1">
      <div className="flex gap-1" aria-hidden="true">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-all ${
              i <= score ? colors[score] : "bg-[#2a2010]"
            }`}
          />
        ))}
      </div>
      <p className="text-xs text-[#7a7060]" aria-live="polite">
        {password ? labels[score] : ""}
      </p>
    </div>
  );
}

function Stepper({ current }: { current: WizardStep }) {
  return (
    <div className="flex flex-col gap-1 mb-6">
      <div className="flex gap-1" role="progressbar" aria-valuenow={current} aria-valuemin={1} aria-valuemax={4}>
        {STEP_LABELS.map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-all ${
              i + 1 < current
                ? "bg-[#c9a84c]"
                : i + 1 === current
                ? "bg-[rgba(201,168,76,.6)]"
                : "bg-[#2a2010]"
            }`}
          />
        ))}
      </div>
      <div className="flex">
        {STEP_LABELS.map((label, i) => (
          <span
            key={i}
            className={`flex-1 text-[10px] text-center ${
              i + 1 <= current ? "text-[#c9a84c]" : "text-[#4a3d2a]"
            }`}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function RegisterWizard() {
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>(1);
  const [data, setData] = useState<WizardData>({});
  const [isLoading, setIsLoading] = useState(false);
  const [password, setPassword] = useState("");

  // Step 1 form
  const form1 = useForm<Step1Data>({ resolver: zodResolver(step1Schema) });
  const form2 = useForm<Step2Data>({ resolver: zodResolver(step2Schema) });

  const handleBack = () => {
    if (step === 1) router.push(ROUTES.HOME);
    else setStep((s) => (s - 1) as WizardStep);
  };

  const onStep1Submit = (d: Step1Data) => {
    setData((prev) => ({ ...prev, step1: d }));
    setStep(2);
  };

  const onStep2Submit = (d: Step2Data) => {
    setData((prev) => ({ ...prev, step2: d }));
    setStep(3);
  };

  const handleFinish = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/v1/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.step1?.name,
          email: data.step2?.email,
          password: data.step2?.password,
          phone: data.step1?.phone,
          birthDate: data.step1?.birthDate,
          clubId: data.clubId,
        }),
      });
      const json = await res.json();

      if (!json.success) {
        toast.error(json.error?.message || "Erro ao criar conta");
        return;
      }

      toast.success("Conta criada com sucesso! Bem-vindo ao Foot Stock.");
      router.replace(ROUTES.MERCADO);
    } catch {
      toast.error("Erro ao criar conta. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div data-testid="register-wizard" className="w-full max-w-sm">
      {/* Back button */}
      <button
        data-testid="register-wizard-back-button"
        onClick={handleBack}
        className="flex items-center gap-1 text-sm text-[#7a7060] hover:text-[#f0ead6] transition-colors mb-4"
      >
        <ChevronLeft className="h-4 w-4" />
        {step === 1 ? "Login" : "Voltar"}
      </button>

      <Stepper current={step} />

      <h1 id="wizard-heading" className="text-xl font-bold text-[#f0ead6] mb-0.5">
        {STEP_TITLES[step - 1]}
      </h1>
      <p className="text-xs text-[#4a3d2a] mb-6" aria-live="polite">
        {STEP_SUBTITLES[step - 1]}
      </p>

      {/* Step 1 — Dados Pessoais */}
      {step === 1 && (
        <form
          data-testid="form-register-step1"
          onSubmit={form1.handleSubmit(onStep1Submit)}
          noValidate
          className="flex flex-col gap-4"
          aria-labelledby="wizard-heading"
        >
          <Input
            data-testid="form-register-name-input"
            label="Nome completo"
            autoFocus
            placeholder="João da Silva"
            error={form1.formState.errors.name?.message}
            {...form1.register("name")}
          />
          <Input
            data-testid="form-register-phone-input"
            label="Telefone"
            type="tel"
            placeholder="(11) 99999-9999"
            error={form1.formState.errors.phone?.message}
            {...form1.register("phone")}
          />
          <Input
            data-testid="form-register-birthdate-input"
            label="Data de nascimento"
            type="date"
            hint="Você deve ter ao menos 18 anos"
            error={form1.formState.errors.birthDate?.message}
            {...form1.register("birthDate")}
          />
          <Input
            data-testid="form-register-cpf-input"
            label="CPF"
            placeholder="000.000.000-00"
            hint="Seu CPF não é armazenado, apenas validado"
            error={form1.formState.errors.cpf?.message}
            {...form1.register("cpf")}
          />
          <Button data-testid="form-register-step1-next-button" type="submit" variant="primary" size="lg" fullWidth className="mt-2">
            Próximo →
          </Button>
        </form>
      )}

      {/* Step 2 — Acesso */}
      {step === 2 && (
        <form
          data-testid="form-register-step2"
          onSubmit={form2.handleSubmit(onStep2Submit)}
          noValidate
          className="flex flex-col gap-4"
          aria-labelledby="wizard-heading"
        >
          <Input
            data-testid="form-register-email-input"
            label="Email"
            type="email"
            autoFocus
            placeholder="seu@email.com"
            error={form2.formState.errors.email?.message}
            {...form2.register("email")}
          />
          <div>
            <Input
              data-testid="form-register-password-input"
              label="Senha"
              type="password"
              showPasswordToggle
              placeholder="Mínimo 8 caracteres"
              autoComplete="new-password"
              error={form2.formState.errors.password?.message}
              {...form2.register("password", {
                onChange: (e) => setPassword(e.target.value),
              })}
            />
            <PasswordStrength password={password} />
          </div>
          <Input
            data-testid="form-register-confirm-password-input"
            label="Confirmar senha"
            type="password"
            showPasswordToggle
            placeholder="Repita a senha"
            autoComplete="new-password"
            error={form2.formState.errors.confirmPassword?.message}
            {...form2.register("confirmPassword")}
          />
          <Button data-testid="form-register-step2-next-button" type="submit" variant="primary" size="lg" fullWidth className="mt-2">
            Próximo →
          </Button>
        </form>
      )}

      {/* Step 3 — Clube Favorito */}
      {step === 3 && (
        <div data-testid="form-register-step3" className="flex flex-col gap-4" aria-labelledby="wizard-heading">
          <p className="text-sm text-[#7a7060]">
            Escolha seu clube do coração para personalizar sua experiência.
          </p>
          <div className="grid grid-cols-3 gap-2">
            {["FLAM4", "PALM4", "CRUZ4", "VASCO4", "SANT4", "GREM4"].map((ticker) => (
              <button
                key={ticker}
                data-testid={`form-register-club-button-${ticker.toLowerCase()}`}
                onClick={() => setData((prev) => ({ ...prev, clubId: ticker }))}
                className={`p-3 rounded-lg border text-xs font-mono font-bold transition-all ${
                  data.clubId === ticker
                    ? "border-[#c9a84c] bg-[rgba(201,168,76,.12)] text-[#c9a84c]"
                    : "border-[rgba(201,168,76,.18)] bg-[#141210] text-[#7a7060] hover:border-[rgba(201,168,76,.35)]"
                }`}
              >
                {ticker}
              </button>
            ))}
          </div>
          <Button
            data-testid="form-register-step3-next-button"
            variant="primary"
            size="lg"
            fullWidth
            onClick={() => setStep(4)}
            className="mt-2"
          >
            Próximo →
          </Button>
          <Button data-testid="form-register-step3-skip-button" variant="ghost" size="md" fullWidth onClick={() => setStep(4)}>
            Pular por agora
          </Button>
        </div>
      )}

      {/* Step 4 — Termos */}
      {step === 4 && (
        <div data-testid="form-register-step4" className="flex flex-col gap-4" aria-labelledby="wizard-heading">
          <div data-testid="form-register-terms-scroll" className="bg-[#141210] rounded-lg border border-[rgba(201,168,76,.18)] p-4 h-40 overflow-y-auto text-xs text-[#7a7060] leading-relaxed">
            <p className="font-semibold text-[#f0ead6] mb-2">Termos de Uso — Foot Stock</p>
            <p>
              O Foot Stock é uma plataforma educacional de simulação financeira com temática
              esportiva. Toda moeda virtual (FS$) utilizada é educacional e não possui valor
              monetário real. Usuários devem ter 18 anos ou mais conforme exigências do ECA Digital.
              Ao criar sua conta, você concorda com nossa política de privacidade e termos de uso
              completos disponíveis em footstock.com.br/termos.
            </p>
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              data-testid="form-register-terms-checkbox"
              type="checkbox"
              className="mt-0.5 accent-[#c9a84c] w-4 h-4"
              onChange={(e) =>
                setData((prev) => ({ ...prev, acceptedTerms: e.target.checked }))
              }
            />
            <span className="text-sm text-[#7a7060]">
              Li e aceito os{" "}
              <span className="text-[#c9a84c]">Termos de Uso</span> e a{" "}
              <span className="text-[#c9a84c]">Política de Privacidade</span>
            </span>
          </label>

          <Button
            data-testid="form-register-submit-button"
            variant="primary"
            size="lg"
            fullWidth
            isLoading={isLoading}
            disabled={!data.acceptedTerms}
            onClick={handleFinish}
            className="mt-2"
          >
            Criar minha conta
          </Button>
        </div>
      )}

      {step === 1 && (
        <p className="text-center text-sm text-[#7a7060] mt-6">
          Já tem conta?{" "}
          <a
            href={ROUTES.LOGIN}
            className="text-[#c9a84c] hover:text-[#d4b466] font-medium transition-colors"
          >
            Entrar
          </a>
        </p>
      )}
    </div>
  );
}
