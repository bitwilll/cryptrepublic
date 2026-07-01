"use client";

import { useCallback, useState, type KeyboardEvent } from "react";

/**
 * Reproduces Home.html's passport-book open/close toggle.
 *
 * The book toggles an `open` class on click and on Enter/Space keydown
 * (hover is handled by CSS for pointer devices).
 */
export function usePassportBook() {
  const [open, setOpen] = useState(false);

  const toggle = useCallback(() => setOpen((o) => !o), []);

  const onClick = useCallback(() => {
    toggle();
  }, [toggle]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle();
      }
    },
    [toggle],
  );

  return { open, onClick, onKeyDown };
}
