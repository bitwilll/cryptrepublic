"use client";
import { useCallback, useEffect, useState } from "react";
import { CIVIC_ID_HINT, ErrorBox, Skeletons } from "./bits";
import { MessagesPanel } from "./MessagesPanel";
import { ConnectionsPanel } from "./ConnectionsPanel";
import { AddCitizenPanel } from "./AddCitizenPanel";
import styles from "./community.module.css";

/**
 * Citizens & messages (Wave 17) client island — three registers under one
 * seal: MESSAGES (conversations + threads), CONNECTIONS (requests + accepted
 * circle), ADD CITIZEN (file a request by Civic ID). The caller's own Civic
 * ID sits on top — the only handle citizens ever share; the Republic never
 * lists citizens for browsing.
 */

type Tab = "messages" | "connections" | "add";
type Load<T> = { status: "loading" } | { status: "ok"; data: T } | { status: "error" };

interface MePayload {
  civicId: string;
  connectionCounts: { incoming: number; outgoing: number; accepted: number };
}

const TAB_ORDER = ["messages", "connections", "add"] as const;
const TAB_LABELS: Record<Tab, string> = {
  messages: "Messages",
  connections: "Connections",
  add: "Add citizen",
};

export function CommunityApp() {
  const [tab, setTab] = useState<Tab>("messages");
  const [me, setMe] = useState<Load<MePayload>>({ status: "loading" });
  // Set by the CONNECTIONS tab's MESSAGE shortcut — the messages tab opens
  // the DIRECT thread with this peer once its conversation list is in.
  const [focusPeer, setFocusPeer] = useState<string | null>(null);

  const loadMe = useCallback(() => {
    setMe({ status: "loading" });
    fetch("/api/community/me", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d: MePayload) => setMe({ status: "ok", data: d }))
      .catch(() => setMe({ status: "error" }));
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  const openMessagesWith = useCallback((peerCivicId: string) => {
    setFocusPeer(peerCivicId);
    setTab("messages");
  }, []);

  return (
    <div className={`wrap ${styles.stack}`}>
      <div>
        <div className="kicker">CIVIC REGISTRY</div>
        <h2 style={{ fontSize: 32, marginTop: 10 }}>Citizens &amp; messages</h2>
        <p className={styles.lede}>
          Connect with citizens by Civic ID, keep your circle of friends and family, and message
          them under the Republic&rsquo;s seal. Identity disclosure stays in every citizen&rsquo;s
          own hands.
        </p>
      </div>

      <CivicIdCard me={me} onRetry={loadMe} />

      <div className={styles.tabs} role="tablist" aria-label="Community sections">
        {TAB_ORDER.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`community-tab-${key}`}
            aria-selected={tab === key}
            aria-controls={tab === key ? `community-panel-${key}` : undefined}
            tabIndex={tab === key ? 0 : -1}
            className={`${styles.tab} ${tab === key ? styles.tabActive : ""}`}
            onClick={() => setTab(key)}
            onKeyDown={(e) => {
              const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
              if (!dir) return;
              e.preventDefault();
              const next =
                TAB_ORDER[(TAB_ORDER.indexOf(tab) + dir + TAB_ORDER.length) % TAB_ORDER.length];
              setTab(next);
              document.getElementById(`community-tab-${next}`)?.focus();
            }}
            data-testid={`community-tab-${key}`}
          >
            {TAB_LABELS[key]}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`community-panel-${tab}`} aria-labelledby={`community-tab-${tab}`}>
        {tab === "messages" && (
          <MessagesPanel focusPeer={focusPeer} onFocusConsumed={() => setFocusPeer(null)} />
        )}
        {tab === "connections" && (
          <ConnectionsPanel onOpenMessages={openMessagesWith} onChanged={loadMe} />
        )}
        {tab === "add" && <AddCitizenPanel onFiled={loadMe} />}
      </div>
    </div>
  );
}

function CivicIdCard({
  me,
  onRetry,
}: {
  me: { status: "loading" } | { status: "ok"; data: MePayload } | { status: "error" };
  onRetry: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy(civicId: string) {
    try {
      await navigator.clipboard.writeText(civicId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable — the mono value stays selectable by hand
    }
  }

  return (
    <section className={styles.card} aria-label="Your Civic ID">
      <h2 className={styles.microLabel} style={{ margin: 0 }}>
        Your Civic ID
      </h2>
      {me.status === "loading" && <Skeletons lines={1} />}
      {me.status === "error" && (
        <ErrorBox>
          Could not load your Civic ID.{" "}
          <button type="button" className={styles.actionBtn} onClick={onRetry}>
            Retry
          </button>
        </ErrorBox>
      )}
      {me.status === "ok" && (
        <>
          <div className={styles.civicRow}>
            <span className={styles.civicValue} data-testid="my-civic-id">
              {me.data.civicId}
            </span>
            <button
              type="button"
              className={styles.actionBtn}
              onClick={() => copy(me.data.civicId)}
              data-testid="copy-civic-id"
            >
              {copied ? "Copied ✓" : "Copy"}
            </button>
          </div>
          <p className={styles.hint} style={{ marginTop: 10 }}>
            {CIVIC_ID_HINT}
          </p>
        </>
      )}
    </section>
  );
}
