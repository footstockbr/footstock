import { cn } from "@/lib/utils";

interface AvatarProps {
  name?: string;
  src?: string;
  color?: string;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}

const AVATAR_COLORS = [
  "bg-[#F0B90B]",
  "bg-[#F0B90B]",
  "bg-[#2EBD85]",
  "bg-[#2EBD85]",
  "bg-[#f97316]",
  "bg-[#e05555]",
];

function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

function getColorIndex(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % AVATAR_COLORS.length;
}

const sizeClasses = {
  xs: "w-6 h-6 text-[10px]",
  sm: "w-8 h-8 text-xs",
  md: "w-10 h-10 text-sm",
  lg: "w-12 h-12 text-base",
};

function Avatar({ name, src, color, size = "md", className }: AvatarProps) {
  const colorClass = color
    ? undefined
    : name
    ? AVATAR_COLORS[getColorIndex(name)]
    : AVATAR_COLORS[0];

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name || "Avatar"}
        className={cn(
          "rounded-full object-cover border border-[rgba(240,185,11,.18)]",
          sizeClasses[size],
          className
        )}
      />
    );
  }

  return (
    <div
      className={cn(
        "rounded-full flex items-center justify-center font-black text-[#0B0E11] border border-[rgba(240,185,11,.18)] shrink-0",
        sizeClasses[size],
        colorClass,
        className
      )}
      style={color ? { backgroundColor: color } : undefined}
      aria-label={name}
    >
      {name ? getInitials(name) : "?"}
    </div>
  );
}

export { Avatar };
