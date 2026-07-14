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

    // Poster parallax (Athens-26 surface): elements tagged [data-parallax]
    // drift at data-parallax-speed × scrollY via a CSS var — transform-only,
    // rAF-throttled, and NEVER enabled under prefers-reduced-motion (the JS
    // check mirrors the global CSS animation kill).
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const layers = reduced
      ? []
      : Array.from(document.querySelectorAll<HTMLElement>("[data-parallax]"));
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        const y = window.scrollY;
        for (const el of layers) {
          const speed = Number(el.dataset.parallaxSpeed ?? "0.05");
          el.style.setProperty("--plx", String(y * speed));
        }
      });
    };
    if (layers.length > 0) {
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
    }

    return () => {
      io.disconnect();
      window.clearTimeout(failsafe);
      if (layers.length > 0) window.removeEventListener("scroll", onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);
}
