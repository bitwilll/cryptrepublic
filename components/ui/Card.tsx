import type { ComponentPropsWithoutRef } from "react";

/**
 * Generic squared card. The marketing port mostly uses the ported Home.html
 * classes directly (.pillar/.hold/.quote); this primitive is for later waves
 * (dashboard) that want a plain bordered card with the blue corner accent.
 */
export function Card({ className = "", children, ...rest }: ComponentPropsWithoutRef<"article">) {
  return (
    <article className={`pillar ${className}`.trim()} {...rest}>
      {children}
    </article>
  );
}
