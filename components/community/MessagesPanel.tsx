"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ErrorBox,
  HONESTY_LINE,
  KindPill,
  Skeletons,
  formatDateTime,
  type AcceptedConnection,
  type ConnectionsPayload,
  type ConversationSummary,
  type ThreadMessage,
} from "./bits";
import styles from "./community.module.css";

/**
 * MESSAGES register (Wave 17): conversation list (title, last excerpt,
 * unread pill) → thread view (member-scrollable region, squared bubbles —
 * mine --paper / theirs --card, sender micro-label Civic ID + display,
 * en-GB times) with an enter-to-send composer, plus the NEW GROUP flow
 * (title + checkboxes over accepted connections). The registry stores
 * messages in the clear — the honesty line under the composer says so.
 */

type Load<T> = { status: "loading" } | { status: "ok"; data: T } | { status: "error" };
type View = { kind: "list" } | { kind: "thread"; conversationId: string } | { kind: "new-group" };

export function MessagesPanel({
  focusPeer,
  onFocusConsumed,
}: {
  focusPeer: string | null;
  onFocusConsumed: () => void;
}) {
  const [view, setView] = useState<View>({ kind: "list" });
  const [list, setList] = useState<Load<ConversationSummary[]>>({ status: "loading" });

  const load = useCallback(() => {
    setList({ status: "loading" });
    fetch("/api/community/conversations", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d: { conversations: ConversationSummary[] }) =>
        setList({ status: "ok", data: d.conversations }),
      )
      .catch(() => setList({ status: "error" }));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // The CONNECTIONS tab's MESSAGE shortcut: open the DIRECT thread with the peer.
  useEffect(() => {
    if (!focusPeer || list.status !== "ok") return;
    const match = list.data.find(
      (c) => c.kind === "DIRECT" && c.members.some((m) => !m.mine && m.civicId === focusPeer),
    );
    if (match) setView({ kind: "thread", conversationId: match.conversationId });
    onFocusConsumed();
  }, [focusPeer, list, onFocusConsumed]);

  if (view.kind === "new-group") {
    return (
      <NewGroupForm
        onCancel={() => setView({ kind: "list" })}
        onCreated={(conversationId) => {
          load();
          setView({ kind: "thread", conversationId });
        }}
      />
    );
  }

  if (view.kind === "thread") {
    const summary =
      list.status === "ok"
        ? list.data.find((c) => c.conversationId === view.conversationId)
        : undefined;
    return (
      <ThreadView
        conversationId={view.conversationId}
        summary={summary}
        onBack={() => {
          setView({ kind: "list" });
          load(); // refresh unread counts after reading
        }}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className={styles.rowActions}>
        <button
          type="button"
          className={styles.actionBtn}
          onClick={() => setView({ kind: "new-group" })}
          data-testid="new-group-btn"
        >
          New group
        </button>
      </div>
      {list.status === "loading" && <Skeletons lines={4} />}
      {list.status === "error" && (
        <ErrorBox>
          Could not load your conversations.{" "}
          <button type="button" className={styles.actionBtn} onClick={load}>
            Retry
          </button>
        </ErrorBox>
      )}
      {list.status === "ok" && list.data.length === 0 && (
        <div className="empty-state" data-testid="messages-empty">
          No conversations yet. Accept a connection — its direct line opens automatically — or start
          a group.
        </div>
      )}
      {list.status === "ok" && (
        <div className={styles.rows}>
          {list.data.map((c) => (
            <button
              key={c.conversationId}
              type="button"
              className={`${styles.row} ${styles.convoBtn}`}
              onClick={() => setView({ kind: "thread", conversationId: c.conversationId })}
              data-testid="conversation-row"
            >
              <span className={styles.rowMain}>
                <span className={styles.rowTitle}>{c.title}</span>
                <span className={styles.rowMeta}>
                  <span className={`${styles.status} ${styles.statusMuted}`}>
                    {c.kind === "GROUP" ? "Group" : "Direct"}
                  </span>
                  {c.lastMessage ? (
                    <span className={styles.metaText}>
                      {c.lastMessage.mine ? "You: " : ""}
                      {c.lastMessage.excerpt}
                    </span>
                  ) : (
                    <span className={styles.metaText}>No messages yet</span>
                  )}
                </span>
              </span>
              <span className={styles.rowActions}>
                {c.unread > 0 && (
                  <span className={`${styles.status} ${styles.unread}`} data-testid="unread-pill">
                    {c.unread} new
                  </span>
                )}
                <span className={styles.metaText}>{formatDateTime(c.lastActivityAt)}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Thread ── */

function ThreadView({
  conversationId,
  summary,
  onBack,
}: {
  conversationId: string;
  summary: ConversationSummary | undefined;
  onBack: () => void;
}) {
  const [msgs, setMsgs] = useState<Load<ThreadMessage[]>>({ status: "loading" });
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [older, setOlder] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    setMsgs({ status: "loading" });
    fetch(`/api/community/conversations/${conversationId}/messages`, {
      credentials: "same-origin",
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d: { messages: ThreadMessage[]; nextCursor: string | null }) => {
        setMsgs({ status: "ok", data: d.messages });
        setNextCursor(d.nextCursor);
      })
      .catch(() => setMsgs({ status: "error" }));
  }, [conversationId]);

  useEffect(() => {
    load();
  }, [load]);

  // Pin the scroll to the newest message on (re)load.
  useEffect(() => {
    if (msgs.status !== "ok") return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs]);

  async function loadOlder(cursor: string) {
    setOlder(true);
    try {
      const res = await fetch(
        `/api/community/conversations/${conversationId}/messages?cursor=${encodeURIComponent(cursor)}`,
        { credentials: "same-origin" },
      );
      if (!res.ok) throw new Error("failed");
      const d = (await res.json()) as { messages: ThreadMessage[]; nextCursor: string | null };
      setMsgs((m) => (m.status === "ok" ? { status: "ok", data: [...m.data, ...d.messages] } : m));
      setNextCursor(d.nextCursor);
    } catch {
      /* keep the current page; the button stays available */
    } finally {
      setOlder(false);
    }
  }

  async function send() {
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    setSendError(null);
    try {
      const res = await fetch("/api/community/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ conversationId, body }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "The message was refused.");
      setDraft("");
      load();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "The message was refused.");
    } finally {
      setBusy(false);
    }
  }

  // API returns newest-first; the thread displays oldest → newest.
  const ordered = msgs.status === "ok" ? [...msgs.data].reverse() : [];

  return (
    <div className={styles.thread} data-testid="thread-view">
      <div className={styles.threadHead}>
        <div className={styles.rowMain}>
          <h3 style={{ fontSize: 18, margin: 0 }}>{summary?.title ?? "Conversation"}</h3>
          {summary && summary.kind === "GROUP" && (
            <span className={styles.metaText}>
              {summary.members.map((m) => `${m.display} · ${m.civicId}`).join("  —  ")}
            </span>
          )}
        </div>
        <div className={styles.rowActions}>
          {summary?.kind === "GROUP" && (
            <LeaveGroupButton conversationId={conversationId} onLeft={onBack} />
          )}
          <button
            type="button"
            className={styles.actionBtn}
            onClick={onBack}
            data-testid="thread-back"
          >
            ← All conversations
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className={styles.threadScroll}
        tabIndex={0}
        role="log"
        aria-label="Messages, oldest first"
        data-testid="thread-scroll"
      >
        {nextCursor && (
          <div>
            <button
              type="button"
              className={styles.actionBtn}
              disabled={older}
              onClick={() => loadOlder(nextCursor)}
            >
              {older ? "Loading…" : "Load earlier messages"}
            </button>
          </div>
        )}
        {msgs.status === "loading" && <Skeletons lines={3} />}
        {msgs.status === "error" && (
          <ErrorBox>
            Could not load this conversation.{" "}
            <button type="button" className={styles.actionBtn} onClick={load}>
              Retry
            </button>
          </ErrorBox>
        )}
        {msgs.status === "ok" && ordered.length === 0 && (
          <div className="empty-state">No messages yet — open the record below.</div>
        )}
        {ordered.map((m) => (
          <div
            key={m.id}
            className={`${styles.bubble} ${m.sender.mine ? styles.bubbleMine : styles.bubbleTheirs}`}
            data-testid={m.sender.mine ? "bubble-mine" : "bubble-theirs"}
          >
            <span className={styles.microLabel}>
              {m.sender.mine ? "You" : `${m.sender.display} · ${m.sender.civicId}`} —{" "}
              {formatDateTime(m.at)}
            </span>
            <p className={styles.bubbleBody}>{m.body}</p>
          </div>
        ))}
      </div>

      <div aria-live="polite" className={styles.statusLine}>
        {sendError && <div className={styles.errorBox}>{sendError}</div>}
      </div>

      <div className={styles.composer}>
        <textarea
          aria-label="Message"
          className={styles.composerInput}
          value={draft}
          maxLength={2000}
          placeholder="Write a message…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          data-testid="composer-input"
        />
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || draft.trim().length === 0}
          onClick={() => void send()}
          data-testid="composer-send"
        >
          {busy ? "Sending…" : "Send"}
        </button>
      </div>
      <p className={styles.honesty}>{HONESTY_LINE}</p>
    </div>
  );
}

function LeaveGroupButton({
  conversationId,
  onLeft,
}: {
  conversationId: string;
  onLeft: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function leave() {
    setBusy(true);
    try {
      const res = await fetch("/api/community/groups/leave", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ conversationId }),
      });
      if (res.ok) onLeft();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        className={styles.actionBtn}
        onClick={() => setConfirming(true)}
        data-testid="leave-group-btn"
      >
        Leave group
      </button>
    );
  }
  return (
    <>
      <span className={styles.microLabel}>Leave this group?</span>
      <button
        type="button"
        className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
        disabled={busy}
        onClick={() => void leave()}
        data-testid="leave-group-confirm"
      >
        {busy ? "Leaving…" : "Confirm"}
      </button>
      <button
        type="button"
        className={styles.actionBtn}
        disabled={busy}
        onClick={() => setConfirming(false)}
      >
        Cancel
      </button>
    </>
  );
}

/* ── New group ── */

function NewGroupForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (conversationId: string) => void;
}) {
  const [connections, setConnections] = useState<Load<AcceptedConnection[]>>({
    status: "loading",
  });
  const [title, setTitle] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/community/connections", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d: ConnectionsPayload) => setConnections({ status: "ok", data: d.accepted }))
      .catch(() => setConnections({ status: "error" }));
  }, []);

  const titleError =
    title.trim().length < 2
      ? "Give the group a title (at least 2 characters)."
      : title.trim().length > 60
        ? "The title cannot exceed 60 characters."
        : null;
  const membersError = picked.size === 0 ? "Pick at least one connection." : null;

  function toggle(civicId: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(civicId)) next.delete(civicId);
      else next.add(civicId);
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (titleError || membersError) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/community/groups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ title: title.trim(), memberCivicIds: [...picked] }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        conversation?: { conversationId: string };
      };
      if (!res.ok || !data.conversation) throw new Error(data.error ?? "The filing was refused.");
      onCreated(data.conversation.conversationId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The filing was refused.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className={styles.form} noValidate data-testid="new-group-form">
      <div>
        <h3 style={{ fontSize: 18, margin: 0 }}>New group</h3>
        <p className={styles.hint} style={{ marginTop: 6 }}>
          A group starts with citizens from your accepted connections. You can add more later.
        </p>
      </div>

      <div className={styles.field}>
        <label htmlFor="group-title" className={styles.microLabel}>
          Group title (2–60 characters)
        </label>
        <input
          id="group-title"
          className={styles.input}
          value={title}
          maxLength={60}
          onChange={(e) => setTitle(e.target.value)}
          aria-invalid={Boolean(touched && titleError)}
          aria-describedby="group-title-error"
          data-testid="group-title-input"
        />
        <div id="group-title-error" aria-live="polite">
          {touched && titleError && <p className={styles.fieldError}>{titleError}</p>}
        </div>
      </div>

      <fieldset className={styles.field} style={{ border: "none", padding: 0, margin: 0 }}>
        <legend className={styles.microLabel}>Members — your accepted connections</legend>
        {connections.status === "loading" && <Skeletons lines={2} />}
        {connections.status === "error" && <ErrorBox>Could not load your connections.</ErrorBox>}
        {connections.status === "ok" && connections.data.length === 0 && (
          <div className="empty-state">
            You have no accepted connections yet — add a citizen first.
          </div>
        )}
        {connections.status === "ok" && connections.data.length > 0 && (
          <div className={styles.checkList} style={{ marginTop: 6 }}>
            {connections.data.map((c) => (
              <label key={c.connectionId} className={styles.checkItem}>
                <input
                  type="checkbox"
                  checked={picked.has(c.peer.civicId)}
                  onChange={() => toggle(c.peer.civicId)}
                  data-testid={`group-member-${c.peer.civicId}`}
                />
                <span>
                  {c.peer.display} <span className={styles.mono}>· {c.peer.civicId}</span>
                </span>
                <KindPill kind={c.kind} />
              </label>
            ))}
          </div>
        )}
        <div aria-live="polite">
          {touched && membersError && <p className={styles.fieldError}>{membersError}</p>}
        </div>
      </fieldset>

      <div aria-live="polite" className={styles.statusLine}>
        {error && <div className={styles.errorBox}>{error}</div>}
      </div>

      <div className={styles.rowActions}>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={busy}
          data-testid="group-create-submit"
        >
          {busy ? "Creating…" : "Create group"}
        </button>
        <button type="button" className={styles.actionBtn} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
