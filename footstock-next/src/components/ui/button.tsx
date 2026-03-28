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
          "bg-[#c9a84c] text-[#080808] hover:bg-[#d4b466] shadow-[0_8px_32px_rgba(201,168,76,.3)]",
        secondary:
          "bg-[#161d28] text-[#f0ead6] border border-[rgba(201,168,76,.18)] hover:border-[rgba(201,168,76,.4)]",
        ghost:
          "bg-transparent text-[#7a7060] hover:bg-[#0f0e0b] hover:text-[#f0ead6]",
        destructive:
          "bg-[#ef4444] text-white hover:opacity-90",
        plan:
          "bg-[#c9a84c] text-[#080808] hover:bg-[#f6ab22] font-semibold",
        outline:
          "border border-[rgba(201,168,76,.25)] text-[#c9a84c] hover:bg-[rgba(201,168,76,.08)]",
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
        aria-busy={isLoading}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          children
        )}
      </button>
    );
  }
);

Button.displayName = "Button";

export { Button, buttonVariants };
