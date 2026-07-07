"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { STORE_CATEGORIES } from "@/lib/services/types";
import { formatCoin, categoryLabel, formatDate } from "@/lib/store/format";
import {
  ErrorBox,
  InquiryStatusPill,
  ListingStatusPill,
  Skeletons,
  SETTLEMENT_NOTICE,
  type ListingSummary,
} from "./bits";
import styles from "./store.module.css";

/**
 * Citizen Store (Wave 15) client island — three registers under one seal:
 * BROWSE (public ACTIVE listings with category chips + title search + cursor
 * paging), MY LISTINGS (the seller's ledger incl. WITHDRAWN/SOLD with the
 * state-machine actions; withdraw asks for confirmation), and MY INQUIRIES
 * (listings I asked about + the sellers' replies). No payment ever moves
 * through the Republic — pricing is intent, settlement is peer-to-peer.
 */

type Tab = "browse" | "mine" | "inquiries";
type Load<T> = { status: "loading" } | { status: "ok"; data: T } | { status: "error" };

interface BrowsePage {
  listings: ListingSummary[];
  nextCursor: string | null;
}
interface MyInquiryRow {
  id: string;
  message: string;
  reply: string | null;
  status: string;
  createdAt: string;
  listing: {
    id: string;
    title: string;
    priceCoin: string;
    status: string;
    sellerDisplay: string;
  };
}

