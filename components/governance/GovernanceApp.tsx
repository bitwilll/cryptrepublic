"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { activeChain } from "@/lib/config/chain";
import { useCitizen } from "@/components/shell/SessionCitizenProvider";
import { useChainInfo } from "@/lib/hooks/useChainInfo";
import { isUnlocked, unlock } from "@/lib/wallet/embedded/session";
import { readMyVote } from "@/lib/governance/client";
import { castVoteEmbedded } from "@/lib/governance/write";
import { VOTE } from "@/lib/governance/abi";
import { TxButton } from "@/components/ui/TxButton";
import { UnlockWalletModal } from "@/components/wallet/UnlockWalletModal";

/**
 * Governance / Constitution & votes (§7.8) client island. The amendment list +
 * detail merge DB content (title/tag/body) with on-chain tallies + state
 * (getVotes + state — trustless; a fresh chain shows an honest "no open
 * amendments" empty state, never the mockup's 5 hardcoded amendments). Casting a
 * vote is passport-gated (weight 1): resolve tokenId via useCitizen() and run
 * castVoteEmbedded through <TxButton>; a non-citizen sees DISABLED vote buttons
 * with a mint nudge.
 */

interface Tally {
  forVotes: string;
  againstVotes: string;
  abstainVotes: string;
  snapshotCitizens: string;
}
interface Proposal {
  proposalId: string;
  state: string;
  tally: Tally;
  start: string;
  end: string;
  proposer: string;
  descriptionHash: string;
  title: string | null;
  tag: string | null;
  body: string | null;
}

type Load<T> = { status: "loading" } | { status: "ok"; data: T } | { status: "error" };

export function GovernanceApp() {
  const chainId = activeChain().primaryChainId;
  const { isCitizen, tokenId } = useCitizen();
  const chain = useChainInfo();

  const [proposals, setProposals] = useState<Load<Proposal[]>>({ status: "loading" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showUnlock, setShowUnlock] = useState(false);

  const loadProposals = useCallback(() => {
    setProposals({ status: "loading" });
    fetch("/api/governance/proposals?status=all")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d: { proposals?: Proposal[] }) => {
        const list = Array.isArray(d.proposals) ? d.proposals : [];
        setProposals({ status: "ok", data: list });
        setSelectedId((prev) => prev ?? list[0]?.proposalId ?? null);
      })
      .catch(() => setProposals({ status: "error" }));
  }, []);

  useEffect(() => {
    loadProposals();
  }, [loadProposals]);

  const requireReady = useCallback((): boolean => {
    if (isUnlocked()) return true;
    setShowUnlock(true);
    return false;
  }, []);

  const onUnlock = useCallback(async (pass: string) => {
    await unlock(pass);
    setShowUnlock(false);
  }, []);

  const selected =
    proposals.status === "ok"
      ? (proposals.data.find((p) => p.proposalId === selectedId) ?? null)
      : null;

  return (
    <div className="wrap" style={{ padding: "32px 0" }}>
      <div className="kicker">CONSTITUTION &amp; VOTES</div>
      <h1 style={{ marginTop: 12, marginBottom: 20 }}>Amendments in session</h1>

      {proposals.status === "loading" && <Skeleton lines={5} />}
      {proposals.status === "error" && (
        <CardError onRetry={loadProposals} testid="amendments-error" />
      )}
      {proposals.status === "ok" && proposals.data.length === 0 && (
        <p data-testid="amendments-empty" style={{ color: "var(--muted)" }}>
          No open amendments. The floor is quiet — no proposal has been raised on chain yet.
        </p>
      )}

      {proposals.status === "ok" && proposals.data.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "300px minmax(0, 1fr)",
            gap: 24,
            alignItems: "start",
          }}
        >
          <AmendmentList
            proposals={proposals.data}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
          {selected && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
              <AmendmentDetail proposal={selected} />
              <CastVotePanel
                chainId={chainId}
                proposal={selected}
                isCitizen={isCitizen}
                tokenId={tokenId}
                requireReady={requireReady}
                explorerBase={chain.explorerBase}
                onVoted={loadProposals}
              />
              <DissentThread proposalId={selected.proposalId} isCitizen={isCitizen} />
            </div>
          )}
        </div>
      )}

      {showUnlock && (
        <UnlockWalletModal onUnlock={onUnlock} onCancel={() => setShowUnlock(false)} />
      )}
    </div>
  );
}

