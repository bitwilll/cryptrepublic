"use client";
import { useCallback, useEffect, useState } from "react";
import { Skeleton, CardError, Field, inputStyle, type Load } from "./bits";

/**
 * Feature-flag admin (Wave 9 C3). GET /api/admin/flags returns the DB rows AND
 * the declared defaults, so the ledger shows EFFECTIVE values with their
 * source: a DB row wins; a missing row falls back to its declared default;
 * undeclared keys are OFF. Toggle = POST upsert; DELETE removes the row (the
 * consumer falls back to the declared default). Every mutation is audit-logged
 * by the API.
 */

interface FlagRowDb {
  key: string;
  enabled: boolean;
  description: string | null;
  updatedAt: string;
}

interface FlagView extends Record<string, unknown> {
  key: string;
  effective: boolean;
  source: "DB row" | "declared default";
  description: string | null;
  hasRow: boolean;
}

interface FlagsPayload {
  flags: FlagRowDb[];
  defaults: Record<string, boolean>;
}

export function FlagsApp() {
  const [state, setState] = useState<Load<FlagView[]>>({ status: "loading" });
  const [mutError, setMutError] = useState<string | null>(null);
  const [newKey, setNewKey] = useState("");
  const [newEnabled, setNewEnabled] = useState(false);
  const [newDescription, setNewDescription] = useState("");

  const load = useCallback(() => {
    setState({ status: "loading" });
    fetch("/api/admin/flags")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d: FlagsPayload) => {
        const rowsByKey = new Map(d.flags.map((f) => [f.key, f]));
        const keys = [...new Set([...Object.keys(d.defaults), ...rowsByKey.keys()])].sort();
        const views: FlagView[] = keys.map((key) => {
          const row = rowsByKey.get(key);
          return {
            key,
            effective: row ? row.enabled : (d.defaults[key] ?? false),
            source: row ? "DB row" : "declared default",
            description: row?.description ?? null,
            hasRow: row !== undefined,
          };
        });
        setState({ status: "ok", data: views });
      })
      .catch(() => setState({ status: "error" }));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function mutate(url: string, method: "POST" | "DELETE", body?: unknown): Promise<void> {
    setMutError(null);
    try {
      const res = await fetch(url, {
        method,
        ...(body !== undefined
          ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
          : {}),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setMutError(d.error ?? "The request failed.");
        return;
      }
      load();
    } catch {
      setMutError("The request failed.");
    }
  }

  return (
    <div
      className="wrap"
      style={{ padding: "32px 0", display: "flex", flexDirection: "column", gap: 24 }}
    >
      <div className="kicker">FEATURE FLAGS</div>

      <article className="pillar" style={{ padding: "24px 28px" }}>
        <h3 style={{ margin: 0, fontSize: 20 }}>Flags</h3>
        <p style={{ color: "var(--muted)", marginTop: 6, fontSize: 12 }}>
          Missing flags fall back to their declared defaults; undeclared keys are OFF. Deleting a
          row restores the declared default.
        </p>
        {mutError && (
          <p data-testid="flag-mutation-error" style={{ color: "#b04141", fontSize: 13 }}>
            {mutError}
          </p>
        )}
        {state.status === "loading" && <Skeleton lines={3} />}
        {state.status === "error" && <CardError onRetry={load} testid="flags-error" />}
        {state.status === "ok" && (
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column" }}>
            {state.data.length === 0 && (
              <p style={{ color: "var(--muted)", fontSize: 13 }}>No flags declared or stored.</p>
            )}
            {state.data.map((r) => (
              <div
                key={r.key}
                data-testid={`flag-row-${r.key}`}
                data-grid="row"
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 70px 150px 1fr auto",
                  gap: 12,
                  alignItems: "center",
                  padding: "10px 0",
                  borderTop: "1px solid var(--line)",
                  fontSize: 13,
                }}
              >
                <span style={{ fontFamily: "var(--mono)", overflowWrap: "anywhere" }}>{r.key}</span>
                <b style={{ fontFamily: "var(--mono)" }}>{r.effective ? "ON" : "OFF"}</b>
                <span style={{ color: "var(--muted)" }}>{r.source}</span>
                <span style={{ color: "var(--muted)" }}>{r.description ?? "—"}</span>
                <span style={{ display: "inline-flex", gap: 8, justifyContent: "flex-end" }}>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    aria-label={`Turn ${r.effective ? "off" : "on"} ${r.key}`}
                    style={{ padding: "6px 14px", fontSize: 12 }}
                    onClick={() =>
                      void mutate("/api/admin/flags", "POST", {
                        key: r.key,
                        enabled: !r.effective,
                        ...(r.description ? { description: r.description } : {}),
                      })
                    }
                  >
                    Turn {r.effective ? "off" : "on"}
                  </button>
                  {r.hasRow && (
                    <button
                      className="btn btn-ghost"
                      type="button"
                      aria-label={`Delete ${r.key}`}
                      style={{ padding: "6px 14px", fontSize: 12 }}
                      onClick={() =>
                        void mutate(`/api/admin/flags/${encodeURIComponent(r.key)}`, "DELETE")
                      }
                    >
                      Delete
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </article>

      <article className="pillar" style={{ padding: "24px 28px" }}>
        <h3 style={{ margin: 0, fontSize: 20 }}>Create or override a flag</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void mutate("/api/admin/flags", "POST", {
              key: newKey.trim(),
              enabled: newEnabled,
              ...(newDescription.trim() ? { description: newDescription.trim() } : {}),
            });
          }}
          style={{
            marginTop: 14,
            display: "flex",
            flexDirection: "column",
            gap: 14,
            maxWidth: 480,
          }}
        >
          <Field id="flag-key" label="Key">
            <input
              id="flag-key"
              style={inputStyle}
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="a-z, 0-9, _ (3–64 chars)"
            />
          </Field>
          <Field id="flag-description" label="Description">
            <input
              id="flag-description"
              style={inputStyle}
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
            />
          </Field>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              id="flag-enabled"
              type="checkbox"
              checked={newEnabled}
              onChange={(e) => setNewEnabled(e.target.checked)}
            />
            <label htmlFor="flag-enabled" style={{ fontSize: 13 }}>
              Enabled
            </label>
          </div>
          <div>
            <button className="btn btn-primary" type="submit">
              Create flag
            </button>
          </div>
        </form>
      </article>
    </div>
  );
}
