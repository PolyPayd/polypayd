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
};

export function ProfileAvatar({ name, email, imageUrl }: Props) {
  const initials = initialsFromName(name || email, email);

  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- Clerk URLs; avoids remotePatterns config
      <img
        src={imageUrl}
        alt=""
        className="h-[4.5rem] w-[4.5rem] rounded-full object-cover ring-2 ring-white/[0.08]"
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <div
      className="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full bg-[#161F2B] text-lg font-semibold tracking-tight text-[#F9FAFB] ring-2 ring-white/[0.08]"
      aria-hidden
    >
      {initials}
    </div>
  );
}
