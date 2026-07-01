"use client";
import type { PassportStatus } from "@/lib/passport/client";

/**
 * DISTINCT passport SBT card (NOT a generic AssetRow). Soulbound — NO send /
 * transfer affordance. When a citizen: shows the tokenId / citizen number with a
 * "SOULBOUND · NON-TRANSFERABLE" badge. When not: a subdued "No passport minted"
 * state linking to /dashboard/mint.
 *
 * Graceful degradation (finding #14): on an unregistered chain `readPassportStatus`
 * throws; the orchestrator catches it and passes `unavailable`, and this card
 * renders a subdued "Passport unavailable on this network" state — never crashes.
 */
export function PassportAssetCard({
  passport,
  unavailable,
}: {
  passport: PassportStatus | null;
  unavailable: boolean;
}) {
  return (
    <article className="pillar" style={{ padding: "18px 22px" }} data-testid="passport-card">
      <div style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.12em", fontWeight: 700 }}>
        CITIZEN PASSPORT · SOULBOUND
      </div>

      {unavailable ? (
        <p data-testid="passport-unavailable" style={{ marginTop: 12, color: "var(--muted)", fontSize: 13 }}>
          Passport unavailable on this network.
        </p>
      ) : passport?.isCitizen ? (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 22, fontWeight: 800 }} data-testid="passport-token">
              {passport.tokenId !== undefined ? `Citizen #${passport.tokenId.toString()}` : "Citizen"}
            </span>
            <span
              data-testid="soulbound-badge"
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.08em",
                color: "var(--gold)",
                border: "1px solid var(--gold)",
                padding: "2px 8px",
              }}
            >
              SOULBOUND · NON-TRANSFERABLE
            </span>
          </div>
          <p style={{ marginTop: 8, fontSize: 12, color: "var(--muted)" }}>
            Your passport is a non-transferable SBT. It cannot be sent, sold, or bridged.
          </p>
        </div>
      ) : (
        <div style={{ marginTop: 12 }}>
          <p style={{ color: "var(--muted)", fontSize: 13 }}>No passport minted.</p>
          <a
            data-testid="passport-mint-link"
            className="btn btn-primary"
            href="/dashboard/mint"
            style={{ marginTop: 12, display: "inline-flex" }}
          >
            Mint Your Passport
          </a>
        </div>
      )}
    </article>
  );
}
