"use client";
import { useCallback, useEffect, useState } from "react";
import { ErrorBox, KindPill, Skeletons, formatDateTime, type ConnectionsPayload } from "./bits";
import styles from "./community.module.css";

/**
 * CONNECTIONS register (Wave 17): incoming requests (accept / decline pair),
 * outgoing pending (Civic ID only — the addressee's name stays private until
 * they accept), and the accepted circle (kind pill FAMILY gold-ink / FRIEND
 * blue, MESSAGE shortcut, two-step REMOVE).
 */

type Load<T> = { status: "loading" } | { status: "ok"; data: T } | { status: "error" };

export function ConnectionsPanel({
  onOpenMessages,
  onChanged,
}: {
  onOpenMessages: (peerCivicId: string) => void;
  onChanged: () => void;
}) {
  const [state, setState] = useState<Load<ConnectionsPayload>>({ status: "loading" });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setState({ status: "loading" });
    fetch("/api/community/connections", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d: ConnectionsPayload) => setState({ status: "ok", data: d }))
      .catch(() => setState({ status: "error" }));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function respond(connectionId: string, action: "accept" | "decline" | "remove") {
    setError(null);
    try {
      const res = await fetch("/api/community/connections/respond", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ connectionId, action }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "The action was refused.");
      load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The action was refused.");
    }
  }

  if (state.status === "loading") return <Skeletons lines={4} />;
  if (state.status === "error") {
    return (
      <ErrorBox>
        Could not load your connections.{" "}
        <button type="button" className={styles.actionBtn} onClick={load}>
          Retry
        </button>
      </ErrorBox>
    );
  }

  const { incoming, outgoing, accepted } = state.data;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div aria-live="polite" className={styles.statusLine}>
        {error && <div className={styles.errorBox}>{error}</div>}
      </div>

      <section aria-label="Incoming requests">
        <h2 className={styles.microLabel} style={{ margin: "0 0 10px" }}>
          Incoming requests
        </h2>
        {incoming.length === 0 ? (
          <div className="empty-state">No requests are awaiting your answer.</div>
        ) : (
          <div className={styles.rows}>
            {incoming.map((r) => (
              <div key={r.connectionId} className={styles.row} data-testid="incoming-row">
                <div className={styles.rowMain}>
                  <span className={styles.rowTitle}>
                    {r.requester.display}{" "}
                    <span className={styles.mono} style={{ fontWeight: 400 }}>
                      · {r.requester.civicId}
                    </span>
                  </span>
                  <span className={styles.rowMeta}>
                    <KindPill kind={r.kind} />
                    <span className={styles.metaText}>Filed {formatDateTime(r.createdAt)}</span>
                  </span>
                  {r.greeting && <p className={styles.greeting}>&ldquo;{r.greeting}&rdquo;</p>}
                </div>
                <div className={styles.rowActions}>
                  <button
                    type="button"
                    className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
                    onClick={() => void respond(r.connectionId, "accept")}
                    data-testid="accept-btn"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    className={styles.actionBtn}
                    onClick={() => void respond(r.connectionId, "decline")}
                    data-testid="decline-btn"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section aria-label="Outgoing requests">
        <h2 className={styles.microLabel} style={{ margin: "0 0 10px" }}>
          Outgoing — awaiting response
        </h2>
        {outgoing.length === 0 ? (
          <div className="empty-state">No requests of yours are pending.</div>
        ) : (
          <div className={styles.rows}>
            {outgoing.map((r) => (
              <div key={r.connectionId} className={styles.row} data-testid="outgoing-row">
                <div className={styles.rowMain}>
                  <span className={`${styles.rowTitle} ${styles.mono}`}>{r.civicId}</span>
                  <span className={styles.rowMeta}>
                    <KindPill kind={r.kind} />
                    <span className={styles.metaText}>Filed {formatDateTime(r.createdAt)}</span>
                  </span>
                </div>
                <div className={styles.rowActions}>
                  <span className={`${styles.status} ${styles.statusPending}`}>Pending</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section aria-label="Your connections">
        <h2 className={styles.microLabel} style={{ margin: "0 0 10px" }}>
          Your connections
        </h2>
        {accepted.length === 0 ? (
          <div className="empty-state">
            No connections yet. Ask a citizen for their Civic ID and file a request under ADD
            CITIZEN.
          </div>
        ) : (
          <div className={styles.rows}>
            {accepted.map((c) => (
              <AcceptedRow
                key={c.connectionId}
                connectionId={c.connectionId}
                kind={c.kind}
                display={c.peer.display}
                civicId={c.peer.civicId}
                since={c.since}
                onMessage={() => onOpenMessages(c.peer.civicId)}
                onRemove={() => void respond(c.connectionId, "remove")}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function AcceptedRow({
  connectionId,
  kind,
  display,
  civicId,
  since,
  onMessage,
  onRemove,
}: {
  connectionId: string;
  kind: string;
  display: string;
  civicId: string;
  since: string;
  onMessage: () => void;
  onRemove: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className={styles.row} data-testid="accepted-row" data-connection={connectionId}>
      <div className={styles.rowMain}>
        <span className={styles.rowTitle}>
          {display}{" "}
          <span className={styles.mono} style={{ fontWeight: 400 }}>
            · {civicId}
          </span>
        </span>
        <span className={styles.rowMeta}>
          <KindPill kind={kind} />
          <span className={styles.metaText}>Since {formatDateTime(since)}</span>
        </span>
      </div>
      <div className={styles.rowActions}>
        {!confirming ? (
          <>
            <button
              type="button"
              className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
              onClick={onMessage}
              data-testid="message-btn"
            >
              Message
            </button>
            <button
              type="button"
              className={styles.actionBtn}
              onClick={() => setConfirming(true)}
              data-testid="remove-btn"
            >
              Remove
            </button>
          </>
        ) : (
          <>
            <span className={styles.microLabel}>Remove this connection?</span>
            <button
              type="button"
              className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
              onClick={() => {
                setConfirming(false);
                onRemove();
              }}
              data-testid="remove-confirm-btn"
            >
              Confirm removal
            </button>
            <button type="button" className={styles.actionBtn} onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
