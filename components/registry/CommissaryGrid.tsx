"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { CommissaryCategory, CommissaryItem } from "@/lib/content/commissary";
import styles from "./registry.module.css";

/**
 * The Commissary catalogue with register-of-interest (Wave 15 client island).
 * GET /api/commissary/interest on mount (public counts + `mine` when signed
 * in); "Register interest" POSTs { itemId }, a registered item toggles to a
 * withdrawable state (DELETE). A 401 renders a sign-in prompt linking /auth.
 * Counts adjust optimistically from the confirmed server response. All async
 * status text is aria-live.
 */

interface Props {
  groups: readonly { category: CommissaryCategory; items: readonly CommissaryItem[] }[];
}

type ItemMessage = { kind: "ok" | "error" | "signin"; text: string };

export function CommissaryGrid({ groups }: Props): React.ReactElement {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [mine, setMine] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, ItemMessage>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/commissary/interest");
        if (!res.ok) return;
        const body = (await res.json()) as { counts: Record<string, number>; mine: string[] };
        if (cancelled) return;
        setCounts(body.counts);
        setMine(new Set(body.mine));
      } catch {
        // counts stay empty — the catalogue itself still renders
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setMessage = useCallback((itemId: string, msg: ItemMessage | null) => {
    setMessages((prev) => {
      const next = { ...prev };
      if (msg) next[itemId] = msg;
      else delete next[itemId];
      return next;
    });
  }, []);

  const toggle = useCallback(
    async (itemId: string) => {
      const registered = mine.has(itemId);
      setBusy(itemId);
      setMessage(itemId, null);
      try {
        const res = await fetch("/api/commissary/interest", {
          method: registered ? "DELETE" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ itemId }),
        });
        if (res.status === 401) {
          setMessage(itemId, { kind: "signin", text: "Sign in to register interest." });
          return;
        }
        if (!res.ok) {
          setMessage(itemId, {
            kind: "error",
            text: "The registry did not accept that. Try again.",
          });
          return;
        }
        setMine((prev) => {
          const next = new Set(prev);
          if (registered) next.delete(itemId);
          else next.add(itemId);
          return next;
        });
        setCounts((prev) => ({
          ...prev,
          [itemId]: Math.max(0, (prev[itemId] ?? 0) + (registered ? -1 : 1)),
        }));
        setMessage(
          itemId,
          registered
            ? { kind: "ok", text: "Interest withdrawn." }
            : { kind: "ok", text: "Interest registered ✓ (you may withdraw)" },
        );
      } catch {
        setMessage(itemId, {
          kind: "error",
          text: "Network error — the registry was not reached.",
        });
      } finally {
        setBusy(null);
      }
    },
    [mine, setMessage],
  );

  return (
    <div>
      {groups.map(({ category, items }) => (
        <section key={category} className={styles.sectionGap} aria-label={category}>
          <div className={styles.commCatHead}>
            <h3>{category}</h3>
            <span className={styles.commCount}>
              {items.length} item{items.length === 1 ? "" : "s"}
            </span>
          </div>
          <ul className={styles.commGrid} style={{ listStyle: "none", padding: 0 }}>
            {items.map((item) => {
              const registered = mine.has(item.id);
              const count = counts[item.id] ?? 0;
              const msg = messages[item.id];
              return (
                <li key={item.id} className={styles.commCard}>
                  <h4>{item.title}</h4>
                  <p className={styles.commNote}>{item.note}</p>
                  <span className={styles.commTally}>
                    {loaded
                      ? `${count} citizen${count === 1 ? "" : "s"} interested`
                      : "Counting interest…"}
                  </span>
                  <button
                    type="button"
                    className={`${styles.interestBtn}${registered ? ` ${styles.interestBtnActive}` : ""}`}
                    onClick={() => toggle(item.id)}
                    disabled={busy === item.id}
                    aria-pressed={registered}
                  >
                    {busy === item.id
                      ? "Filing…"
                      : registered
                        ? "Withdraw interest"
                        : "Register interest"}
                  </button>
                  <p
                    className={`${styles.commStatus}${msg?.kind === "error" ? ` ${styles.commStatusError}` : ""}`}
                    role="status"
                    aria-live="polite"
                  >
                    {msg?.kind === "signin" ? (
                      <>
                        <Link href="/auth">Sign in</Link> to register interest.
                      </>
                    ) : (
                      (msg?.text ?? "")
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
