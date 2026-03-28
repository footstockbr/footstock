import type { Metadata } from "next";
import { Bell, TrendingUp, Trophy, AlertCircle, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Notificações — Foot Stock",
};

type NotificationType = "price" | "league" | "alert" | "system";

interface Notification {
  id: number;
  type: NotificationType;
  title: string;
  body: string;
  time: string;
  read: boolean;
}

const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: 1,
    type: "price",
    title: "FLAM4 subiu +8,2%",
    body: "Flamengo disparou após anúncio de renovação de contrato com atacante titular.",
    time: "há 5 min",
    read: false,
  },
  {
    id: 2,
    type: "alert",
    title: "Stop Loss ativado — PALM4",
    body: "Sua ordem de stop loss foi executada. Posição encerrada a FS$ 42,10.",
    time: "há 23 min",
    read: false,
  },
  {
    id: 3,
    type: "league",
    title: "Liga Nacional: você subiu 3 posições",
    body: "Você está agora em #1.244 do ranking geral. Continue assim!",
    time: "há 1h",
    read: false,
  },
  {
    id: 4,
    type: "system",
    title: "Mercado abre em 30 minutos",
    body: "A sessão de negociação começa às 10h00. Prepare suas ordens.",
    time: "há 2h",
    read: true,
  },
  {
    id: 5,
    type: "price",
    title: "CORI4 atingiu sua meta de preço",
    body: "Corinthians atingiu FS$ 55,00 conforme seu alerta configurado.",
    time: "há 4h",
    read: true,
  },
  {
    id: 6,
    type: "system",
    title: "Bem-vindo ao Foot Stock!",
    body: "Sua conta foi criada com sucesso. Explore o mercado e faça seu primeiro investimento.",
    time: "há 2 dias",
    read: true,
  },
];

const ICON_MAP: Record<NotificationType, React.ElementType> = {
  price: TrendingUp,
  league: Trophy,
  alert: AlertCircle,
  system: Info,
};

const COLOR_MAP: Record<NotificationType, string> = {
  price: "text-[#4ade80]",
  league: "text-[#c9a84c]",
  alert: "text-[#ef4444]",
  system: "text-[#60a5fa]",
};

const BG_MAP: Record<NotificationType, string> = {
  price: "bg-[rgba(74,222,128,.1)]",
  league: "bg-[rgba(201,168,76,.1)]",
  alert: "bg-[rgba(239,68,68,.1)]",
  system: "bg-[rgba(96,165,250,.1)]",
};

export default function InboxPage() {
  const unreadCount = MOCK_NOTIFICATIONS.filter((n) => !n.read).length;

  return (
    <div className="px-4 pt-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold text-[#f0ead6] flex items-center gap-2">
          <Bell className="h-5 w-5 text-[#c9a84c]" />
          Notificações
          {unreadCount > 0 && (
            <Badge variant="craque" size="xs">{unreadCount} novas</Badge>
          )}
        </h1>
        <button className="text-xs text-[#7a7060] hover:text-[#c9a84c] transition-colors">
          Marcar todas como lidas
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {MOCK_NOTIFICATIONS.map((notification) => {
          const Icon = ICON_MAP[notification.type];
          return (
            <div
              key={notification.id}
              className={`flex gap-3 p-4 rounded-lg border transition-colors ${
                notification.read
                  ? "bg-[#141210] border-[rgba(201,168,76,.08)]"
                  : "bg-[rgba(201,168,76,.04)] border-[rgba(201,168,76,.2)]"
              }`}
            >
              <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${BG_MAP[notification.type]}`}>
                <Icon className={`h-4 w-4 ${COLOR_MAP[notification.type]}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className={`text-sm font-semibold leading-tight ${
                    notification.read ? "text-[#c5b99a]" : "text-[#f0ead6]"
                  }`}>
                    {notification.title}
                  </p>
                  {!notification.read && (
                    <div className="w-2 h-2 rounded-full bg-[#c9a84c] flex-shrink-0 mt-1" />
                  )}
                </div>
                <p className="text-xs text-[#7a7060] mt-1 leading-relaxed">{notification.body}</p>
                <p className="text-[10px] text-[#4a3d2a] mt-1.5">{notification.time}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
