"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatCoin, categoryLabel, formatDate } from "@/lib/store/format";
import {
  ErrorBox,
  InquiryStatusPill,
  ListingStatusPill,
  Skeletons,
  SETTLEMENT_NOTICE,
} from "./bits";
import styles from "./store.module.css";

/**
 * Listing detail (Wave 15 store). The API is role-aware: a BUYER receives
 * only their own inquiry (+ the seller's reply) and an inquiry form while
 * the listing is ACTIVE; the SELLER receives the full inquiry thread with a
 * reply form per inquiry plus the Withdraw (confirmed) / Mark sold / Relist
 * state actions. The price panel always carries the settlement notice — the
 * Republic never holds or moves funds.
 */

interface InquiryRow {
  id: string;
  message: string;
  reply: string | null;
  status: string;
  createdAt: string;
  buyerDisplay?: string;
}
interface DetailPayload {
  listing: {
    id: string;
    title: string;
    description: string;
    category: string;
    priceCoin: string;
    status: string;
    createdAt: string;
    sellerDisplay: string;
  };
  viewerIsSeller: boolean;
  inquiries: InquiryRow[] | null;
  myInquiry: InquiryRow | null;
}
type Load<T> = { status: "loading" } | { status: "ok"; data: T } | { status: "error" | "notfound" };

