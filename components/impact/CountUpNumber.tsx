"use client";

import { useEffect, useState } from "react";

type Props = {
  value: number;
  durationMs?: number;
  format: (n: number) => string;
};

export function CountUpNumber({ value, durationMs = 1400, format }: Props) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    setDisplay(0);
    const start = performance.now();
    const from = 0;
    const to = value;

    function tick(now: number) {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / durationMs);
      const eased = 1 - (1 - t) ** 2.4;
      setDisplay(from + (to - from) * eased);
      if (t < 1) requestAnimationFrame(tick);
      else setDisplay(to);
    }

    const id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [value, durationMs]);

  return <span className="tabular-nums">{format(display)}</span>;
}