export function StoreApp() {
  const [tab, setTab] = useState<Tab>("browse");
  return (
    <div className={`wrap ${styles.page}`}>
      <div>
        <div className="kicker">CITIZEN STORE</div>
        <h2 style={{ fontSize: 32, marginTop: 10 }}>The citizen store</h2>
        <p className={styles.lede}>
          Citizens trade with citizens. Listings are filed with the Registry as pricing intent only.{" "}
          {SETTLEMENT_NOTICE}
        </p>
      </div>

      <div className={styles.tabs} role="tablist" aria-label="Store sections">
        {(
          [
            ["browse", "Browse"],
            ["mine", "My listings"],
            ["inquiries", "My inquiries"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`store-tab-${key}`}
            aria-selected={tab === key}
            aria-controls={tab === key ? `store-panel-${key}` : undefined}
            tabIndex={tab === key ? 0 : -1}
            className={`${styles.tab} ${tab === key ? styles.tabActive : ""}`}
            onClick={() => setTab(key)}
            onKeyDown={(e) => {
              const order = ["browse", "mine", "inquiries"] as const;
              const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
              if (!dir) return;
              e.preventDefault();
              const next = order[(order.indexOf(tab) + dir + order.length) % order.length];
              setTab(next);
              document.getElementById(`store-tab-${next}`)?.focus();
            }}
            data-testid={`store-tab-${key}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`store-panel-${tab}`} aria-labelledby={`store-tab-${tab}`}>
        {tab === "browse" && <BrowsePanel />}
        {tab === "mine" && <MyListingsPanel />}
        {tab === "inquiries" && <MyInquiriesPanel />}
      </div>
    </div>
  );
}

/* ── BROWSE ── */

function BrowsePanel() {
  const [category, setCategory] = useState<string | null>(null);
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState<Load<BrowsePage>>({ status: "loading" });
  const [more, setMore] = useState<{ items: ListingSummary[]; busy: boolean }>({
    items: [],
    busy: false,
  });

  const load = useCallback(() => {
    setPage({ status: "loading" });
    setMore({ items: [], busy: false });
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (q) params.set("q", q);
    fetch(`/api/store/listings?${params.toString()}`, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d: BrowsePage) => setPage({ status: "ok", data: d }))
      .catch(() => setPage({ status: "error" }));
  }, [category, q]);

  useEffect(() => {
    load();
  }, [load]);

  async function loadMore(cursor: string) {
    setMore((m) => ({ ...m, busy: true }));
    try {
      const params = new URLSearchParams();
      if (category) params.set("category", category);
      if (q) params.set("q", q);
      params.set("cursor", cursor);
      const res = await fetch(`/api/store/listings?${params.toString()}`, {
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error("failed");
      const d = (await res.json()) as BrowsePage;
      setMore((m) => ({ items: [...m.items, ...d.listings], busy: false }));
      setPage((p) =>
        p.status === "ok" ? { status: "ok", data: { ...p.data, nextCursor: d.nextCursor } } : p,
      );
    } catch {
      setMore((m) => ({ ...m, busy: false }));
    }
  }

  const listings = page.status === "ok" ? [...page.data.listings, ...more.items] : [];
  const nextCursor = page.status === "ok" ? page.data.nextCursor : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div className={styles.controls}>
        <div className={styles.chips} role="group" aria-label="Filter by category">
          <button
            type="button"
            className={`${styles.chip} ${category === null ? styles.chipActive : ""}`}
            aria-pressed={category === null}
            onClick={() => setCategory(null)}
          >
            All
          </button>
          {STORE_CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              className={`${styles.chip} ${category === c ? styles.chipActive : ""}`}
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
              data-testid={`store-chip-${c}`}
            >
              {categoryLabel(c)}
            </button>
          ))}
        </div>
        <form
          className={styles.searchForm}
          onSubmit={(e) => {
            e.preventDefault();
            setQ(qInput.trim());
          }}
        >
          <label htmlFor="store-search" className={styles.microLabel}>
            Search titles
          </label>
          <input
            id="store-search"
            type="search"
            className={styles.searchInput}
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="e.g. flag"
            data-testid="store-search"
          />
          <button type="submit" className={styles.actionBtn}>
            Search
          </button>
        </form>
        <Link href="/dashboard/store/new" className="btn btn-primary" data-testid="store-new-link">
          File a listing
        </Link>
      </div>

      <div>
        {page.status === "loading" && <Skeletons lines={4} />}
        {page.status === "error" && (
          <ErrorBox>
            Could not load the storefront.{" "}
            <button type="button" className={styles.actionBtn} onClick={load}>
              Retry
            </button>
          </ErrorBox>
        )}
        {page.status === "ok" && listings.length === 0 && (
          <div className="empty-state" data-testid="store-empty">
            No listings under this seal yet.
          </div>
        )}
        {page.status === "ok" && listings.length > 0 && (
          <div className={styles.grid} data-testid="store-grid">
            {listings.map((l) => (
              <Link key={l.id} href={`/dashboard/store/${l.id}`} className={styles.card}>
                <span className={styles.categoryTag}>{categoryLabel(l.category)}</span>
                <h2 className={styles.cardTitle} style={{ textTransform: "none" }}>
                  {l.title}
                </h2>
                <div className={styles.price}>{formatCoin(l.priceCoin)}</div>
                <div className={styles.cardMeta}>
                  <span className={styles.metaText}>{l.sellerDisplay}</span>
                  <span className={styles.metaText}>Posted {formatDate(l.createdAt)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {nextCursor && (
        <div>
          <button
            type="button"
            className={styles.actionBtn}
            disabled={more.busy}
            onClick={() => loadMore(nextCursor)}
            data-testid="store-load-more"
          >
            {more.busy ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}

/* ── MY LISTINGS ── */

function MyListingsPanel() {
  const [state, setState] = useState<Load<ListingSummary[]>>({ status: "loading" });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setState({ status: "loading" });
    fetch("/api/store/listings?mine=1", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d: { listings: ListingSummary[] }) => setState({ status: "ok", data: d.listings }))
      .catch(() => setState({ status: "error" }));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {error && <ErrorBox>{error}</ErrorBox>}
      {state.status === "loading" && <Skeletons lines={4} />}
      {state.status === "error" && (
        <ErrorBox>
          Could not load your listings.{" "}
          <button type="button" className={styles.actionBtn} onClick={load}>
            Retry
          </button>
        </ErrorBox>
      )}
      {state.status === "ok" && state.data.length === 0 && (
        <div className="empty-state">
          You have filed no listings yet.{" "}
          <Link href="/dashboard/store/new" style={{ color: "var(--blue)", fontWeight: 700 }}>
            File your first listing.
          </Link>
        </div>
      )}
      {state.status === "ok" &&
        state.data.map((l) => (
          <MyListingRow key={l.id} listing={l} onChanged={load} onError={setError} />
        ))}
    </div>
  );
}

function MyListingRow({
  listing,
  onChanged,
  onError,
}: {
  listing: ListingSummary;
  onChanged: () => void;
  onError: (msg: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);

  async function act(action: "withdraw" | "mark-sold" | "relist") {
    setBusy(true);
    onError(null);
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
      onError(err instanceof Error ? err.message : "The action was refused.");
    } finally {
      setBusy(false);
      setConfirmWithdraw(false);
    }
  }

  return (
    <div className={styles.row} data-testid="my-listing-row">
      <div className={styles.rowMain}>
        <Link href={`/dashboard/store/${listing.id}`} className={styles.rowTitle}>
          {listing.title}
        </Link>
        <div className={styles.cardMeta}>
          <span className={styles.price}>{formatCoin(listing.priceCoin)}</span>
          <span className={styles.categoryTag}>{categoryLabel(listing.category)}</span>
          <span className={styles.metaText}>Posted {formatDate(listing.createdAt)}</span>
          {typeof listing.openInquiries === "number" && listing.openInquiries > 0 && (
            <span className={styles.metaText}>
              {listing.openInquiries} open {listing.openInquiries === 1 ? "inquiry" : "inquiries"}
            </span>
          )}
        </div>
      </div>
      <div className={styles.rowActions}>
        <ListingStatusPill status={listing.status} />
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
      </div>
    </div>
  );
}

/* ── MY INQUIRIES ── */

function MyInquiriesPanel() {
  const [state, setState] = useState<Load<MyInquiryRow[]>>({ status: "loading" });

  const load = useCallback(() => {
    setState({ status: "loading" });
    fetch("/api/store/inquiries", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d: { inquiries: MyInquiryRow[] }) => setState({ status: "ok", data: d.inquiries }))
      .catch(() => setState({ status: "error" }));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {state.status === "loading" && <Skeletons lines={4} />}
      {state.status === "error" && (
        <ErrorBox>
          Could not load your inquiries.{" "}
          <button type="button" className={styles.actionBtn} onClick={load}>
            Retry
          </button>
        </ErrorBox>
      )}
      {state.status === "ok" && state.data.length === 0 && (
        <div className="empty-state">You have not inquired on any listing yet.</div>
      )}
      {state.status === "ok" &&
        state.data.map((i) => (
          <div key={i.id} className={styles.inquiry} data-testid="my-inquiry-row">
            <div className={styles.cardMeta} style={{ marginTop: 0 }}>
              <Link href={`/dashboard/store/${i.listing.id}`} className={styles.rowTitle}>
                {i.listing.title}
              </Link>
              <span className={styles.price}>{formatCoin(i.listing.priceCoin)}</span>
              <span className={styles.metaText}>{i.listing.sellerDisplay}</span>
              <ListingStatusPill status={i.listing.status} />
              <InquiryStatusPill status={i.status} />
            </div>
            <div>
              <span className={styles.microLabel}>Your inquiry — {formatDate(i.createdAt)}</span>
              <p className={styles.inquiryMsg}>{i.message}</p>
            </div>
            {i.reply ? (
              <div className={styles.replyBlock}>
                <span className={styles.microLabel}>Seller&apos;s reply</span>
                <p className={styles.inquiryMsg}>{i.reply}</p>
              </div>
            ) : (
              <span className={styles.hint}>Awaiting the seller&apos;s reply.</span>
            )}
          </div>
        ))}
    </div>
  );
}
