import "server-only";
import { COMMUNITY_BACKED_THRESHOLD } from "@/lib/gov/types";
import { sumCoin } from "./amounts";

/**
 * Wave 16 — the public projection of a FundraisingProject row. Aggregates are
 * computed here from the INCLUDED pledge/endorsement rows so the list and
 * detail routes serialize identically; only the caller's OWN pledge ever
 * leaves the server through this shape (the creator ledger is a separate,
 * creator-gated serialization in the detail route).
 */

export interface PledgeSlice {
  userId: string;
  amountCoin: string;
  note: string | null;
  status: string;
}

export interface EndorsementSlice {
  userId: string;
}

export interface ProjectRow {
  id: string;
  creatorUserId: string;
  title: string;
  summary: string;
  category: string;
  goalCoin: string;
  treasuryAddress: string | null;
  status: string;
  createdAt: Date;
  pledges: PledgeSlice[];
  endorsements: EndorsementSlice[];
}

export interface ProjectItem {
  id: string;
  title: string;
  summary: string;
  category: string;
  goalCoin: string;
  treasuryAddress: string | null;
  status: string;
  createdAt: string;
  creatorDisplay: string;
  pledgedTotalCoin: string;
  pledgeCount: number;
  endorsementCount: number;
  communityBacked: boolean;
  myPledge: { amountCoin: string; note: string | null; status: string } | null;
  myEndorsement: boolean;
  mine: boolean;
}

export function projectItem(
  row: ProjectRow,
  viewerId: string,
  creatorDisplay: string,
): ProjectItem {
  const pledged = row.pledges.filter((p) => p.status === "PLEDGED");
  const myRow = row.pledges.find((p) => p.userId === viewerId) ?? null;
  const endorsementCount = row.endorsements.length;
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    category: row.category,
    goalCoin: row.goalCoin,
    treasuryAddress: row.treasuryAddress,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    creatorDisplay,
    pledgedTotalCoin: sumCoin(pledged.map((p) => p.amountCoin)),
    pledgeCount: pledged.length,
    endorsementCount,
    communityBacked: endorsementCount >= COMMUNITY_BACKED_THRESHOLD,
    myPledge: myRow
      ? { amountCoin: myRow.amountCoin, note: myRow.note, status: myRow.status }
      : null,
    myEndorsement: row.endorsements.some((e) => e.userId === viewerId),
    mine: row.creatorUserId === viewerId,
  };
}

/** The prisma `include` that feeds projectItem — one query, no N+1. */
export const PROJECT_INCLUDE = {
  pledges: { select: { userId: true, amountCoin: true, note: true, status: true } },
  endorsements: { select: { userId: true } },
} as const;
