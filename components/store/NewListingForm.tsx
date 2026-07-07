"use client";
import { useState } from "react";
import Link from "next/link";
import { STORE_CATEGORIES } from "@/lib/services/types";
import { PRICE_COIN_REGEX } from "@/lib/validation/store";
import { formatCoin, categoryLabel, formatDate } from "@/lib/store/format";
import { ListingStatusPill, SETTLEMENT_NOTICE, type ListingSummary } from "./bits";
import styles from "./store.module.css";

/**
 * File a new listing (Wave 15 store). Live client-side validation MIRRORS
 * lib/validation/store.ts exactly (title 4..80, description 20..2000,
 * category union, price decimal string 0 < p <= 10,000,000 with <= 2 dp) —
 * the server re-validates regardless. Success renders a filing receipt for
 * the new listing. Pricing is intent only; the Republic never holds funds.
 */

function validateTitle(v: string): string | null {
  const t = v.trim();
  if (t.length < 4) return "Title must be at least 4 characters.";
  if (t.length > 80) return "Title cannot exceed 80 characters.";
  return null;
}
function validateDescription(v: string): string | null {
  const t = v.trim();
  if (t.length < 20) return "Description must be at least 20 characters.";
  if (t.length > 2000) return "Description cannot exceed 2000 characters.";
  return null;
}
function validatePrice(v: string): string | null {
  if (!PRICE_COIN_REGEX.test(v)) {
    return "Enter a decimal amount with at most 2 decimal places, e.g. 128.00.";
  }
  if (Number(v) <= 0) return "Price must be greater than zero.";
  if (Number(v) > 10_000_000) return "Price cannot exceed 10,000,000 $CRYPT.";
  return null;
}

export function NewListingForm() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("GOODS");
  const [price, setPrice] = useState("");
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filed, setFiled] = useState<ListingSummary | null>(null);

  const errors = {
    title: validateTitle(title),
    description: validateDescription(description),
    price: validatePrice(price),
  };
  const valid = !errors.title && !errors.description && !errors.price;

  function touch(name: string) {
    setTouched((t) => ({ ...t, [name]: true }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ title: true, description: true, price: true });
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/store/listings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          category,
          priceCoin: price,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        listing?: ListingSummary;
      };
      if (!res.ok || !data.listing) throw new Error(data.error ?? "The filing was refused.");
      setFiled(data.listing);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The filing was refused.");
    } finally {
      setBusy(false);
    }
  }

  if (filed) {
    return (
      <div className={styles.receipt} data-testid="filing-receipt">
        <div>
          <span className={styles.microLabel} style={{ color: "var(--success)" }}>
            Filing accepted
          </span>
          <h2 style={{ marginTop: 8 }}>Listing entered on the Registry</h2>
        </div>
        <div className={styles.receiptGrid}>
          <div>
            <span className={styles.microLabel}>Registry reference</span>
            <div className={`${styles.receiptValue} ${styles.receiptSerial}`}>{filed.id}</div>
          </div>
          <div>
            <span className={styles.microLabel}>Title</span>
            <div className={styles.receiptValue}>{filed.title}</div>
          </div>
          <div>
            <span className={styles.microLabel}>Asking price</span>
            <div className={`${styles.receiptValue} ${styles.receiptSerial}`}>
              {formatCoin(filed.priceCoin)}
            </div>
          </div>
          <div>
            <span className={styles.microLabel}>Category</span>
            <div className={styles.receiptValue}>{categoryLabel(filed.category)}</div>
          </div>
          <div>
            <span className={styles.microLabel}>Status</span>
            <div className={styles.receiptValue}>
              <ListingStatusPill status={filed.status} />
            </div>
          </div>
          <div>
            <span className={styles.microLabel}>Filed</span>
            <div className={styles.receiptValue}>{formatDate(filed.createdAt)}</div>
          </div>
        </div>
        <p className={styles.hint}>{SETTLEMENT_NOTICE}</p>
        <div className={styles.receiptActions}>
          <Link href={`/dashboard/store/${filed.id}`} className="btn btn-primary">
            View the listing
          </Link>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setFiled(null);
              setTitle("");
              setDescription("");
              setCategory("GOODS");
              setPrice("");
              setTouched({});
            }}
          >
            File another
          </button>
          <Link href="/dashboard/store" className="btn btn-ghost">
            Back to the store
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className={styles.form} noValidate data-testid="new-listing-form">
      <div className={styles.field}>
        <label htmlFor="listing-title" className={styles.microLabel}>
          Title (4–80 characters)
        </label>
        <input
          id="listing-title"
          className={styles.input}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => touch("title")}
          maxLength={80}
          aria-invalid={Boolean(touched.title && errors.title)}
          aria-describedby="listing-title-error"
          data-testid="title-input"
        />
        <div id="listing-title-error" aria-live="polite">
          {touched.title && errors.title && <p className={styles.fieldError}>{errors.title}</p>}
        </div>
      </div>

      <div className={styles.field}>
        <label htmlFor="listing-description" className={styles.microLabel}>
          Description (20–2000 characters)
        </label>
        <textarea
          id="listing-description"
          className={styles.textarea}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => touch("description")}
          maxLength={2000}
          aria-invalid={Boolean(touched.description && errors.description)}
          aria-describedby="listing-description-error"
          data-testid="description-input"
        />
        <p className={styles.hint}>{description.trim().length}/2000</p>
        <div id="listing-description-error" aria-live="polite">
          {touched.description && errors.description && (
            <p className={styles.fieldError}>{errors.description}</p>
          )}
        </div>
      </div>

      <div className={styles.field}>
        <label htmlFor="listing-category" className={styles.microLabel}>
          Category
        </label>
        <select
          id="listing-category"
          className={styles.select}
          style={{ maxWidth: 260 }}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          data-testid="category-select"
        >
          {STORE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {categoryLabel(c)}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label htmlFor="listing-price" className={styles.microLabel}>
          Asking price
        </label>
        <div className={styles.priceWrap}>
          <input
            id="listing-price"
            className={styles.input}
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            onBlur={() => touch("price")}
            placeholder="128.00"
            aria-invalid={Boolean(touched.price && errors.price)}
            aria-describedby="listing-price-error listing-price-hint"
            data-testid="price-input"
          />
          <span className={styles.priceSuffix} aria-hidden="true">
            $CRYPT
          </span>
        </div>
        <p id="listing-price-hint" className={styles.hint}>
          Up to 10,000,000 $CRYPT, at most 2 decimal places. {SETTLEMENT_NOTICE}
        </p>
        <div id="listing-price-error" aria-live="polite">
          {touched.price && errors.price && <p className={styles.fieldError}>{errors.price}</p>}
        </div>
      </div>

      <div aria-live="polite">
        {error && (
          <div className={styles.errorBox} role="alert">
            {error}
          </div>
        )}
      </div>

      <div>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={busy || (Object.keys(touched).length > 0 && !valid)}
          data-testid="filing-submit"
        >
          {busy ? "Filing…" : "File the listing"}
        </button>
      </div>
    </form>
  );
}
