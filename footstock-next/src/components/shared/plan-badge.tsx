import { Badge } from "@/components/ui/badge";
import { PlanType } from "@/lib/constants/plans";

interface PlanBadgeProps {
  plan: PlanType;
  size?: "xs" | "sm" | "md";
}

const planVariantMap = {
  [PlanType.JOGADOR]: "jogador",
  [PlanType.CRAQUE]: "craque",
  [PlanType.LENDA]: "lenda",
} as const;

const planIconMap = {
  [PlanType.JOGADOR]: "⚽",
  [PlanType.CRAQUE]: "💎",
  [PlanType.LENDA]: "⭐",
};

function PlanBadge({ plan, size = "sm" }: PlanBadgeProps) {
  return (
    <Badge variant={planVariantMap[plan]} size={size}>
      {planIconMap[plan]} {plan}
    </Badge>
  );
}

export { PlanBadge };
