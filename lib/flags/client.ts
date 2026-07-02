"use client";
import { useEffect, useState } from "react";
import { flagValue } from "./defaults";

/**
 * Client-side flag helpers (Wave 9, constraint #8). fetchFlags NEVER throws —
 * any failure resolves to {} and flagValue falls back to the DECLARED
 * defaults. useFlag renders the DEFAULT until the fetch resolves, so a
 * default-true flag has no flash-of-hidden.
 */
export async function fetchFlags(): Promise<Record<string, boolean>> {
  try {
    const res = await fetch("/api/flags", { cache: "no-store" });
    if (!res.ok) return {};
    const body = (await res.json()) as { flags?: Record<string, boolean> };
    return body.flags ?? {};
  } catch {
    return {};
  }
}

export function useFlag(key: string): boolean {
  const [enabled, setEnabled] = useState(() => flagValue(key));
  useEffect(() => {
    let alive = true;
    void fetchFlags().then((flags) => {
      if (!alive) return;
      setEnabled(key in flags ? flags[key] : flagValue(key));
    });
    return () => {
      alive = false;
    };
  }, [key]);
  return enabled;
}