export function ListingDetail({ id }: { id: string }) {
  const [state, setState] = useState<Load<DetailPayload>>({ status: "loading" });

  const load = useCallback(() => {
    setState({ status: "loading" });
    fetch(`/api/store/listings/${id}`, { credentials: "same-origin" })
      .then(async (r) => {
        if (r.status === 404) {
          setState({ status: "notfound" });
          return;
        }
        if (!r.ok) throw new Error("failed");
        setState({ status: "ok", data: (await r.json()) as DetailPayload });
      })
      .catch(() => setState({ status: "error" }));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className={`wrap ${styles.page}`}>
      <div>
        <Link href="/dashboard/store" className={styles.microLabel} data-testid="back-to-store">
          ← Citizen store
        </Link>
      </div>
      <div aria-live="polite">
        {state.status === "loading" && <Skeletons lines={6} />}
        {state.status === "error" && (
          <ErrorBox>
            Could not load this listing.{" "}
            <button type="button" className={styles.actionBtn} onClick={load}>
              Retry
            </button>
          </ErrorBox>
        )}
        {state.status === "notfound" && (
          <div className={styles.emptyState} data-testid="listing-notfound">
            This listing is not on the Registry.
          </div>
        )}
        {state.status === "ok" && <Detail payload={state.data} onChanged={load} />}
      </div>
    </div>
  );
}

function Detail({ payload, onChanged }: { payload: DetailPayload; onChanged: () => void }) {
  const { listing, viewerIsSeller } = payload;
  return (
    <div className={styles.detailLayout}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
        <article className={styles.panel}>
          <div className={styles.cardMeta} style={{ marginTop: 0 }}>
            <span className={styles.categoryTag}>{categoryLabel(listing.category)}</span>
            <ListingStatusPill status={listing.status} />
            <span className={styles.metaText}>Posted {formatDate(listing.createdAt)}</span>
          </div>
          <h1 style={{ marginTop: 14 }} data-testid="listing-title">
            {listing.title}
          </h1>
          <p className={styles.description} data-testid="listing-description">
            {listing.description}
          </p>
        </article>

        {viewerIsSeller ? (
          <SellerThread payload={payload} onChanged={onChanged} />
        ) : (
          <BuyerInquiry payload={payload} onChanged={onChanged} />
        )}
      </div>

      <aside className={styles.aside}>
        <article className={`${styles.panel} ${styles.panelTight}`}>
          <span className={styles.microLabel}>Asking price</span>
          <div className={styles.priceLg} data-testid="listing-price">
            {formatCoin(listing.priceCoin)}
          </div>
          <div className={styles.settlementNote} data-testid="settlement-note">
            <span className={styles.microLabel} style={{ color: "var(--ink)" }}>
              Settlement
            </span>
            <p style={{ margin: "6px 0 0" }}>{SETTLEMENT_NOTICE}</p>
          </div>
        </article>
        <article className={`${styles.panel} ${styles.panelTight}`}>
          <span className={styles.microLabel}>Seller of record</span>
          <div className={styles.receiptValue} data-testid="listing-seller">
            {listing.sellerDisplay}
          </div>
          <p className={styles.hint} style={{ marginTop: 8 }}>
            Sellers are identified by their passport number once their citizenship is sealed.
          </p>
        </article>
        {viewerIsSeller && <SellerActions payload={payload} onChanged={onChanged} />}
      </aside>
    </div>
  );
}

/* ── Seller: state actions ── */

function SellerActions({ payload, onChanged }: { payload: DetailPayload; onChanged: () => void }) {
  const { listing } = payload;
  const [busy, setBusy] = useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "withdraw" | "mark-sold" | "relist") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/store/listings/${listing.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "The action was refused.");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The action was refused.");
    } finally {
      setBusy(false);
      setConfirmWithdraw(false);
    }
  }

  return (
    <article className={`${styles.panel} ${styles.panelTight}`} data-testid="seller-actions">
      <span className={styles.microLabel}>Seller actions</span>
      <div className={styles.rowActions} style={{ marginTop: 10 }}>
        {listing.status === "ACTIVE" && !confirmWithdraw && (
          <>
            <button
              type="button"
              className={styles.actionBtn}
              disabled={busy}
              onClick={() => setConfirmWithdraw(true)}
              data-testid="withdraw-btn"
            >
              Withdraw
            </button>
            <button
              type="button"
              className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
              disabled={busy}
              onClick={() => act("mark-sold")}
              data-testid="mark-sold-btn"
            >
              Mark sold
            </button>
          </>
        )}
        {listing.status === "ACTIVE" && confirmWithdraw && (
          <>
            <span className={styles.microLabel}>Withdraw this listing?</span>
            <button
              type="button"
              className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
              disabled={busy}
              onClick={() => act("withdraw")}
              data-testid="withdraw-confirm-btn"
            >
              {busy ? "Withdrawing…" : "Confirm withdrawal"}
            </button>
            <button
              type="button"
              className={styles.actionBtn}
              disabled={busy}
              onClick={() => setConfirmWithdraw(false)}
            >
              Cancel
            </button>
          </>
        )}
        {listing.status === "WITHDRAWN" && (
          <button
            type="button"
            className={styles.actionBtn}
            disabled={busy}
            onClick={() => act("relist")}
            data-testid="relist-btn"
          >
            {busy ? "Relisting…" : "Relist"}
          </button>
        )}
        {listing.status === "SOLD" && (
          <p className={styles.hint} style={{ margin: 0 }}>
            This listing is closed as sold.
          </p>
        )}
      </div>
      <div aria-live="polite">{error && <p className={styles.fieldError}>{error}</p>}</div>
    </article>
  );
}

/* ── Seller: inquiry thread with reply forms ── */

function SellerThread({ payload, onChanged }: { payload: DetailPayload; onChanged: () => void }) {
  const inquiries = payload.inquiries ?? [];
  return (
    <article className={styles.panel} data-testid="seller-thread">
      <span className={styles.microLabel}>Inquiries — {inquiries.length}</span>
      {inquiries.length === 0 ? (
        <p className={styles.hint} style={{ marginTop: 10 }}>
          No citizen has inquired yet.
        </p>
      ) : (
        <div className={styles.thread} style={{ marginTop: 14 }}>
          {inquiries.map((i) => (
            <SellerInquiry key={i.id} inquiry={i} onChanged={onChanged} />
          ))}
        </div>
      )}
    </article>
  );
}

