"use client";

import { forwardRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  showPasswordToggle?: boolean;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      label,
      hint,
      error,
      leftIcon,
      showPasswordToggle,
      type,
      id,
      ...props
    },
    ref
  ) => {
    const [showPassword, setShowPassword] = useState(false);
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");
    const inputType =
      showPasswordToggle ? (showPassword ? "text" : "password") : type;
    const errorId = error ? `${inputId}-error` : undefined;
    const hintId = hint && !error ? `${inputId}-hint` : undefined;
    const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm text-[#EAECEF] font-medium tracking-wide"
          >
            {label}
            {props.required && (
              <span className="text-[#F6465D] ml-1" aria-hidden="true">*</span>
            )}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#929AA5]" aria-hidden="true">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            type={inputType}
            aria-required={props.required}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={cn(
              "h-11 w-full rounded-md border bg-[rgba(240,185,11,.04)] text-[#EAECEF] placeholder:text-[#707A8A] text-sm transition-all duration-150",
              "focus:outline-none focus:border-[rgba(240,185,11,.5)] focus:ring-2 focus:ring-[rgba(240,185,11,.15)]",
              error
                ? "border-[#F6465D] focus:border-[#F6465D] focus:ring-[rgba(239,68,68,.15)]"
                : "border-[rgba(240,185,11,.18)]",
              leftIcon ? "pl-10" : "pl-3",
              showPasswordToggle ? "pr-11" : "pr-3",
              className
            )}
            {...props}
          />
          {showPasswordToggle && (
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#929AA5] hover:text-[#EAECEF] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded"
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Eye className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          )}
        </div>
        {error && (
          <p id={errorId} role="alert" className="text-sm text-[#F6465D] flex items-center gap-1">
            <span aria-hidden="true">⚠</span> {error}
          </p>
        )}
        {hint && !error && (
          <p id={hintId} className="text-xs text-[#707A8A]">{hint}</p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

export { Input };
