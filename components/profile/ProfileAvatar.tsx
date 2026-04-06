import { cn } from "@/lib/cn";

function initialsFromName(name: string, email: string) {
  const n = name.trim();
  if (n.length >= 2) {
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return n.slice(0, 2).toUpperCase();
  }
  const local = email.split("@")[0] ?? "";
  return (local.slice(0, 2) || "??").toUpperCase();
}

type Props = {
  name: string;
  email: string;
  imageUrl: string | null | undefined;
  /** Opens avatar actions when set (Monzo-style tap on photo). */
  onPress?: () => void;
};

export function ProfileAvatar({ name, email, imageUrl, onPress }: Props) {
  const initials = initialsFromName(name || email, email);

  const visual = imageUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- user-uploaded + Clerk URLs
    <img
      src={imageUrl}
      alt=""
      className="h-[4.5rem] w-[4.5rem] rounded-full object-cover ring-2 ring-white/[0.08]"
      referrerPolicy="no-referrer"
    />
  ) : (
    <div
      className="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full bg-[#161F2B] text-lg font-semibold tracking-tight text-[#F9FAFB] ring-2 ring-white/[0.08]"
      aria-hidden
    >
      {initials}
    </div>
  );

  if (onPress) {
    return (
      <button
        type="button"
        onClick={onPress}
        className={cn(
          "rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0F14]",
          "transition-transform active:scale-[0.98]"
        )}
        aria-label="Profile photo options"
      >
        {visual}
      </button>
    );
  }

  return visual;
}