function SellerInquiry({ inquiry, onChanged }: { inquiry: InquiryRow; onChanged: () => void }) {
  const [reply, setReply] = useState(inquiry.reply ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/store/inquiries/${inquiry.id}/reply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ reply: reply.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not file the reply.");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not file the reply.");
    } finally {
      setBusy(false);
    }
  }

  const trimmed = reply.trim();
  return (
    <div className={styles.inquiry} data-testid="seller-inquiry">
      <div className={styles.cardMeta} style={{ marginTop: 0 }}>
        <span className={styles.metaText}>{inquiry.buyerDisplay ?? "Applicant"}</span>
        <span className={styles.metaText}>{formatDate(inquiry.createdAt)}</span>
        <InquiryStatusPill status={inquiry.status} />
      </div>
      <p className={styles.inquiryMsg}>{inquiry.message}</p>
      {inquiry.reply && (
        <div className={styles.replyBlock}>
          <span className={styles.microLabel}>Your reply</span>
          <p className={styles.inquiryMsg}>{inquiry.reply}</p>
        </div>
      )}
      <form onSubmit={submit} className={styles.field}>
        <label htmlFor={`reply-${inquiry.id}`} className={styles.microLabel}>
          {inquiry.reply ? "Amend your reply" : "Reply to this inquiry"}
        </label>
        <textarea
          id={`reply-${inquiry.id}`}
          className={styles.textarea}
          style={{ minHeight: 80 }}
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          maxLength={1000}
          data-testid="reply-input"
        />
        <div aria-live="polite">{error && <p className={styles.fieldError}>{error}</p>}</div>
        <div>
          <button
            type="submit"
            className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
            disabled={busy || trimmed.length === 0 || trimmed.length > 1000}
            data-testid="reply-submit"
          >
            {busy ? "Filing…" : inquiry.reply ? "Amend reply" : "Send reply"}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ── Buyer: own inquiry + form ── */

function BuyerInquiry({ payload, onChanged }: { payload: DetailPayload; onChanged: () => void }) {
  const { listing, myInquiry } = payload;
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/store/listings/${listing.id}/inquiries`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ message: message.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not file the inquiry.");
      setMessage("");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not file the inquiry.");
    } finally {
      setBusy(false);
    }
  }

  const trimmed = message.trim();
  return (
    <article className={styles.panel} data-testid="buyer-inquiry">
      <span className={styles.microLabel}>Your inquiry</span>

      {myInquiry ? (
        <div className={styles.inquiry} style={{ marginTop: 14 }}>
          <div className={styles.cardMeta} style={{ marginTop: 0 }}>
            <span className={styles.metaText}>{formatDate(myInquiry.createdAt)}</span>
            <InquiryStatusPill status={myInquiry.status} />
          </div>
          <p className={styles.inquiryMsg} data-testid="my-inquiry-message">
            {myInquiry.message}
          </p>
          {myInquiry.reply ? (
            <div className={styles.replyBlock}>
              <span className={styles.microLabel}>Seller&apos;s reply</span>
              <p className={styles.inquiryMsg} data-testid="my-inquiry-reply">
                {myInquiry.reply}
              </p>
            </div>
          ) : (
            <span className={styles.hint}>Awaiting the seller&apos;s reply.</span>
          )}
        </div>
      ) : listing.status === "ACTIVE" ? (
        <form onSubmit={submit} className={styles.field} style={{ marginTop: 14 }}>
          <label htmlFor="inquiry-message" className={styles.microLabel}>
            Message to the seller (4–1000 characters)
          </label>
          <textarea
            id="inquiry-message"
            className={styles.textarea}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={1000}
            placeholder="Ask about condition, handover, or settlement terms."
            data-testid="inquiry-input"
          />
          <div aria-live="polite">{error && <p className={styles.fieldError}>{error}</p>}</div>
          <div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={busy || trimmed.length < 4 || trimmed.length > 1000}
              data-testid="inquiry-submit"
            >
              {busy ? "Filing…" : "Send inquiry"}
            </button>
          </div>
        </form>
      ) : (
        <p className={styles.hint} style={{ marginTop: 10 }}>
          This listing is no longer active; new inquiries are closed.
        </p>
      )}
    </article>
  );
}
