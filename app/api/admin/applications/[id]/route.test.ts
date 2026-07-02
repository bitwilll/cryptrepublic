// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { getAddress } from "viem";
import { prisma } from "@/lib/db";
import { __resetRateLimit } from "@/lib/auth/ratelimit";
import {
  seedAdminFixtures,
  cleanupAdminFixtures,
  adminGet,
  expectNoSecretKeys,
  type AdminFixtures,
} from "@/test/adminTestUtils";
import { GET } from "./route";

/** Unique checksummed address per run (LinkedWallet.address is @unique). */
function randomAddress(): `0x${string}` {
  const hex = Array.from(
    { length: 40 },
    () => "0123456789abcdef"[Math.floor(Math.random() * 16)],
  ).join("");
  return getAddress(`0x${hex}`);
}

let f: AdminFixtures;
let applicantId: string;
let appId: string;
const verifiedWalletAddress = randomAddress();
let verifiedNoSnapshotUserId: string;
let verifiedNoSnapshotAppId: string;
let staleSnapshotUserId: string;
let staleSnapshotAppId: string;

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

interface DetailBody {
  application: {
    id: string;
    status: string;
    kycStatus: string;
    reviewNote: string | null;
    user: { email: string | null; name: string | null };
    witnessSignatures: Array<{
      witnessAddress: string;
      signature: string;
      nonce: string;
      deadline: string;
    }>;
    chainCache: {
      chainDerived: true;
      sealTxHash: string | null;
      citizenTokenId: string | null;
      sealedAt: string | null;
    };
  };
}

describe("GET /api/admin/applications/[id]", () => {
  beforeAll(async () => {
    f = await seedAdminFixtures("adm-app-detail");
    const applicant = await prisma.user.create({
      data: {
        email: `adm-app-detail-${Date.now()}@w9adm.example`,
        application: {
          create: {
            status: "WITNESSED",
            name: "Ada L.",
            domicileCity: "Lagos",
            hostCountry: "Nigeria",
            sealTxHash: "0xseal",
            citizenTokenId: "12",
            witnessSignatures: {
              create: {
                witnessAddress: "0x00000000000000000000000000000000000000AA",
                signature: "0xsig",
                nonce: "1",
                deadline: "9999999999",
              },
            },
          },
        },
      },
      include: { application: true },
    });
    applicantId = applicant.id;
    appId = applicant.application!.id;

    // Wave 10 A4 — the witness-FREE case: a VERIFIED wallet, but the stored
    // applicantAddress snapshot is null (the user never ran the witness flow).
    const verifiedNoSnapshot = await prisma.user.create({
      data: {
        email: `adm-app-detail-vns-${Date.now()}@w10adm.example`,
        linkedWallets: {
          create: { address: verifiedWalletAddress, chain: "EVM", verifiedAt: new Date() },
        },
        application: {
          create: { status: "OATH_ACCEPTED", name: "Verified NoSnapshot", applicantAddress: null },
        },
      },
      include: { application: true },
    });
    verifiedNoSnapshotUserId = verifiedNoSnapshot.id;
    verifiedNoSnapshotAppId = verifiedNoSnapshot.application!.id;

    // A STALE applicantAddress snapshot but NO verified wallet — must NOT be mintable.
    const staleSnapshot = await prisma.user.create({
      data: {
        email: `adm-app-detail-stale-${Date.now()}@w10adm.example`,
        application: {
          create: {
            status: "OATH_ACCEPTED",
            name: "Stale Snapshot",
            applicantAddress: randomAddress(),
          },
        },
      },
      include: { application: true },
    });
    staleSnapshotUserId = staleSnapshot.id;
    staleSnapshotAppId = staleSnapshot.application!.id;
  });

  beforeEach(() => __resetRateLimit());

  it("401 / 401-suspended / 403-role / 404 standard cases", async () => {
    expect((await GET(adminGet(`/api/admin/applications/${appId}`), params(appId))).status).toBe(
      401,
    );
    expect(
      (
        await GET(
          adminGet(`/api/admin/applications/${appId}`, f.suspendedAdminToken),
          params(appId),
        )
      ).status,
    ).toBe(401);
    expect(
      (await GET(adminGet(`/api/admin/applications/${appId}`, f.userToken), params(appId))).status,
    ).toBe(403);
    expect(
      (await GET(adminGet(`/api/admin/applications/nope`, f.adminToken), params("nope"))).status,
    ).toBe(404);
  });

  it("returns the full application incl. witness signatures (PUBLIC data) + chainDerived labels — no secrets", async () => {
    const res = await GET(
      adminGet(`/api/admin/applications/${appId}`, f.adminToken),
      params(appId),
    );
    expect(res.status).toBe(200);
    const raw = await res.text();
    expectNoSecretKeys(raw);
    const body = JSON.parse(raw) as DetailBody;
    expect(body.application.id).toBe(appId);
    expect(body.application.status).toBe("WITNESSED");
    expect(body.application.user.email).toContain("adm-app-detail-");
    expect(body.application.witnessSignatures.length).toBe(1);
    expect(body.application.witnessSignatures[0].witnessAddress).toBe(
      "0x00000000000000000000000000000000000000AA",
    );
    expect(body.application.chainCache.chainDerived).toBe(true);
    expect(body.application.chainCache.sealTxHash).toBe("0xseal");
    expect(body.application.chainCache.citizenTokenId).toBe("12");
  });

  it("resolvedMintTo: a verified-wallet user with applicantAddress==null STILL yields the live-resolved address (Wave 10)", async () => {
    const res = await GET(
      adminGet(`/api/admin/applications/${verifiedNoSnapshotAppId}`, f.adminToken),
      params(verifiedNoSnapshotAppId),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      application: { applicantAddress: string | null; resolvedMintTo: string | null };
    };
    // The mint gate source is the LIVE resolution, not the stale column.
    expect(body.application.applicantAddress).toBeNull();
    expect(body.application.resolvedMintTo).toBe(verifiedWalletAddress);
  });

  it("resolvedMintTo is null when there is NO verified wallet — even with a stale applicantAddress present (Wave 10)", async () => {
    const res = await GET(
      adminGet(`/api/admin/applications/${staleSnapshotAppId}`, f.adminToken),
      params(staleSnapshotAppId),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      application: { applicantAddress: string | null; resolvedMintTo: string | null };
    };
    expect(body.application.applicantAddress).not.toBeNull(); // the stale snapshot exists…
    expect(body.application.resolvedMintTo).toBeNull(); // …but it is NOT a mint destination.
  });

  afterAll(async () => {
    await cleanupAdminFixtures(f, [applicantId, verifiedNoSnapshotUserId, staleSnapshotUserId]);
    await prisma.$disconnect();
  });
});