function AmendmentList({
  proposals,
  selectedId,
  onSelect,
}: {
  proposals: Proposal[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <article className="pillar" style={{ padding: 0, alignSelf: "start" }}>
      <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--line)" }}>
        <div
          style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.12em", fontWeight: 700 }}
        >
          AMENDMENTS · {proposals.length}
        </div>
      </div>
      {proposals.map((p) => {
        const sel = p.proposalId === selectedId;
        return (
          <button
            key={p.proposalId}
            type="button"
            onClick={() => onSelect(p.proposalId)}
            aria-current={sel ? "true" : undefined}
            style={{
              width: "100%",
              textAlign: "left",
              display: "flex",
              flexDirection: "column",
              gap: 4,
              padding: "12px 16px",
              border: "none",
              borderTop: "1px solid var(--line)",
              borderLeft: sel ? "3px solid var(--gold)" : "3px solid transparent",
              background: sel ? "var(--paper)" : "transparent",
              cursor: "pointer",
              font: "inherit",
              color: "var(--ink)",
            }}
          >
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 11,
                  color: "var(--gold)",
                  fontWeight: 700,
                }}
              >
                #{p.proposalId}
              </span>
              {p.tag && <Chip>{p.tag}</Chip>}
              <StateChip state={p.state} />
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3 }}>
              {p.title ?? `Proposal #${p.proposalId}`}
            </div>
          </button>
        );
      })}
    </article>
  );
}

function AmendmentDetail({ proposal }: { proposal: Proposal }) {
  return (
    <article className="pillar" style={{ padding: "28px 32px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <StateChip state={proposal.state} />
        {proposal.tag && <Chip>{proposal.tag}</Chip>}
      </div>
      <h2 style={{ margin: "14px 0 0", fontSize: 30 }}>
        <span style={{ color: "var(--gold)" }}>#{proposal.proposalId}.</span>{" "}
        {proposal.title ?? `Proposal #${proposal.proposalId}`}
      </h2>
      {proposal.body && (
        <p style={{ color: "var(--muted)", lineHeight: 1.6, marginTop: 16, maxWidth: 720 }}>
          {proposal.body}
        </p>
      )}
      <VoteTally tally={proposal.tally} />
    </article>
  );
}

function VoteTally({ tally }: { tally: Tally }) {
  const forV = Number(tally.forVotes);
  const against = Number(tally.againstVotes);
  const abstain = Number(tally.abstainVotes);
  const total = forV + against + abstain;
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);
  return (
    <div data-testid="vote-tally" style={{ marginTop: 24 }}>
      <div
        style={{ fontSize: 11, color: "var(--muted)", letterSpacing: "0.12em", fontWeight: 700 }}
      >
        CURRENT TALLY · {total} VOTES CAST · SNAPSHOT {tally.snapshotCitizens} CITIZENS
      </div>
      <div
        style={{
          marginTop: 10,
          height: 14,
          display: "flex",
          overflow: "hidden",
          background: "var(--paper)",
          border: "1px solid var(--line)",
        }}
      >
        <div style={{ width: `${pct(forV)}%`, background: "var(--success)" }} />
        <div style={{ width: `${pct(against)}%`, background: "var(--gold)" }} />
        <div style={{ width: `${pct(abstain)}%`, background: "var(--muted)", opacity: 0.5 }} />
      </div>
      <div
        style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}
      >
        <TallyCell label="FOR" n={forV} color="var(--success)" pct={pct(forV)} />
        <TallyCell label="AGAINST" n={against} color="var(--gold)" pct={pct(against)} />
        <TallyCell label="ABSTAIN" n={abstain} color="var(--muted)" pct={pct(abstain)} />
      </div>
    </div>
  );
}

