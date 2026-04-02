import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

const badgeVariants = cva(
  "inline-flex items-center gap-1 text-xs font-semibold rounded-sm tracking-wide border",
  {
    variants: {
      variant: {
        default: "bg-[#202630] border-[rgba(240,185,11,.18)] text-[#929AA5]",
        jogador:
          "bg-[rgba(100,116,139,.2)] border-[rgba(100,116,139,.3)] text-[#64748b]",
        craque:
          "bg-[rgba(56,189,248,.2)] border-[rgba(56,189,248,.3)] text-[#F0B90B]",
        lenda:
          "bg-[rgba(240,185,11,.2)] border-[rgba(240,185,11,.3)] text-[#F0B90B]",
        success:
          "bg-[rgba(34,197,94,.2)] border-[rgba(34,197,94,.3)] text-[#2EBD85]",
        "success-strong":
          "bg-[rgba(34,197,94,.3)] border-[rgba(34,197,94,.4)] text-[#2EBD85]",
        error:
          "bg-[rgba(239,68,68,.2)] border-[rgba(239,68,68,.3)] text-[#F6465D]",
        warning:
          "bg-[rgba(240,185,11,.2)] border-[rgba(240,185,11,.3)] text-[#F0B90B]",
        info:
          "bg-[rgba(56,189,248,.2)] border-[rgba(56,189,248,.3)] text-[#F0B90B]",
      },
      size: {
        xs: "px-1.5 py-0.5 text-[10px]",
        sm: "px-2 py-0.5 text-xs",
        md: "px-2.5 py-1 text-xs",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "sm",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return (
    <span
      className={cn(badgeVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export type BadgeVariant = NonNullable<BadgeProps["variant"]>;
export { Badge, badgeVariants };
