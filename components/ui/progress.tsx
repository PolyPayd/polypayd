import { cn } from "@/lib/cn";

// Lightweight progress bar. Pure CSS, no Radix dep — keeps the bundle slim
// since we only use it for slot-claim progress.
export function Progress({
  value,
  max = 100,
  className,
  barClassName,
}: {
  value: number;
  max?: number;
  className?: string;
  barClassName?: string;
}) {
  const clamped = Math.max(0, Math.min(value, max));
  const pct = max > 0 ? (clamped / max) * 100 : 0;

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={clamped}
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full bg-white/10",
        className
      )}
    >
      <div
        className={cn(
          "h-full rounded-full bg-fp-accent transition-all",
          barClassName
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
