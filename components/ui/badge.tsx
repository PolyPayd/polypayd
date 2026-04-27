import { cn } from "@/lib/cn";

export type BadgeVariant = "gray" | "blue" | "amber" | "purple" | "green" | "red";

const variantClasses: Record<BadgeVariant, string> = {
  gray:   "bg-white/5   text-fp-text-secondary border-white/10",
  blue:   "bg-blue-500/15  text-blue-300   border-blue-500/20",
  amber:  "bg-amber-500/15 text-amber-300  border-amber-500/20",
  purple: "bg-purple-500/15 text-purple-300 border-purple-500/20",
  green:  "bg-green-500/15 text-green-300  border-green-500/20",
  red:    "bg-red-500/15  text-red-300    border-red-500/20",
};

export function Badge({
  variant = "gray",
  children,
  className,
}: {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        variantClasses[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