function TallyCell({
  label,
  n,
  color,
  pct,
}: {
  label: string;
  n: number;
  color: string;
  pct: number;
}) {
  return (
    <div
      style={{
        padding: "10px 12px",
        background: "var(--paper)",
        border: "1px solid var(--line)",
        borderLeft: `3px solid ${color}`,
      }}
    >
      <div
        style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.08em", fontWeight: 700 }}
      >
        {label}
      </div>
      <div
        style={{ fontSize: 22, fontWeight: 800, color, marginTop: 2, fontFamily: "var(--mono)" }}
      >
        {n}
      </div>
      <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--mono)" }}>
        {pct.toFixed(1)}%
      </div>
    </div>
  );
}

function CastVotePanel({
  chainId,
  proposal,
  isCitizen,
  tokenId,
  requireReady,
  explorerBase,
  onVoted,
}: {
  chainId: number;
  proposal: Proposal;
  isCitizen: boolean;
  tokenId: bigint | null;
  requireReady: () => boolean;
  explorerBase: string | null;
  onVoted: () => void;
}) {
  const [myVote, setMyVote] = useState<number | null>(null);
  const proposalId = BigInt(proposal.proposalId);
  const canVote = isCitizen && tokenId !== null && proposal.state === "Active";

  useEffect(() => {
    let alive = true;
    if (!isCitizen || tokenId === null) {
      setMyVote(null);
      return;
    }
    readMyVote(chainId, proposalId, tokenId)
      .then((v) => alive && setMyVote(v))
      .catch(() => alive && setMyVote(null));
    return () => {
      alive = false;
    };
  }, [chainId, proposalId, tokenId, isCitizen]);

  const alreadyVoted = myVote != null && myVote !== VOTE.None;

  const choices: Array<{ label: string; support: number }> = [
    { label: "Vote YEA", support: VOTE.For },
    { label: "Vote NAY", support: VOTE.Against },
    { label: "Abstain", support: VOTE.Abstain },
  ];

  return (
    <article className="pillar" data-testid="cast-vote-panel" style={{ padding: "24px 28px" }}>
      <div
        style={{ fontSize: 11, color: "var(--muted)", letterSpacing: "0.12em", fontWeight: 700 }}
      >
        YOUR OATH
      </div>
      <p style={{ color: "var(--muted)", marginTop: 8, fontSize: 13, maxWidth: 540 }}>
        Your vote is sealed on chain and immutable. Voting weight equals 1 — every citizen, one
        oath.
      </p>

      {!isCitizen && (
        <p style={{ marginTop: 10, fontSize: 13 }}>
          Mint your passport to participate.{" "}
          <Link href="/dashboard/mint">Mint your passport →</Link>
        </p>
      )}
      {isCitizen && alreadyVoted && (
        <p data-testid="already-voted" style={{ marginTop: 10, fontWeight: 700 }}>
          You voted {voteLabel(myVote)} on #{proposal.proposalId}.
        </p>
      )}
      {isCitizen && !alreadyVoted && proposal.state !== "Active" && (
        <p style={{ marginTop: 10, color: "var(--muted)", fontSize: 13 }}>
          Voting is closed for this amendment.
        </p>
      )}

      {!alreadyVoted && (
        <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
          {choices.map((c) => (
            <TxButton
              key={c.support}
              label={c.label}
              disabled={!canVote}
              disabledReason={!isCitizen ? "Mint your passport to participate" : undefined}
              requireReady={requireReady}
              explorerBase={explorerBase}
              testnet
              onRun={() => castVoteEmbedded(chainId, proposalId, tokenId as bigint, c.support)}
              onSuccess={() => {
                setMyVote(c.support);
                onVoted();
              }}
            />
          ))}
        </div>
      )}
    </article>
  );
}

