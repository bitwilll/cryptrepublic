"use client";

import { useEffect, useRef, useState } from "react";

const fmt = (n: number) => n.toLocaleString("en-US").replace(/,/g, " ");

/**
 * Counts up from 0 to `value` once the element scrolls into view, with a 2.5s
 * failsafe that snaps to the final value (throttled tabs / no IntersectionObserver).
 */
export function LiveNumber({
  value,
  prefix = "",
  suffix = "",
}: {
  value: number;
  prefix?: string;
  suffix?: string;
}) {
  const [n, setN] = useState(0);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // prefers-reduced-motion: skip the observer + rAF count-up entirely and
    // show the final value. Optional-chained: jsdom has no matchMedia and the
    // guard must be null-safe (Wave 8 post-review addendum 4).
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
      setN(value);
      return;
    }
    let raf = 0;
    let done = false;
    const finish = () => {
      done = true;
      setN(value);
    };
    const run = () => {
      const t0 = performance.now();
      const dur = 1400;
      const tick = (now: number) => {
        if (done) return;
        const p = Math.min(1, (now - t0) / dur);
        setN(Math.round(value * (1 - Math.pow(1 - p, 3))));
        if (p < 1) raf = requestAnimationFrame(tick);
        else done = true;
      };
      raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting && !done) {
            run();
            io.disconnect();
          }
        });
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    const fallback = setTimeout(finish, 2500);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      clearTimeout(fallback);
    };
  }, [value]);

  // suppressHydrationWarning: server renders 0, client animates up — the text
  // intentionally differs at hydration; without this React logs an error and
  // the Playwright zero-console-errors smoke would fail.
  return (
    <b ref={ref} suppressHydrationWarning style={{ fontFamily: "var(--mono)" }}>
      {prefix}
      {fmt(n)}
      {suffix}
    </b>
  );
}
