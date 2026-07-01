"use client";

import { useReveal } from "@/lib/hooks/useReveal";

/**
 * Activates the scroll-reveal behavior for all `.reveal` elements on the page.
 * Renders nothing; included once near the top of the page.
 */
export function Reveal() {
  useReveal();
  return null;
}
