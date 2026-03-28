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

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm text-[#f0ead6] font-medium tracking-wide"
          >
            {label}
            {props.required && (
              <span className="text-[#ef4444] ml-1">*</span>
            )}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7a7060]">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            type={inputType}
            className={cn(
              "h-11 w-full rounded-md border bg-[rgba(201,168,76,.04)] text-[#f0ead6] placeholder:text-[#4a3d2a] text-sm transition-all duration-150",
              "focus:outline-none focus:border-[rgba(201,168,76,.5)] focus:ring-2 focus:ring-[rgba(201,168,76,.15)]",
              error
                ? "border-[#ef4444] focus:border-[#ef4444] focus:ring-[rgba(239,68,68,.15)]"
                : "border-[rgba(201,168,76,.18)]",
              leftIcon ? "pl-10" : "pl-3",
              showPasswordToggle ? "pr-11" : "pr-3",
              className
            )}
            {...props}
          />
          {showPasswordToggle && (
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7a7060] hover:text-[#f0ead6] transition-colors"
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          )}
        </div>
        {error && (
          <p className="text-sm text-[#ef4444] flex items-center gap-1">
            <span aria-hidden>⚠</span> {error}
          </p>
        )}
        {hint && !error && (
          <p className="text-xs text-[#4a3d2a]">{hint}</p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

export { Input };
