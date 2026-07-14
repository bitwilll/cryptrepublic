"use client";

import { useEffect } from "react";

/**
 * Reproduces Home.html's reveal-on-scroll behavior.
 *
 * - Elements already near the top of the viewport get the `in` class immediately.
 * - Remaining `.reveal` elements are observed and revealed when they intersect.
 * - A 1800ms failsafe reveals anything still hidden so the page never renders
 *   blank if IntersectionObserver is throttled or unavailable.
 */
export function useReveal(): void {
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 },
    );

    const els = document.querySelectorAll<HTMLElement>(".reveal");
    els.forEach((el) => {
      if (el.getBoundingClientRect().top < window.innerHeight * 1.05) {
        el.classList.add("in");
      } else {
        io.observe(el);
      }
    });

    const failsafe = window.setTimeout(() => {
      document.querySelectorAll<HTMLElement>(".reveal:not(.in)").forEach((el) => {
        el.classList.add("in");
      });
    }, 1800);

    return () => {
      io.disconnect();
      window.clearTimeout(failsafe);
    };
  }, []);
}
