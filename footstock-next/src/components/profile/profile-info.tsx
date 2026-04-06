import { Avatar, Badge, Card } from "@/components/ui";
import { CLUBS } from "@/lib/constants/clubs";
import type { User } from "@/types";

const INVESTOR_PROFILE_LABELS: Record<string, string> = {
  INICIANTE: "Iniciante",
  INTERMEDIARIO: "Intermediário",
  AVANCADO: "Avançado",
  FA: "Fã de Futebol",
};

interface ProfileInfoProps {
  user: User;
}

export function ProfileInfo({ user }: ProfileInfoProps) {
  const club = CLUBS.find((c) => c.ticker === user.favoriteClub);

  return (
    <Card data-testid="profile-info">
      <div className="flex items-start gap-3 p-4">
        <Avatar name={user.name ?? user.email} size="md" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[#EAECEF] truncate">
            {user.name ?? "Usuário"}
          </p>
          <p className="text-xs text-[#929AA5] truncate">{user.email}</p>
          {user.favoriteClub && (
            <p className="text-xs text-[#929AA5] mt-1">
              ⚽ {club?.name ?? user.favoriteClub}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 px-4 pb-4 pt-0 border-t border-[rgba(240,185,11,.1)]">
        <Badge variant={user.planType.toLowerCase() as "jogador" | "craque" | "lenda"} size="sm">
          {user.planType}
        </Badge>
        {user.investorProfile && (
          <Badge variant="default" size="sm">
            {INVESTOR_PROFILE_LABELS[user.investorProfile] ?? user.investorProfile}
          </Badge>
        )}
      </div>
    </Card>
  );
}
