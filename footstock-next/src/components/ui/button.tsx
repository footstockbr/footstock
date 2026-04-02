"use client";

import { forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

const buttonVariants = cva(
  "inline-flex items-center justify-center font-medium transition-all duration-150 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
  {
    variants: {
      variant: {
        primary:
          "bg-[#F0B90B] text-[#0B0E11] hover:bg-[#FCD535] shadow-[0_8px_32px_rgba(240,185,11,.3)]",
        secondary:
          "bg-[#202630] text-[#EAECEF] border border-[rgba(240,185,11,.18)] hover:border-[rgba(240,185,11,.4)]",
        ghost:
          "bg-transparent text-[#929AA5] hover:bg-[#181A20] hover:text-[#EAECEF]",
        destructive:
          "bg-[#F6465D] text-white hover:opacity-90",
        plan:
          "bg-[#F0B90B] text-[#0B0E11] hover:bg-[#f6ab22] font-semibold",
        outline:
          "border border-[rgba(240,185,11,.25)] text-[#F0B90B] hover:bg-[rgba(240,185,11,.08)]",
      },
      size: {
        sm: "h-8 px-3 text-sm rounded-md",
        md: "h-10 px-4 text-sm rounded-md",
        lg: "h-12 px-6 text-base rounded-lg",
        icon: "h-10 w-10 rounded-md",
        "icon-sm": "h-8 w-8 rounded-md",
      },
      fullWidth: {
        true: "w-full",
        false: "",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
      fullWidth: false,
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      fullWidth,
      isLoading,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, fullWidth, className }))}
        ref={ref}
        disabled={disabled || isLoading}
        aria-disabled={disabled || isLoading}
        aria-busy={isLoading}
        {...props}
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span className="sr-only">Carregando...</span>
          </>
        ) : (
          children
        )}
      </button>
    );
  }
);

Button.displayName = "Button";

export { Button, buttonVariants };