interface Comment extends Record<string, unknown> {
  id: string;
  authorAddress: string;
  citizenTokenId: string | null;
  body: string;
  upvotes: number;
}

function DissentThread({ proposalId, isCitizen }: { proposalId: string; isCitizen: boolean }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/governance/proposals/${proposalId}/comments`)
      .then((r) => (r.ok ? r.json() : { comments: [] }))
      .then((d: { comments?: Comment[] }) =>
        setComments(Array.isArray(d.comments) ? d.comments : []),
      )
      .catch(() => setComments([]));
  }, [proposalId]);

  useEffect(() => {
    load();
  }, [load]);

  async function post() {
    if (!draft.trim()) return;
    setPosting(true);
    setError(null);
    try {
      const res = await fetch(`/api/governance/proposals/${proposalId}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ proposalId, body: draft.trim() }),
      });
      if (!res.ok) throw new Error("Could not post your comment.");
      setDraft("");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not post your comment.");
    } finally {
      setPosting(false);
    }
  }

  return (
    <article className="pillar" style={{ padding: "24px 28px" }}>
      <h3 style={{ margin: 0, fontSize: 20 }}>Dissent on the floor</h3>
      {comments.length === 0 ? (
        <p style={{ color: "var(--muted)", marginTop: 12, fontSize: 13 }}>
          No dissent recorded yet.
        </p>
      ) : (
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          {comments.map((c) => (
            <div
              key={c.id}
              style={{
                padding: "14px 16px",
                background: "var(--paper)",
                border: "1px solid var(--line)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "var(--mono)" }}>
                  {c.citizenTokenId ? `Citizen №${c.citizenTokenId}` : "Citizen"}
                </span>
                <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--mono)" }}>
                  ↑ {c.upvotes}
                </span>
              </div>
              <p style={{ marginTop: 6, lineHeight: 1.5 }}>{c.body}</p>
            </div>
          ))}
        </div>
      )}

      {isCitizen && (
        <div style={{ marginTop: 16 }}>
          <textarea
            data-testid="dissent-compose"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add to the record…"
            rows={3}
            style={{ width: "100%", padding: 10, border: "1px solid var(--line)", font: "inherit" }}
          />
          <button
            className="btn btn-primary"
            type="button"
            onClick={post}
            disabled={posting || !draft.trim()}
            style={{ marginTop: 8 }}
          >
            {posting ? "Posting…" : "Post"}
          </button>
          {error && (
            <p role="alert" style={{ marginTop: 8, fontSize: 12, color: "#b00020" }}>
              {error}
            </p>
          )}
        </div>
      )}
    </article>
  );
}

function voteLabel(v: number | null): string {
  switch (v) {
    case VOTE.For:
      return "FOR";
    case VOTE.Against:
      return "AGAINST";
    case VOTE.Abstain:
      return "ABSTAIN";
    default:
      return "—";
  }
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: "0.08em",
        padding: "2px 6px",
        border: "1px solid var(--line)",
        color: "var(--muted)",
      }}
    >
      {children}
    </span>
  );
}

function StateChip({ state }: { state: string }) {
  const active = state === "Active";
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: "0.08em",
        padding: "2px 6px",
        border: `1px solid ${active ? "var(--gold)" : "var(--line)"}`,
        color: active ? "var(--gold)" : "var(--muted)",
      }}
    >
      {state.toUpperCase()}
    </span>
  );
}

function Skeleton({ lines }: { lines: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          data-testid="skeleton-line"
          style={{ height: 14, background: "var(--paper)", border: "1px solid var(--line)" }}
        />
      ))}
    </div>
  );
}

function CardError({ onRetry, testid }: { onRetry: () => void; testid: string }) {
  return (
    <div data-testid={testid}>
      <p style={{ color: "var(--muted)", fontSize: 13 }}>Could not load amendments.</p>
      <button className="btn" type="button" onClick={onRetry} style={{ marginTop: 8 }}>
        Retry
      </button>
    </div>
  );
}
