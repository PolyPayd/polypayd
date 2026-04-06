import { cn } from "@/lib/cn";

function initialsFromName(name: string, email: string) {
  const n = name.trim();
  if (n.length >= 2 && n !== "Account") {
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return n.slice(0, 2).toUpperCase();
  }
  const local = email.split("@")[0] ?? "";
  return (local.slice(0, 2) || "PP").toUpperCase();
}

type Props = {
  name: string;
  email: string;
  imageUrl: string | null | undefined;
  onPress?: () => void;
  /** Loading overlay on the circle */
  busy?: boolean;
};

export function ProfileAvatar({ name, email, imageUrl, onPress, busy }: Props) {
  const initials = initialsFromName(name || email, email);

  const visual = imageUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- user-uploaded + Clerk URLs
    <img
      src={imageUrl}
      alt=""
      className="h-full w-full rounded-full object-cover"
      referrerPolicy="no-referrer"
    />
  ) : (
    <div
      className="flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br from-[#1e3a5f] via-[#162536] to-[#0f1419] text-xl font-semibold tracking-tight text-[#E2E8F0] ring-1 ring-white/[0.06]"
      aria-hidden
    >
      {initials}
    </div>
  );

  const circle = (
    <span
      className={cn(
        "relative flex h-[5.25rem] w-[5.25rem] shrink-0 items-center justify-center overflow-hidden rounded-full ring-2 ring-white/[0.1] ring-offset-2 ring-offset-[#0B0F14] transition-shadow",
        onPress && "shadow-[0_0_0_1px_rgba(255,255,255,0.06)] group-hover:ring-[#3B82F6]/25 group-hover:shadow-[0_0_20px_-4px_rgba(59,130,246,0.35)]"
      )}
    >
      {visual}
      {busy ? (
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-[#0B0F14]/65 backdrop-blur-[2px]">
          <span
            className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/90"
            aria-hidden
          />
        </span>
      ) : null}
    </span>
  );

  if (onPress) {
    return (
      <button
        type="button"
        onClick={onPress}
        disabled={busy}
        className={cn(
          "group rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/55 focus-visible:ring-offset-4 focus-visible:ring-offset-[#0B0F14]",
          "transition-transform active:scale-[0.97] disabled:pointer-events-none disabled:opacity-70"
        )}
        aria-label="Manage profile photo"
      >
        {circle}
      </button>
    );
  }

  return circle;
}
